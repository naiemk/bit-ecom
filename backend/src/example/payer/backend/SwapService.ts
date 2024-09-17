import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { Injectable, LocalCache, NetworkedConfig, Networks, TypeUtils } from "ferrum-plumbing";
import { BigNumber } from "bignumber.js";
import Moralis from 'moralis';
import { WETH_CONFIG } from "./WethConfig";
import { ethers } from "ethers";

const CACHE_TIMEOUT = 3600 * 10000;
const GAS_PRICE_EXTENSION_RATIO = 2.0; // 0.25 more gas price to ensure speed and fluctuation

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
  amountRaw: string;
  amountUsd: string;
  processingGasFeeUsd: string;
  paymentGasFeeUsd: string;
  serviceFeeUsd: string;
  sourceCurrency: string;
  sourcePrice: string;
  targetCurrency: string;
  targetPrice: string;
  targetAmount: string;
  targetAmountRaw: string;
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
      console.log('GETTING PRICE FOR ', {currency, network, token, Weth: WETH_CONFIG[network]})
      const priceObj = await Moralis.EvmApi.token.getTokenPrice({
        chain: '0x' + Networks.for(network).chainId.toString(16),
        address: EthereumSmartContractHelper.isBaseCurrency(currency) ? WETH_CONFIG[network] : token,
      });
      return priceObj.toJSON().usdPrice;
    }, CACHE_TIMEOUT);
  }

  async calculateSwapAmountNoFee(fromCurrency: string, toCurrency: string, receiveAmountRaw: string): Promise<string> {
    const fromPrice = new BigNumber(await this.usdPrice(fromCurrency));
    const toPrice = new BigNumber(await this.usdPrice(toCurrency));
    return new BigNumber(receiveAmountRaw).multipliedBy(toPrice).div(fromPrice).toString();
  }

  async calculateSwapAmount(fromCurrency: string, toCurrency: string, receiveAmountRaw: string): Promise<SwapAmount> {
    console.log('calculateSwapAmount', fromCurrency, toCurrency, receiveAmountRaw);
    const [fromNetwork,] = EthereumSmartContractHelper.parseCurrency(fromCurrency);
    const [toNetwork,] = EthereumSmartContractHelper.parseCurrency(toCurrency);
    const toAmount = new BigNumber(await this.helper.amountToHuman(toCurrency, receiveAmountRaw));
    const toPrice = new BigNumber(await this.usdPrice(toCurrency));
    const fromPrice = new BigNumber(await this.usdPrice(fromCurrency));
    const toUsd = toAmount.multipliedBy(toPrice);

    // Fees come out of from
    const paymentGas = await this.gas(fromNetwork, this.config.gas.payment[fromNetwork] || this.config.gas.payment['ETHEREUM']);
    const paymentGasUsd = fromPrice.multipliedBy(paymentGas);
    const processGas = await this.gas(toNetwork, this.config.gas.payment[toNetwork] || this.config.gas.payment['ETHEREUM']);
    const processGasUsd = processGas.multipliedBy(processGas);
    const serviceFeeUsd = toUsd.multipliedBy(this.config.feeRatio || 0.02);
    const amountUsd = toUsd.plus(paymentGasUsd).plus(processGasUsd).plus(serviceFeeUsd);
    const amount = amountUsd.div(fromPrice);
    return {
      amount: amount.toFixed(),
      amountRaw: await this.helper.amountToMachine(toCurrency, amount.toFixed()),
      amountUsd: amountUsd.toFixed(),
      paymentGasFeeUsd: paymentGasUsd.toFixed(),
      processingGasFeeUsd: processGasUsd.toFixed(),
      serviceFeeUsd: serviceFeeUsd.toFixed(),
      sourcePrice: fromPrice.toFixed(),
      sourceCurrency: fromCurrency,
      targetPrice: toPrice.toFixed(),
      targetCurrency: toCurrency,
      targetAmount: toAmount.toFixed(),
      targetAmountRaw: receiveAmountRaw,
    } as SwapAmount;
  }

  async gas(network: string, gasLimit: number): Promise<BigNumber> {
    console.log('GAAS PRICE',network, await this.helper.gasPrice(network))
    return new BigNumber(await this.helper.gasPrice(network)).multipliedBy(GAS_PRICE_EXTENSION_RATIO).div(new BigNumber(10).pow(18)).multipliedBy(gasLimit);
  }

}