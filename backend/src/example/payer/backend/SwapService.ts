import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { BigNumber, ethers } from "ethers";
import { Injectable, LocalCache, NetworkedConfig, Networks, TypeUtils } from "ferrum-plumbing";
import Moralis from 'moralis';

const CACHE_TIMEOUT = 3600 * 10000;
const GAS_PRICE_EXTENSION_RATIO = 1.25; // 0.25 more gas price to ensure speed and fluctuation

export interface SwapConfig {
  suppotedCurrencies: string[];
  moralisApiKey: string;
  feeRatio: number;
  gas: {
    payment: NetworkedConfig<number>,
    processing: NetworkedConfig<number>,
  }
}

export interface SwapAmount {
  amount: string;
  amountUsd: string;
  processingGasFeeUsd: string;
  paymentGasFeeUsd: string;
  serviceFeeUsd: string;
  sourceToken: string;
  sourcePrice: string;
  targetToken: string;
  targetPrice: string;
}

export class SwapService implements Injectable {
  private cache = new LocalCache();
  constructor(private config: SwapConfig, private helper: EthereumSmartContractHelper) {
    Moralis.start({
      apiKey: config.moralisApiKey,
    });
  }

  __name__(): string { return 'SwapService'; }

  async usdPrice(currency: string) {
    return this.cache.getAsync(currency, async () => {
      const [network, token] = EthereumSmartContractHelper.parseCurrency(currency);
      const priceObj = await Moralis.EvmApi.token.getTokenPrice({
        chain: '0x' + Networks.for(network).chainId.toString(16),
        address: token,
      });
      return priceObj.toJSON().usdPrice;
    }, CACHE_TIMEOUT);
  }

  async calculateSwapAmountNoFee(fromCurrency: string, toCurrency: string, receiveAmountRaw: string): Promise<string> {
    const fromPrice = BigNumber.from(await this.usdPrice(fromCurrency));
    const toPrice = BigNumber.from(await this.usdPrice(toCurrency));
    return BigNumber.from(receiveAmountRaw).mul(toPrice).div(fromPrice).toString();
  }

  async calculateSwapAmount(fromCurrency: string, toCurrency: string, receiveAmountRaw: string): Promise<SwapAmount> {
    const [fromNetwork, fromToken] = EthereumSmartContractHelper.parseCurrency(fromCurrency);
    const [toNetwork, toToken] = EthereumSmartContractHelper.parseCurrency(toCurrency);
    const toAmount = BigNumber.from(await this.helper.amountToHuman(toCurrency, receiveAmountRaw));
    const toPrice = BigNumber.from(await this.usdPrice(toCurrency));
    const fromPrice = BigNumber.from(await this.usdPrice(fromCurrency));
    const toUsd = toAmount.div(toPrice);

    // Fees come out of from
    const paymentGas = await this.gas(fromNetwork, this.config.gas.payment[fromNetwork] || this.config.gas.payment['ETHEREUM']);
    const paymentGasUsd = fromPrice.mul(paymentGas);
    const processGas = await this.gas(toNetwork, this.config.gas.payment[toNetwork] || this.config.gas.payment['ETHEREUM']);
    const processGasUsd = processGas.mul(processGas);
    const serviceFeeUsd = toUsd.mul(this.config.feeRatio || 0.02);
    const amountUsd = toUsd.add(paymentGasUsd).add(processGasUsd).add(serviceFeeUsd);
    const amount = amountUsd.div(fromPrice);
    return {
      amount: amount.toString(),
      amountUsd: amountUsd.toString(),
      paymentGasFeeUsd: paymentGasUsd.toString(),
      processingGasFeeUsd: processGasUsd.toString(),
      serviceFeeUsd: serviceFeeUsd.toString(),
      sourcePrice: fromPrice.toString(),
      sourceToken: fromToken,
      targetPrice: toPrice.toString(),
      targetToken: toToken,
    } as SwapAmount;
  }

  async gas(network: string, gasLimit: number): Promise<BigNumber> {
    return BigNumber.from(this.helper.gasPrice(network)).mul(GAS_PRICE_EXTENSION_RATIO).mul(gasLimit);
  }
}