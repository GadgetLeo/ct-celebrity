import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Hourglass,
  LockKeyhole,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle
} from 'lucide-react';
import { usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, encodeFunctionData, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import rounds from './data/rounds.json';
import { CT_GUESS_GAME_ABI } from './lib/contract';
import type { Round, RoundOption, SubmitState } from './lib/types';

const CONTRACT_ADDRESS = import.meta.env.VITE_GAME_CONTRACT_ADDRESS as `0x${string}` | undefined;
const ROUND_SECONDS_FALLBACK = 300;
type PreparedGuess = {
  roundId: number;
  option: number;
  encryptedGuess: unknown;
};

type CofheRuntime = {
  walletAddress: `0x${string}`;
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  cofheClient: any;
};

let cofheModulesPromise: Promise<{
  web: typeof import('@cofhe/sdk/web');
  sdk: typeof import('@cofhe/sdk');
  chains: typeof import('@cofhe/sdk/chains');
}> | null = null;

function loadCofheModules() {
  cofheModulesPromise ??= Promise.all([
    import('@cofhe/sdk/web'),
    import('@cofhe/sdk'),
    import('@cofhe/sdk/chains')
  ]).then(([web, sdk, chains]) => ({ web, sdk, chains }));

  return cofheModulesPromise;
}

function pickRound(excludeId?: number): Round {
  const available = (rounds as Round[]).filter((round) => round.id !== excludeId);
  const pool = available.length ? available : (rounds as Round[]);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getOptionHandle(option: RoundOption) {
  return typeof option === 'string' ? option : option.handle;
}

function getOptionAvatar(option: RoundOption) {
  return typeof option === 'string' ? undefined : option.avatar;
}

async function pickUnplayedRound(player: `0x${string}`, excludeId?: number) {
  const available = (rounds as Round[]).filter((candidate) => candidate.id !== excludeId);
  const pool = available.length ? available : (rounds as Round[]);
  const attempts = await Promise.all(
    pool.map(async (candidate) => ({
      round: candidate,
      submitted: await hasSubmittedAttempt(candidate.id, player).catch(() => false)
    }))
  );
  const unplayed = attempts.filter((attempt) => !attempt.submitted).map((attempt) => attempt.round);

  if (!unplayed.length) return null;
  return unplayed[Math.floor(Math.random() * unplayed.length)];
}

function friendlySubmitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/user rejected|denied|cancel/i.test(message)) {
    return 'Transaction cancelled. Your pick was not submitted.';
  }

  if (/No Privy embedded wallet/i.test(message)) {
    return 'Wallet setup is still finishing. Try again in a moment.';
  }

  if (/already submitted|DuplicateSubmission/i.test(message)) {
    return 'This wallet already played this celebrity. Start a new round.';
  }

  if (/network|fetch|timeout/i.test(message)) {
    return 'Network hiccup while checking your result. Try again.';
  }

  return "Couldn't submit. Try again.";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function createGamePublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org')
  });
}

async function hasSubmittedAttempt(roundId: number, player: `0x${string}`) {
  if (!CONTRACT_ADDRESS) return false;

  const publicClient = createGamePublicClient();
  const attempt = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: CT_GUESS_GAME_ABI,
    functionName: 'getAttempt',
    args: [BigInt(roundId), player]
  });

  return attempt[0];
}

async function waitForAttemptSubmission(
  publicClient: {
    readContract: ReturnType<typeof createPublicClient>['readContract'];
  },
  roundId: number,
  player: `0x${string}`
) {
  for (const delay of [1200, 2200, 3500, 5000]) {
    const attempt = await publicClient.readContract({
      address: CONTRACT_ADDRESS!,
      abi: CT_GUESS_GAME_ABI,
      functionName: 'getAttempt',
      args: [BigInt(roundId), player]
    });

    if (attempt[0]) return true;
    await wait(delay);
  }

  return false;
}

export default function App() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const [round, setRound] = useState<Round>(() => pickRound());
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(round.durationSeconds || ROUND_SECONDS_FALLBACK);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [preparedGuess, setPreparedGuess] = useState<PreparedGuess | null>(null);
  const [hasPlayableRound, setHasPlayableRound] = useState(true);
  const runtimeRef = useRef<CofheRuntime | null>(null);
  const runtimePromiseRef = useRef<Promise<CofheRuntime> | null>(null);

  const selectedAccount = selectedOption === null ? null : getOptionHandle(round.options[selectedOption]);
  const isMissingConfig = !CONTRACT_ADDRESS || import.meta.env.VITE_PRIVY_APP_ID === undefined;
  const canPlayWithoutWallet = isMissingConfig;
  const selectedGuessReady =
    isMissingConfig ||
    (
      selectedOption !== null &&
      preparedGuess?.roundId === round.id &&
      preparedGuess.option === selectedOption
    );
  const canSubmit =
    (authenticated || canPlayWithoutWallet) &&
    selectedOption !== null &&
    secondsLeft > 0 &&
    hasPlayableRound &&
    selectedGuessReady &&
    submitState !== 'encrypting' &&
    submitState !== 'submitting' &&
    isCorrect === null;

  const timerTone = secondsLeft <= 15 ? 'danger' : secondsLeft <= 30 ? 'warn' : 'calm';

  const walletAddress = useMemo(() => {
    const wallet = wallets.find((item) => item.walletClientType === 'privy') || wallets[0];
    return wallet?.address;
  }, [wallets]);

  const gameWallet = useMemo(
    () => wallets.find((item) => item.walletClientType === 'privy') || wallets[0],
    [wallets]
  );

  function selectOption(option: number) {
    setSelectedOption(option);
    setPreparedGuess(null);
    setSubmitState('idle');
    setStatusMessage('Getting your answer ready...');
  }

  async function getCofheRuntime() {
    if (!gameWallet) throw new Error('No wallet available.');

    const walletAddress = gameWallet.address as `0x${string}`;
    const currentRuntime = runtimeRef.current;
    if (currentRuntime?.walletAddress === walletAddress) {
      return currentRuntime;
    }

    if (runtimePromiseRef.current) {
      return runtimePromiseRef.current;
    }

    runtimePromiseRef.current = (async () => {
      const provider = await gameWallet.getEthereumProvider();
      await provider.request?.({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${baseSepolia.id.toString(16)}` }]
      }).catch(() => undefined);

      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org')
      });
      const walletClient = createWalletClient({
        account: walletAddress,
        chain: baseSepolia,
        transport: custom(provider)
      });
      const { web, chains } = await loadCofheModules();
      const cofheClient = web.createCofheClient(web.createCofheConfig({
        supportedChains: [chains.chains.baseSepolia]
      }));

      await cofheClient.connect(publicClient as never, walletClient as never);

      const runtime: CofheRuntime = {
        walletAddress,
        publicClient: publicClient as CofheRuntime['publicClient'],
        walletClient: walletClient as CofheRuntime['walletClient'],
        cofheClient
      };
      runtimeRef.current = runtime;
      runtimePromiseRef.current = null;
      return runtime;
    })().catch((error) => {
      runtimePromiseRef.current = null;
      throw error;
    });

    return runtimePromiseRef.current;
  }

  async function encryptGuessForWallet(option: number) {
    const { cofheClient } = await getCofheRuntime();
    const { sdk } = await loadCofheModules();
    const [encryptedGuess] = await cofheClient
      .encryptInputs([sdk.Encryptable.uint8(BigInt(option))])
      .execute();

    return encryptedGuess;
  }

  useEffect(() => {
    if ((!authenticated && !canPlayWithoutWallet) || isCorrect !== null || secondsLeft <= 0) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [authenticated, canPlayWithoutWallet, isCorrect, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && isCorrect === null) {
      setSubmitState('timeout');
      setStatusMessage("Time's up. The celeb stays hidden.");
    }
  }, [secondsLeft, isCorrect]);

  useEffect(() => {
    runtimeRef.current = null;
    runtimePromiseRef.current = null;
    setPreparedGuess(null);
  }, [gameWallet?.address]);

  useEffect(() => {
    if (isMissingConfig || !authenticated || !gameWallet) return;

    let cancelled = false;

    async function refreshPlayableRound() {
      const submitted = await hasSubmittedAttempt(round.id, gameWallet!.address as `0x${string}`).catch(() => false);
      if (cancelled || !submitted) {
        if (!cancelled) setHasPlayableRound(true);
        return;
      }

      await resetRound();
    }

    refreshPlayableRound();

    return () => {
      cancelled = true;
    };
  }, [authenticated, gameWallet?.address, isMissingConfig]);


  useEffect(() => {
    if (isMissingConfig || !authenticated || !gameWallet || isCorrect !== null) return;

    const warmup = () => {
      getCofheRuntime().catch(() => undefined);
    };

    const handle = globalThis.setTimeout(warmup, 0);
    return () => globalThis.clearTimeout(handle);
  }, [isMissingConfig, authenticated, gameWallet, isCorrect]);

  useEffect(() => {
    let cancelled = false;

    async function prepareGuess() {
      if (
        selectedOption === null ||
        isMissingConfig ||
        !authenticated ||
        !gameWallet ||
        isCorrect !== null ||
        secondsLeft <= 0
      ) {
        setPreparedGuess(null);
        return;
      }

      setPreparedGuess(null);
      setStatusMessage('Getting your answer ready...');

      try {
        await waitForPaint();
        await wait(120);
        if (cancelled) return;

        setStatusMessage('Encrypting this answer in the background...');
        const encryptedGuess = await encryptGuessForWallet(selectedOption);
        if (cancelled) return;
        setPreparedGuess({
          roundId: round.id,
          option: selectedOption,
          encryptedGuess
        });
        setStatusMessage('Private pick ready. One approval left.');
      } catch {
        if (cancelled) return;
        setPreparedGuess(null);
        setStatusMessage('');
      }
    }

    prepareGuess();

    return () => {
      cancelled = true;
    };
  }, [selectedOption, round.id, isMissingConfig, authenticated, gameWallet, isCorrect]);

  async function resetRound() {
    setStatusMessage('Finding a fresh celebrity...');
    const nextRound =
      !isMissingConfig && gameWallet
        ? await pickUnplayedRound(gameWallet.address as `0x${string}`, round.id)
        : pickRound(round.id);

    if (!nextRound) {
      setSelectedOption(null);
      setSubmitState('error');
      setStatusMessage("You've played every celebrity available right now.");
      setHasPlayableRound(false);
      setPreparedGuess(null);
      return;
    }

    setRound(nextRound);
    setSelectedOption(null);
    setSecondsLeft(nextRound.durationSeconds || ROUND_SECONDS_FALLBACK);
    setSubmitState('idle');
    setStatusMessage('');
    setIsCorrect(null);
    setPreparedGuess(null);
    setHasPlayableRound(true);
  }

  async function submitGuess() {
    if (!canSubmit || selectedOption === null) return;

    setSubmitState('submitting');
    setStatusMessage('Opening approval...');

    try {
      if (isMissingConfig) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        const simulatedResult = selectedOption === round.correctOptionIndex;
        setIsCorrect(simulatedResult);
        setSubmitState(simulatedResult ? 'correct' : 'incorrect');
        setStatusMessage(
          simulatedResult ? 'Correct. Celeb revealed.' : 'Incorrect. The celeb stays hidden.'
        );
        return;
      }

      const embeddedWallet = wallets.find((item) => item.walletClientType === 'privy');
      const wallet = gameWallet;
      if (!wallet) throw new Error('No wallet available.');

      if (preparedGuess?.roundId !== round.id || preparedGuess.option !== selectedOption) {
        setSubmitState('idle');
        setStatusMessage('Still preparing your private pick. Try again in a moment.');
        return;
      }

      const encryptedGuess = preparedGuess.encryptedGuess;
      const publicClient = createGamePublicClient();

      setStatusMessage('Approval is ready. Confirm once to lock in your pick.');

      const data = encodeFunctionData({
        abi: CT_GUESS_GAME_ABI,
        functionName: 'submitGuess',
        args: [BigInt(round.id), encryptedGuess as never]
      });

      const receipt = embeddedWallet
        ? await sendTransaction(
            {
              to: CONTRACT_ADDRESS,
              data,
              chainId: baseSepolia.id
            },
            {
              sponsor: true,
              address: wallet.address
            }
          )
        : await (async () => {
            const provider = await wallet.getEthereumProvider();
            const walletClient = createWalletClient({
              account: wallet.address as `0x${string}`,
              chain: baseSepolia,
              transport: custom(provider)
            });

            return walletClient.sendTransaction({
              account: wallet.address as `0x${string}`,
              to: CONTRACT_ADDRESS,
              data,
              chain: baseSepolia
            }).then((hash: `0x${string}`) => ({ hash }));
          })();

      setStatusMessage('Pick submitted. Waiting for Base Sepolia confirmation...');
      const confirmedReceipt = await publicClient.waitForTransactionReceipt({
        hash: receipt.hash,
        confirmations: 1,
        timeout: 90_000
      });

      if (confirmedReceipt.status !== 'success') {
        throw new Error('Transaction reverted after approval.');
      }

      setStatusMessage('Guess confirmed. Checking the reveal...');
      await waitForAttemptSubmission(
        publicClient,
        round.id,
        wallet.address as `0x${string}`
      );

      const finalResult = selectedOption === round.correctOptionIndex;

      setIsCorrect(finalResult);
      setSubmitState(finalResult ? 'correct' : 'incorrect');
      setStatusMessage(finalResult ? 'Correct. Celeb revealed.' : 'Incorrect. The celeb stays hidden.');
    } catch (error) {
      console.error(error);
      setSubmitState('error');
      setStatusMessage(friendlySubmitError(error));
    }
  }

  if (!ready) {
    return (
      <main className="app-shell center-shell">
        <div className="loading-mark" aria-hidden="true" />
        <p>Loading game...</p>
      </main>
    );
  }

  return (
    <main className={`app-shell ${authenticated || canPlayWithoutWallet ? 'has-rail' : ''}`}>
      {(authenticated || canPlayWithoutWallet) && <BrandAside />}
      <section className="hero-panel">
        <div className="brand-row">
          <div className="brand-lock" aria-hidden="true">
            <LockKeyhole size={20} />
          </div>
          <span>CT Celebrity Guess</span>
          <span className="brand-row-spacer" aria-hidden="true" />
          <span className="brand-meta">Encrypted reveal</span>
        </div>

        {!authenticated && !canPlayWithoutWallet ? (
          <div className="landing-copy">
            <div className="mystery-orbit" aria-hidden="true">
              <span className="flash-card flash-card-a">@?????</span>
              <span className="mystery-avatar">?</span>
              <span className="flash-card flash-card-b">5 hints</span>
            </div>
            <p className="eyebrow">CT celebrity quiz</p>
            <h1>Guess the CT celebrity.</h1>
            <p>
              Five timeline hints, three familiar accounts, one private pick. Sign in and play the reveal.
            </p>
            <button className="primary-action" onClick={login}>
              <Play size={20} />
              <span>Start the quiz</span>
            </button>
          </div>
        ) : (
          <GameBoard
            round={round}
            selectedOption={selectedOption}
            selectOption={selectOption}
            selectedAccount={selectedAccount}
            secondsLeft={secondsLeft}
            timerTone={timerTone}
            canSubmit={canSubmit}
            selectedGuessReady={selectedGuessReady}
            submitGuess={submitGuess}
            resetRound={resetRound}
            submitState={submitState}
            statusMessage={statusMessage}
            isCorrect={isCorrect}
            walletAddress={walletAddress}
            logout={logout}
            isMissingConfig={isMissingConfig}
            canPlayWithoutWallet={canPlayWithoutWallet}
          />
        )}
      </section>
    </main>
  );
}

function BrandAside() {
  return (
    <aside className="brand-aside" aria-hidden="true">
      <div className="ba-mark">
        <span className="brand-lock">
          <LockKeyhole size={22} />
        </span>
        <span>CT Celebrity Guess</span>
      </div>
      <h2>Who’s X famous?</h2>
      <p>
        A blind-item celebrity quiz powered by encrypted reveals. Five timeline hints, three familiar accounts,
        and one hidden star.
      </p>
      <div className="ba-cipher">HOT SEAT / FINAL THREE / REVEAL</div>
      <ul>
        <li>Read the blind item</li>
        <li>Pick the account before time runs out</li>
        <li>The reveal only opens if you're right</li>
      </ul>
    </aside>
  );
}

type GameBoardProps = {
  round: Round;
  selectedOption: number | null;
  selectOption: (value: number) => void;
  selectedAccount: string | null;
  secondsLeft: number;
  timerTone: string;
  canSubmit: boolean;
  selectedGuessReady: boolean;
  submitGuess: () => void;
  resetRound: () => void;
  submitState: SubmitState;
  statusMessage: string;
  isCorrect: boolean | null;
  walletAddress?: string;
  logout: () => void;
  isMissingConfig: boolean;
  canPlayWithoutWallet: boolean;
};

function GameBoard(props: GameBoardProps) {
  const {
    round,
    selectedOption,
    selectOption,
    selectedAccount,
    secondsLeft,
    timerTone,
    canSubmit,
    selectedGuessReady,
    submitGuess,
    resetRound,
    submitState,
    statusMessage,
    isCorrect,
    walletAddress,
    logout,
    isMissingConfig,
    canPlayWithoutWallet
  } = props;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  const shouldStartNewMystery = submitState === 'error' && /already played/i.test(statusMessage);
  const hasNoMysteries = submitState === 'error' && /every celebrity/i.test(statusMessage);
  const hasResultContent =
    submitState === 'encrypting' ||
    submitState === 'submitting' ||
    submitState === 'timeout' ||
    isCorrect !== null ||
    Boolean(statusMessage);

  return (
    <div className="game-board">
      <header className="game-header">
        <div className="show-title">
          <p className="eyebrow">Tonight's blind item</p>
          <h1>Who is the CT celebrity?</h1>
          <p>Read the hints, pick the account, and see the reveal only if you nailed it.</p>
        </div>
        {!canPlayWithoutWallet && <button className="ghost-action" onClick={logout}>Exit</button>}
      </header>

        <div className="status-strip">
          <div className={`timer-pill ${timerTone}`} aria-live="polite">
            <Clock3 size={18} />
            <span>{minutes}:{seconds}</span>
          </div>
          <span className="status-note">
            Celebrity #{String(round.id).padStart(2, '0')} / Final three / 5 hints
          </span>
          <div className="wallet-chip">
            {walletAddress
              ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
            : canPlayWithoutWallet
              ? 'Demo mode'
              : 'Embedded wallet'}
        </div>
      </div>

      {isMissingConfig && (
        <p className="config-note">
          Demo mode is active until Privy and contract environment values are set.
        </p>
      )}

      <div className="clue-column">
        <section className="clue-board" aria-label="Celebrity hints">
          <div className="section-heading">
            <Trophy size={18} aria-hidden="true" />
            <div>
              <p className="eyebrow">Blind item</p>
              <strong>Five hints from the timeline</strong>
            </div>
          </div>
          <div className="hint-list">
            {round.hints.map((hint, index) => (
              <article className="hint-card" key={`${round.id}-${hint}`}>
                <span>{index + 1}</span>
                <p>{hint}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="play-column">
        <section className="guess-panel" aria-label="Celebrity choices">
          <div className="section-heading">
            <Sparkles size={18} aria-hidden="true" />
            <div>
              <p className="eyebrow">Final three</p>
              <strong>Pick the celebrity</strong>
            </div>
          </div>
          <div className="options-panel">
            {round.options.map((option, index) => {
              const handle = getOptionHandle(option);
              const avatar = getOptionAvatar(option);

              return (
                <button
                  className={`option-button ${selectedOption === index ? 'selected' : ''}`}
                  key={handle}
                  onClick={() => selectOption(index)}
                  disabled={isCorrect !== null || submitState === 'timeout'}
                  aria-pressed={selectedOption === index}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  {avatar && <img className="option-avatar" src={avatar} alt="" loading="lazy" />}
                  <span className="option-text">{handle}</span>
                </button>
              );
            })}
          </div>
        </section>

        {hasResultContent && (
          <section className={`result-panel ${submitState}`} aria-live="polite">
            {(submitState === 'encrypting' || submitState === 'submitting') && (
              <div className="progress-row">
                <span className="loading-mark small-spinner" aria-hidden="true" />
                <p>{statusMessage}</p>
              </div>
            )}
            {submitState === 'timeout' && (
              <>
                <Hourglass size={24} />
                <div>
                  <strong>Time's up</strong>
                  <p>The celeb stays hidden. Start a new quiz when you're ready.</p>
                </div>
              </>
            )}
            {isCorrect === true && (
              <>
                <CheckCircle2 size={24} />
                <div>
                  <strong>Correct</strong>
                  <p>{selectedAccount} was tonight's celebrity.</p>
                </div>
              </>
            )}
            {isCorrect === false && (
              <>
                <XCircle size={24} />
                <div>
                  <strong>Incorrect</strong>
                  <p>The celeb stays hidden. Try another round.</p>
                </div>
              </>
            )}
            {isCorrect === null && !['timeout', 'encrypting', 'submitting'].includes(submitState) && statusMessage && (
              <p>{statusMessage}</p>
            )}
          </section>
        )}

        <div className="action-bar">
          {hasNoMysteries ? (
            <button className="primary-action" disabled>
              <Hourglass size={20} />
              <span>More celebs soon</span>
            </button>
          ) : isCorrect === null && submitState !== 'timeout' && !shouldStartNewMystery ? (
            <button className="primary-action" onClick={submitGuess} disabled={!canSubmit}>
              <LockKeyhole size={20} />
              <span>
                {submitState === 'encrypting' || submitState === 'submitting'
                  ? 'Working...'
                  : selectedOption !== null && !selectedGuessReady
                    ? 'Preparing private pick...'
                    : 'Approve private pick'}
              </span>
            </button>
          ) : (
            <button className="primary-action" onClick={resetRound}>
              <RotateCcw size={20} />
              <span>{submitState === 'timeout' || shouldStartNewMystery ? 'New celebrity' : 'Play another round'}</span>
            </button>
          )}
        </div>

        <section className="stage-card" aria-label="Hidden celebrity">
          <div className="stage-lights" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="case-number" aria-hidden="true">CELEB #{String(round.id).padStart(3, '0')}</div>
          <div className="mystery-card">
            <div className="mystery-avatar small" aria-hidden="true">?</div>
            <div>
              <p className="eyebrow">Hidden celebrity</p>
              <strong>{isCorrect ? selectedAccount : 'Reveal locked until a correct guess'}</strong>
            </div>
            <Sparkles size={20} aria-hidden="true" />
          </div>
          <div className="stage-marquee" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
      </div>
    </div>
  );
}
