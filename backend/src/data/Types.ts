import { NetworkedConfig } from "ferrum-plumbing";

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

export interface Invoice<T> {
    invoiceId: string;
    wallet: WalletInstance;
    amountRaw: string;
    payments: InvoicePayment[];
    paid: boolean;
    timedOut: boolean;
    creationTime: number;
    item: T;
}

export type HoldingWalletConfig = NetworkedConfig<string>;

export interface WalletServiceConfig {
    // The address of the wallet factory
    walletFactoryConracts: NetworkedConfig<string>;
    holdingWallets: HoldingWalletConfig;
    timeBucketSeconds?: number;
    timeBucketRepeatLen?: number;
    invoiceTimeout?: number;
}
