import hre from 'hardhat';

async function main() {
  const Game = await hre.ethers.getContractFactory('CTGuessGame');
  const game = await Game.deploy();
  await game.waitForDeployment();

  const address = await game.getAddress();
  console.log(`CTGuessGame deployed to ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
