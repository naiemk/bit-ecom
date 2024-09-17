import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { Injectable, ValidationUtils } from "ferrum-plumbing";
import { HoldingWallet, HoldingWallet__factory, } from "../typechain-types";

import { ISignerProvider } from "../EnvSignerProvider";
import { WalletServiceConfig } from "./Types";

export const ETH_TOKEN = '0x0000000000000000000000000000000000000001';

export class HoldingWalletService implements Injectable {
  constructor(
    private config: WalletServiceConfig,
    private helper: EthereumSmartContractHelper,
    private signer: ISignerProvider,
    ) {
  }

  __name__(): string {
    return 'HoldingWalletService';
  }

  async liquidity(currency: string) {
    const [network, token] = EthereumSmartContractHelper.parseCurrency(currency);
    const hw = await this.HoldingWallet(network);
    return (await hw.available(token)).toString();
  }

  async isPaid(network: string, payId: string) {
    const hw = await this.HoldingWallet(network);
    return hw.payments(payId);
  }

  async pay(currency: string, payId: string, to: string, amount: string): Promise<string> {
    let [network, token] = EthereumSmartContractHelper.parseCurrency(currency);
    const isETH = !token.startsWith('0x') && !token.startsWith('0X');
    if (isETH) { token = ETH_TOKEN; }
    if (await this.isPaid(network, payId)) { return ''; }
    const hw = await this.HoldingWallet(network);
    if (isETH) {
      const tx = await hw.connect(await this.signer.signer()).payETH(to, amount, payId);
      return tx.hash;
    } else {
      const tx = await hw.connect(await this.signer.signer()).pay(token, to, amount, payId);
      return tx.hash;
    }
  }

  /**
   * Create an ethers instance of the wallet factory
   */
  async HoldingWallet(network: string): Promise<HoldingWallet> {
      // new ethers instance of the walletfactory from typechain
      const provider = this.helper.ethersProvider(network);
      const contract = this.config.contracts[network]?.holdingWallet;
      ValidationUtils.isTrue(!!contract, 'Holding wallet contract not found for network: ' + network);

      return HoldingWallet__factory.connect(
          contract,
          provider,);
  }
}