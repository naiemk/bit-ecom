
export interface ClienConfig {

}

export interface SwapInvoiceType {
  fromNetwork: string;
  fromCurrency: string;
  toAddress: string;
  toNetwork: string;
  toCurrency: string;
  fromAmountRaw: string;
  toAmountRaw: string;
  payed: boolean;
  paymentTxs: {txId: string, status: string, submissionTime: number}[];
}