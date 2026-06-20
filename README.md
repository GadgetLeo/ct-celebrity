# CT Cipher Guess

A mobile-first encrypted CT personality guessing game built for Privy embedded wallets, sponsored gas, Fhenix CoFHE, and Base Sepolia.

## What It Does

- Lets players sign in with Privy instead of a wallet-connector flow.
- Shows one solo timed round with 5 hints and 3 visible CT account options.
- Encrypts the selected option with `@cofhe/sdk`.
- Sends the guess to `CTGuessGame` on Base Sepolia using Privy gas sponsorship.
- Decrypts only the player's own encrypted result for the UI.
- Reveals the selected account only when the guess is correct.
- Keeps the answer hidden when the guess is incorrect.

V1 has no pot, no paid entry, and no leaderboard.

## Project Map

- `src/App.tsx` - main mobile game flow and Privy/Fhenix transaction path.
- `src/styles.css` - mobile-first CT game show visual system.
- `src/data/rounds.json` - placeholder rounds to replace with real CT personalities.
- `src/lib/contract.ts` - frontend ABI for the contract calls.
- `contracts/CTGuessGame.sol` - Fhenix CoFHE scoring contract.
- `test/CTGuessGame.test.ts` - encrypted guess contract tests using the CoFHE Hardhat plugin.
- `scripts/deploy.ts` - deploys the game contract.
- `scripts/seed-rounds.ts` - seeds placeholder rounds onchain.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in:

```bash
VITE_PRIVY_APP_ID=
VITE_GAME_CONTRACT_ADDRESS=
VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=
```

In the Privy dashboard:

- Enable embedded wallets.
- Enable app-paid gas sponsorship.
- Add Base Sepolia as a sponsored chain.
- Allow client-side sponsored transactions if you want direct client submissions.

## Run Locally

```bash
npm run dev
```

If `VITE_PRIVY_APP_ID` or `VITE_GAME_CONTRACT_ADDRESS` is missing, the app runs in demo mode so the UI can still be reviewed.

## Contracts

Compile:

```bash
npm run compile:contracts
```

Test:

```bash
npm run test:contracts
```

Deploy to Base Sepolia:

```bash
npm run deploy:base-sepolia
```

Seed rounds after deployment:

```bash
$env:GAME_CONTRACT_ADDRESS="0x..."
npx hardhat run scripts/seed-rounds.ts --network baseSepolia
```

## Replacing Placeholder CT Data

Edit `src/data/rounds.json` with this shape:

```json
{
  "id": 1,
  "durationSeconds": 90,
  "hints": ["Hint 1", "Hint 2", "Hint 3", "Hint 4", "Hint 5"],
  "options": ["@account_one", "@account_two", "@account_three"],
  "correctOptionIndex": 1
}
```

The visible options are public by design. The submitted choice and contract scoring result are encrypted.

## Notes

- The frontend timer is a v1 UX timer. If you want contract-enforced per-player deadlines later, add a `startRound` transaction that stores each player's start time before they can submit.
- Seed scripts encrypt each correct option before creating the round, so the contract stores only the encrypted comparison target.
