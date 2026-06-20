import hre from 'hardhat';
import { Encryptable } from '@cofhe/sdk';
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node';
import { baseSepolia as cofheBaseSepolia } from '@cofhe/sdk/chains';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const rounds = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src/data/rounds.json'), 'utf8')
);

async function main() {
  const address = process.env.GAME_CONTRACT_ADDRESS;
  if (!address) throw new Error('Set GAME_CONTRACT_ADDRESS before seeding.');
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) throw new Error('Set DEPLOYER_PRIVATE_KEY before seeding.');

  const account = privateKeyToAccount(privateKey);
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const cofheClient = createCofheClient(
    createCofheConfig({
      supportedChains: [cofheBaseSepolia],
    })
  );
  await cofheClient.connect(publicClient as never, walletClient as never);
  const game = await hre.ethers.getContractAt('CTGuessGame', address);

  for (const round of rounds) {
    const [encryptedCorrectOption] = await cofheClient
      .encryptInputs([Encryptable.uint8(BigInt(round.correctOptionIndex))])
      .execute();

    const tx = await game.createRound(
      round.hints,
      round.options,
      encryptedCorrectOption,
      round.durationSeconds
    );
    await tx.wait();
    console.log(`Seeded round ${round.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
