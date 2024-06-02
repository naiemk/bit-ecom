import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
// import "@nomicfoundation/hardhat-verify";
import { ethers } from "ethers";

export const TEST_MNEMONICS =
  "body sound phone helmet train more almost piano motor define basic retire play detect force ten bamboo swift among cinnamon humor earn coyote adjust";
const accounts: any = process.env.TEST_ACCOUNT_PRIVATE_KEY ? [process.env.TEST_ACCOUNT_PRIVATE_KEY] : { mnemonic: TEST_MNEMONICS };

if (accounts.mnemonic) {
    let mnemonicWallet = ethers.Wallet.fromMnemonic(TEST_MNEMONICS);
    console.log('Test account used from MNEMONIC', mnemonicWallet.privateKey, mnemonicWallet.address);
} else {
    let wallet = new ethers.Wallet(accounts[0]);
    console.log('Test account used from TEST_ACCOUNT_PRIVATE_KEY', wallet.address);
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
    outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "metadata", // <-- add this
          ]
        },
      },
  },
  networks: {
    hardhat: {
      accounts,
    },
    local: {
      url: 'http://127.0.0.1:8545',
      accounts,
    },
    sepolia: {
      url: 'https://rpc2.sepolia.org/',
      accounts,
    },
    bsctestnet: {
      chainId: 97,
      url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
      accounts,
      gas: 1000000,
      // gasPrice: 20000000000,
    },
  },
  etherscan: {
    // Your API key for Etherscan
    apiKey: {
      bscTestnet: process.env["BSCSCAN_API_KEY"],
      // polygonMumbai: getEnv("POLYGONSCAN_API_KEY"),
    },
  },
};

export default config;
