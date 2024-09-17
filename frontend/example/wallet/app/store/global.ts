'use client'

import { BigNumber } from 'bignumber.js';
import { atom } from 'jotai';
import { atomWithStorage, loadable } from 'jotai/utils';
import { Loadable } from 'jotai/vanilla/utils/loadable';

const PROD_BACKEND = '';
const DEV_BACKEND = 'http://localhost:8000';

function backend() {
  const isLocal = window.location.hostname.toLocaleLowerCase() === 'localhost' || window.location.hostname.toLocaleLowerCase() === '127.0.0.1';
  return isLocal ? DEV_BACKEND : PROD_BACKEND;
}

export async function configInit(setConfig: any) {
  try {
    const res = await fetch(`${backend()}/clientconfig`);
    const resJ = await res.json();
    console.log('Loading global config...', resJ);
    setConfig({
      error: undefined,
      state: 'hasData',
      data: resJ,
    });
  } catch(e) {
    setConfig({
      error: (e as Error).message,
      state: 'hasError',
      data: {},
    });
  }
}

export const config = atom(({
    state: 'loading',
    hasError: false,
    error: '',
    data: {},
}));

export interface CurrencyConfig {
  currency: string,
  name: string,
  symbol: string,
  decimals: number,
  isNative: boolean,
}

export interface NetworkConfig {
  id: string,
  displayName: string,
  baseCurrency: string,
  baseSymbol: string,
  testnet: boolean,
  chainId: number,
  explorer: string,
  defaultRpcEndpoint: string,
}

export interface ClientConfig {
  currencies: string[],
  turnstileSitekey: string;
  tokenConfig: { [k: string]: CurrencyConfig };
  networkConfig: { [k: string]: NetworkConfig }
  validRanges: { [k: string]: string[] }
}

export const clientConfig = atom(get => get(config).data as ClientConfig);


// Swap out
export const storedSelectedReceiveNetwork = atomWithStorage('storedSelectedReceiveNetwork', '');
export const storedSelectedReceiveToken = atomWithStorage('storedSelectedReceiveToken', '');
export const storedSelectedReceiveAmount = atomWithStorage('storedSelectedReceiveAmount', 0);
export const selectReceiveAddress = atom('');

export function machineAmount(amount: string, token: CurrencyConfig) {
  if (!token) { return ''; }
  return new BigNumber(amount).multipliedBy(new BigNumber(10).pow(token.decimals!)).toFixed();
}

export function humanAmount(amount: string, token: CurrencyConfig, roundUp: boolean = true) {
  if (!token) { return ''; }
  return new BigNumber(amount).dividedBy(new BigNumber(10).pow(token.decimals!)).toFixed(6, roundUp ? BigNumber.ROUND_CEIL : BigNumber.ROUND_FLOOR);
}

// Swap in
export const storedSelectedSendNetwork = atomWithStorage('storedSelectedSendNetwork', '');
export const storedSelectedRSendToken = atomWithStorage('storedSelectedSendToken', '');
export const sendQuote_ = atom<Promise<SwapAmount>>(async (get, { signal }) => ({} as any));
export const sendQuoteRaw = atom<Promise<SwapAmount>>(async (get, { signal }) => {
  const toCurrency = `${get(storedSelectedReceiveNetwork)}:${get(storedSelectedReceiveToken)}`;
  const toAmount = get(storedSelectedReceiveAmount);
  const toToken = (get(clientConfig)?.tokenConfig || {})[toCurrency];
  if (!toToken) { return ({}) as any; }
  const toAmountRaw = machineAmount(toAmount.toString(), toToken);
  const fromCurrency = `${get(storedSelectedSendNetwork)}:${get(storedSelectedRSendToken)}`;
  const res = await fetch(`${backend()}/quote?fromCurrency=${fromCurrency}&toCurrency=${toCurrency}&toAmountRaw=${toAmountRaw}`, {signal});
  return await res.json() as SwapAmount;
});
export const sendQuote = loadable(sendQuoteRaw);

export const cfTurnstileToken = atom("");
export const getNewInvoiceResponse = atom(null as Invoice|null);
export const getNewInvoiceRequest = atom(null, async (get, set) => {
  const toCurrency = `${get(storedSelectedReceiveNetwork)}:${get(storedSelectedReceiveToken)}`;
  const fromCurrency = `${get(storedSelectedSendNetwork)}:${get(storedSelectedRSendToken)}`;
  const toAmount = get(storedSelectedReceiveAmount);
  const toToken = (get(clientConfig)?.tokenConfig || {})[toCurrency];
  const toAmountRaw = machineAmount(toAmount.toString(), toToken);
  const toAddress = get(selectReceiveAddress);
  const body = JSON.stringify({
    fromCurrency,
    toCurrency,
    toAddress,
    toAmountRaw,
    'cf-turnstile-response': get(cfTurnstileToken),
  });
  try {
    set(getNewInvoiceLoadable, {state: 'loading', error: undefined, data: undefined} as any);
    const headers = {'Content-Type': 'application/json'};
    const res = await fetch(`${backend()}/invoice`, {method: 'POST', body, headers});
    if ((res.status / 100) != 2) { throw new Error(await res.text())}
    const resJ = await res.json() as Invoice;
    set(getNewInvoiceResponse, resJ);
    set(getNewInvoiceLoadable, {state: 'hasData', data: resJ});
  } catch (e) {
    set(getNewInvoiceLoadable, {state: 'hasError', error: e});
  }
});
export const getNewInvoiceLoadable = atom({state: '', error: undefined, data: undefined} as any as Loadable<Invoice>);

// Invoice page
export const invoice = atom({} as Invoice);
export const invoinceIdFromUrl = atom('');
export const getInvoiceById = atom(async (get,) => {
  const id = get(invoinceIdFromUrl);
  console.log('Getting invoice', id);
  const res = await fetch(`${backend()}/invoicebyid?invoiceId=${id}`);
  if ((res.status / 100) != 2) { throw new Error(await res.text())}
  const rv = await res.json() as Invoice;
  console.log('Got invoice', rv);
  return rv;
});

export const getInvoiceByIdLoadable = loadable(getInvoiceById);

export interface SwapAmount {
  amount: string;
  amountUsd: string;
  processingGasFeeUsd: string;
  paymentGasFeeUsd: string;
  serviceFeeUsd: string;
  sourceCurrency: string;
  sourcePrice: string;
  targetCurrency: string;
  targetPrice: string;
}

export interface SwapItem {
  fromAmountRaw: string, 
  fromCurrency: string,
  fromNetwork: string,
  payed: boolean,
  toAddress: string,
  toAmountRaw: string,
  toCurrency: string,
  toNetwork: string,
  paymentTxs: string[],
}

export interface InvoicePayment {
    network: string;
    currency: string;
    txId: string;
    from: string;
    to: string
    amountRaw: string;
    timestamp: number;
}

export interface WalletInstance {
    network: string;
    address: string;
    addressForDisplay: string;
    currency: string;
    timeBucket: number;
    timeBucketWithMargin: number;
    randomSeed: string;
    salt: string;
    sweepTxs: string[];
}

export interface Invoice {
  invoiceId: string;
  wallet: WalletInstance;
  amountRaw: string;
  amountDisplay: string;
  symbol: string;
  currency: string;
  payments: InvoicePayment[];
  paid: boolean;
  timedOut: boolean;
  creationTime: number;
  item: SwapItem;
}

export function roundUp(num: string): string {
  try {
    return new BigNumber(num).toFixed(5, BigNumber.ROUND_CEIL);
  } catch {
    return num;
  }
}

export function numOrZero(v: string): number {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}