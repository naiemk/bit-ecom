import fs from 'fs';
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * USAGE:
 * npx hardhat deployWF --config-file ../backend/localConfig/contracts.json --network ethereum
 */

interface DeployConfig {
  walletFactory: string;
  holdingWallet: string;
  tokens: string[];
}

type DeployConfigs = { [network: string]: DeployConfig }

export async function deployWF(tasArgs: any, hre: HardhatRuntimeEnvironment) {
  const CONFIG_FILE = tasArgs.configFile || '';
  const config: DeployConfigs = !!CONFIG_FILE ? JSON.parse(fs.readFileSync(CONFIG_FILE).toString()) : {} as any;
  const network = process.argv.indexOf('--network') > 0 ? (process.argv[process.argv.indexOf('--network') + 1] || '').toUpperCase() : undefined;
  // console.log('Currenct config: ', {config, network, v: process.argv});
  if (!network) { throw new Error('network must be provided with "--network" argument'); }
  if (!config[network]) { config[network] = {} as any; }

  // check if the contract exists.
  console.log('Deploying walletFactory if necessary');
  const depF = await hre.ethers.getContractFactory("WalletFactory");
  let wfExists = false;
  if (config[network].walletFactory) {
    console.log('Checking if wallet factory is there for network', network);
    const wf = depF.attach(config[network].walletFactory);
    try {
      console.log('Got version', await wf.VERSION());
      wfExists = true;
    } catch (e) {
      console.log('WF did not exist');
    }
  }

  if (!wfExists) {
    const dep = await depF.deploy();
    console.log('WF Contract deployed to:', dep.address);
    config[network].walletFactory = dep.address.toLocaleLowerCase();
  } 

  const hwF = await hre.ethers.getContractFactory("HoldingWallet");
  let hwExists = false;
  if (config[network].holdingWallet) {
    console.log('Checking if holding wallet is there for network', network);
    const hw = hwF.attach(config[network].holdingWallet);
    try {
      console.log('Got version', await hw.VERSION());
      hwExists = true;
    } catch (e) {
      console.log('HW did not exist');
    }
  }

  if (!hwExists) {
    const dep = await hwF.deploy();
    console.log('HW Contract deployed to:', dep.address);
    config[network].holdingWallet = dep.address.toLocaleLowerCase();
  } 

  if (!!CONFIG_FILE) {
    console.log('Writing backe the config')
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4));
  }
}