import { ethers } from "hardhat";

async function main() {
  console.log('Deploying contract');
  const depF = await ethers.getContractFactory("WalletFactory");
  const dep = await depF.deploy();
  console.log('Contract deployed to:', dep.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
