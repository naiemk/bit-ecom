import { MongooseConnection } from "aws-lambda-helper";
import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { Injectable, NetworkedConfig, TypeUtils, ValidationUtils } from "ferrum-plumbing";
import { WalletFactory, WalletFactory__factory } from "../typechain-types";
import { ethers } from "ethers";
import { Connection, Model, Schema } from "mongoose";
import { randomBytes } from "crypto";
import { AbiCoder } from "ethers/lib/utils";

const DEFAULT_TIME_BUCKET_SECONDS = 3600 * 12;
const DEFAULT_TIME_BUCKET_REPEAT_LEN = 128;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
    creationTime: number;
    item: T;
}

export const InvoiceModel = (con: Connection) => { const schema = new Schema({
        invoiceId: { type: String, required: true, unique: true },
        wallet: { type: Schema.Types.Mixed, required: true },
        payments: { type: Schema.Types.Mixed, required: true },
        paid: { type: Boolean, required: true },
        creationTime: Number,
        item: Object,
    });
    return con.model('Invoice', schema) as any as Model<Invoice<any> & Document>;
}

export interface WalletServiceConfig {
    // The address of the wallet factory
    walletFactoryConracts: NetworkedConfig<string>;
    timeBucketSeconds?: number;
    timeBucketRepeatLen?: number;
}

export class WalletService extends MongooseConnection implements Injectable {
    __name__(): string { return 'WalletService'; }
    private invoiceModel: Model<Invoice<any> & Document> | undefined;

    constructor(private config: WalletServiceConfig, private helper: EthereumSmartContractHelper) {
        super()
    }


    initModels(con: Connection): void {
        this.invoiceModel = InvoiceModel(con);
    }

    async newInvoice<T>(
            network: string,
            token: string,
            amountRaw: string,
            timestamp: number,
            item: T) {
        // TODO: Implement wallet re-use logic to reduce gas costs
        // find an unused wallet for the current time bucket and use it
        // Otherwise create a new wallet.
        // For simplicity, we just go ahead and create a new wallet

        this.verifyInit();
        const wallet = await this.newWallet(network, token, timestamp);
        const invoiceId = TypeUtils.bufferToHex(randomBytes(32));
        const invoice = {
            invoiceId,
            wallet,
            amountRaw,
            payments: [],
            paid: false,
            creationTime: Date.now(),
            item,
        } as Invoice<T>;
        await this.invoiceModel!.create(invoice);
        return invoice;
    }

    async newWallet(network: string, token: string, timestampSeconds: number) {
        this.verifyInit();
        const currency = EthereumSmartContractHelper.toCurrency(network, token);
        const wf = await this.walletFactory(network);
        const tb = this.config.timeBucketSeconds || DEFAULT_TIME_BUCKET_SECONDS;
        const tbRepeat = this.config.timeBucketRepeatLen || DEFAULT_TIME_BUCKET_REPEAT_LEN;
        const timeBucket = Math.round(timestampSeconds / tb) % tbRepeat;
        const timeBucketWithMargin = (Math.round(timestampSeconds / tb) - 1) % tbRepeat;
        const randomSeed = TypeUtils.bufferToHex(randomBytes(32));
        const salt = this.getSalt(token, timeBucketWithMargin, randomSeed);
        const wallet = await wf.getAddress(await wf.implementation(), salt);

        return {
            network, address: wallet.toLowerCase(), currency, addressForDisplay: wallet, timeBucket, timeBucketWithMargin, randomSeed, salt,
        } as WalletInstance;   
    }

    async getInvoices(from: number, to: number): Promise<Invoice<any>[]> {
        // Return invoices with pagination
        this.verifyInit();
        const inv = await this.invoiceModel!.find({ creationTime: { $gte: from, $lt: to } }).exec();
        return inv.map(i => i.toJSON());
    }

    getSalt(token: string, timestamp: number, randomSeed: string): string {
        // encode with ethers
        const abi = new AbiCoder();
        return abi.encode(['address', 'uint256', 'bytes32'], [token, timestamp, randomSeed]);
    }

    async payInvoice(invoiceId: string, payment: InvoicePayment) {
        // Implement the logic to pay the invoice
        // For simplicity, we just mark the invoice as paid
        this.verifyInit();
        await this.invoiceModel!.updateOne({ invoiceId }, { $push: { payments: payment }, $set: { paid: true } }).exec();
    }

    /**
     * TODO: Enable tx-level check and update...
     * Get all the payment for time range and pay them if they are paid
     */
    async checkAndUpdatePayments(network: string, fromTime: number, toTime: number) {
        const unpaid = await this.checkPayments(network, fromTime, toTime);
        // string to bigint
        const toBigInt = (s: string) => ethers.BigNumber.from(s);
        const f = unpaid.filter(i => i.payments.length > 0 &&
            toBigInt(i.payments[0].amountRaw) >= toBigInt(i.amountRaw)
        ).map(i => this.payInvoice(i.invoiceId, i.payments[0]));
        await Promise.all(f);
        return unpaid;
    }

    /**
     * Check all the unpaid invoices for a given time period. Once invoices are paid, they need to be marked as paid.
     */
    async checkPayments(network: string, fromTime: number, toTime: number) {
        this.verifyInit();
        // Query all the invoices that are not paid for the time range filtered by the wallet network 
        const invoices = await this.invoiceModel!.find({ paid: false, network, creationTime: { $gte: fromTime, $lt: toTime } }).exec();
        const invoiceLoockup = {} as {[key: string]: Invoice<any>};
        const wallets = invoices.map(i => i.wallet);
        const tokens = new Set(invoices.map(i => EthereumSmartContractHelper.parseCurrency(i.wallet.currency)[1]));
        const walletAddresses = wallets.map(w => w.address);
        let withBal = await (await this.walletFactory(network)).filterWithBalance(walletAddresses, Array.from(tokens));
        return withBal.filter(w => w.tokens.length > 0)
            .map(w => ({
                ...invoiceLoockup[w.wallet],
                payments: invoiceToPayments(w.wallet, w.tokens, w.balances.map(b => b.toString())),
            } as Invoice<any>));
    }

    /**
     * Get all the invoices that are paid in the last period and ready to be swept
     */
    async checkPaidWaitingForSweep(network: string, fromTime: number, toTime: number) {
        const invoices = await this.invoiceModel!.find({ paid: true, network, creationTime: { $gte: fromTime, $lt: toTime } }).exec();
        const invoiceLoockup = {} as {[key: string]: Invoice<any>};
        const wallets = invoices.map(i => {
            invoiceLoockup[i.wallet.address] = i;
            return i.wallet;
        });
        const allTokens = invoices.map(i => EthereumSmartContractHelper.parseCurrency(i.wallet.currency)[1]);
        const tokens = allTokens.filter((v, i, a) => a.indexOf(v) === i);
        const walletAddresses = wallets.map(w => w.address);
        let withBal = await (await this.walletFactory(network)).filterWithBalance(walletAddresses, tokens);
        return withBal.filter(w => w.tokens.length > 0)
            .map(w => ({
                ...invoiceLoockup[w.wallet],
            } as Invoice<any>));
    }

    async bulkSweepPaidWallets(network: string, wallets: string[], tokens: string[]) {
        const tx = (await this.walletFactory(network)).sweepMulti(tokens, wallets);
        // Find invoices relevant to the wallets and save the tx in those invoices
        const invoices = await this.invoiceModel!.find({ 'wallet.address': { $in: wallets } }).exec();
        // Save the tx in the wallet sweeptx field 
        await this.invoiceModel!.updateMany({ 'wallet.address': { $in: wallets } }, { $push: { sweepTxs: tx } }).exec();
    }

    /**
     * Create an ethers instance of the wallet factory
     */
    private async walletFactory(network: string): Promise<WalletFactory> {
        // new ethers instance of the walletfactory from typechain
        const provider = this.helper.ethersProvider(network);
        const contract = this.config.walletFactoryConracts[network];
        ValidationUtils.isTrue(!!contract, 'Contract not found for network: ' + network);

        return WalletFactory__factory.connect(
            contract,
            provider,);
    }
}

function invoiceToPayments(walletCurrency: string, tokens: string[], balances: string[]): InvoicePayment[] {
    const txId = ""; // TODO: Generate a unique transaction ID
    const from = ""; // TODO: Get the sender address
    const to = ""; // TODO: Get the recipient address
    const [network, token] = EthereumSmartContractHelper.parseCurrency(walletCurrency);
    const idx = tokens.map(t => t.toLocaleLowerCase()).indexOf(token);
    if (idx < 0) {
        return [];
    }
    const amountRaw = balances[idx];
    const timestamp = Date.now(); // TODO: Get the current timestamp

    return [{
        network,
        currency: walletCurrency,
        txId,
        from,
        to,
        amountRaw,
        timestamp
    }];
}
