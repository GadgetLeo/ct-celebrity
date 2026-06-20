import hre from 'hardhat';
import { expect } from 'chai';
import { CofheClient, Encryptable, FheTypes } from '@cofhe/sdk';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('CTGuessGame', () => {
  let cofheClient: CofheClient;
  let signer: HardhatEthersSigner;

  before(async () => {
    [signer] = await hre.ethers.getSigners();
    cofheClient = await hre.cofhe.createClientWithBatteries(signer);
  });

  async function deploySeededGame() {
    const Game = await hre.ethers.getContractFactory('CTGuessGame');
    const game = await Game.deploy();
    const [encryptedCorrectOption] = await cofheClient
      .encryptInputs([Encryptable.uint8(1n)])
      .execute();

    await game.createRound(
      [
        'Writes about Ethereum infrastructure',
        'Known for long technical threads',
        'Often talks about privacy',
        'Appears on crypto podcasts',
        'Comments on protocol governance'
      ],
      ['@cipheralpha', '@rollupwriter', '@liquiditysage'],
      encryptedCorrectOption,
      90
    );

    return game;
  }

  it('stores public round content', async () => {
    const game = await deploySeededGame();
    const round = await game.getRound(1);

    expect(round.active).to.equal(true);
    expect(round.duration).to.equal(90n);
    expect(round.options[1]).to.equal('@rollupwriter');
  });

  it('evaluates an encrypted correct guess', async () => {
    const game = await deploySeededGame();
    const [encryptedGuess] = await cofheClient
      .encryptInputs([Encryptable.uint8(1n)])
      .execute();

    await (await game.submitGuess(1, encryptedGuess)).wait();

    const attempt = await game.getAttempt(1, signer.address);
    const result = await cofheClient
      .decryptForView(attempt.isCorrect, FheTypes.Bool)
      .execute();

    expect(result).to.equal(true);
  });

  it('evaluates an encrypted incorrect guess', async () => {
    const game = await deploySeededGame();
    const [encryptedGuess] = await cofheClient
      .encryptInputs([Encryptable.uint8(0n)])
      .execute();

    await (await game.submitGuess(1, encryptedGuess)).wait();

    const attempt = await game.getAttempt(1, signer.address);
    const result = await cofheClient
      .decryptForView(attempt.isCorrect, FheTypes.Bool)
      .execute();

    expect(result).to.equal(false);
  });

  it('rejects duplicate submissions', async () => {
    const game = await deploySeededGame();
    const [encryptedGuess] = await cofheClient
      .encryptInputs([Encryptable.uint8(1n)])
      .execute();

    await game.submitGuess(1, encryptedGuess);
    await expect(game.submitGuess(1, encryptedGuess)).to.be.revertedWithCustomError(
      game,
      'AlreadySubmitted'
    );
  });
});
