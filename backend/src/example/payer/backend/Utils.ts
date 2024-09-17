import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain/ethereum/EthereumSmartContractHelper";

export class Utils {
  static async currencySymbol(helper: EthereumSmartContractHelper, currency: string): Promise<string> {
    const [, token] = EthereumSmartContractHelper.parseCurrency(currency);
    return EthereumSmartContractHelper.isBaseCurrency(currency) ? token : await helper.symbol(currency);
  }
}