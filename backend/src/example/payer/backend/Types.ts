
export interface ClienConfig {

}

export interface SwapInvoiceType {
  fromNetwork: string;
  fromCurrency: string;
  fromSymbol: string
  toAddress: string;
  toNetwork: string;
  toCurrency: string;
  toSymbol: string;
  fromAmountRaw: string;
  fromAmountDisplay: string;
  toAmountRaw: string;
  toAmountDisplay: string;
  payed: boolean;
  paymentTxs: {txId: string, status: string, submissionTime: number}[];
}