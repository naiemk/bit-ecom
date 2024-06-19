import { Injectable } from "ferrum-plumbing";

export interface SwapConfig {

}

export class SwapService implements Injectable {
  constructor(private swapConfig: SwapConfig) {}

  __name__(): string { return 'SwapService'; }

  async calculateSwapAmount(fromCurrency: string, toCurrency: string, receiveAmountRaw: string): Promise<string> {
    return '0';
  }
}