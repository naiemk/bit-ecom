import { ethers } from "hardhat";
import { WalletFactory } from "../typechain-types";

const DEPLOYED_FAC = "0x35f90588261cf7BAC147EaFDacBF634b1839e455";

const salts = [
  '0x748e98325cc655c4b8498ae97b590981a95250f8e66c03161186e5c000000001',
  '0x748e98325cc655c4b8498ae97b590981a95250f8e66c03161186e5c000000002',
  '0x748e98325cc655c4b8498ae97b590981a95250f8e66c03161186e5c000000003',
  '0x748e98325cc655c4b8498ae97b590981a95250f8e66c03161186e5c000000004',
  '0x748e98325cc655c4b8498ae97b590981a95250f8e66c03161186e5c000000005',
];

async function walletFactory() {
  const depF = await ethers.getContractFactory("WalletFactory");
  return depF.attach(DEPLOYED_FAC) as WalletFactory;
}

// NOTES:
// Gas used to deploy a single wallet: 63,580
// Gas used to trasnfer one wallet ETH: 30,805
// Total: 94,385
//
// Gas used to deploy 5 wallets: 233,127, 233,127 / 5 = 46,625
// Gas used to trasnfer 5 wallets: 78,879, 78,879 / 5 = 15,775
// Total: 62,400
//
// Signle eth tx for reference: 21,000

async function distributeTokens() {
  const wf = await walletFactory();
  const wallets = await wf.getAddresses(salts);
  console.log('Wallets:', wallets);
  const signers = await ethers.getSigners();

  // const tokF = await ethers.getContractFactory("Token");
  // const tok = await tokF.deploy();
  for(const w of wallets) {
    console.log('Sending to:', w);
    await signers[0].sendTransaction(({
      to: w,
      value: ethers.utils.parseEther("0.00001").toHexString(),
      gasLimit: 100000,
    }));
  }
}

async function deployWallet() {
  const w = await walletFactory();
  const impl = '0x50eCC1A45733Cd866066a4Db663dc8E2ce4115Fc';
  await w.deployImplementation(impl, {gasLimit: 7000000});
  console.log('Implementation deployed:', impl);
  console.log('Current impl', await w.implementation());
}

async function sweepAll() {
  const wf = await walletFactory();
  const wallets = await wf.getAddresses(salts);
  console.log('Wallets:', wallets);

  console.log('First depoying all wallets');
  const tx = await wf.multiDeploy(salts, {gasLimit: 7000000});
  console.log('Wallets deployed using:', tx.hash);
  
  console.log('Now sweeping all wallets');
  const tx2 = await wf.sweepMulti([], wallets, {gasLimit: 7000000});
  console.log('Wallets swept using:', tx2.hash);
}

async function main() {
  // await deployWallet();
  // await distributeTokens();
  await sweepAll();

  // console.log('Deploying single wallet');
  // const depF = await ethers.getContractFactory("WalletFactory");
  // const dep = depF.attach(DEPLOYED_FAC);
  // console.log('Factory attached to:', dep.address);
  // const tx = await dep.singleDeploy("0x748e98325cc655c4b8498ae97b590981a95250f8e66c03161186e5c42d6480a8", {gasLimit: 1000000})
  // console.log('Wallet deployed using:', tx.hash);
  // const receipt = await tx.wait();
  // console.log('Wallet deployed result:', receipt.status);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
