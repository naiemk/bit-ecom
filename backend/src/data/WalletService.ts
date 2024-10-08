import { MongooseConnection } from "aws-lambda-helper";
import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { Injectable, Networks, TypeUtils, ValidationUtils } from "ferrum-plumbing";
import { WalletFactory, WalletFactory__factory } from "../typechain-types";
import { BigNumber, ethers } from "ethers";
import { Connection, Model, Schema } from "mongoose";
import { randomBytes } from "crypto";
import { AbiCoder } from "ethers/lib/utils";
import { Invoice, InvoicePayment, WalletInstance, WalletServiceConfig } from "./Types";
import { ETH_TOKEN } from "./HoldingWalletService";

const DEFAULT_INVOICE_TIMEOUT = 3600 * 24 * 2 * 1000; // 2 days;
const DEFAULT_TIME_BUCKET_SECONDS = 3600 * 12;
const DEFAULT_TIME_BUCKET_REPEAT_LEN = 128;

export const InvoiceModel = (con: Connection) => { const schema = new Schema({
        invoiceId: { type: String, required: true, unique: true },
        wallet: { type: Schema.Types.Mixed, required: true },
        payments: { type: Schema.Types.Mixed, required: true },
        paid: { type: Boolean, required: true },
        timedOut: { type: Boolean, required: true },
        amountRaw: String,
        amountDisplay: String,
        currency: String,
        symbol: String,
        creationTime: Number,
        item: Object,
    });
    return con.model('Invoice', schema) as any as Model<Invoice<any> & Document>;
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
            item: T) {
        // TODO: Implement wallet re-use logic to reduce gas costs
        // find an unused wallet for the current time bucket and use it
        // Otherwise create a new wallet.
        // For simplicity, we just go ahead and create a new wallet
        ValidationUtils.allRequired({network, token, amountRaw, item});
        console.log('USING NEW INVOICE', {network, token, amountRaw, item});

        this.verifyInit();
        const wallet = await this.newWallet(network, token, Math.round(Date.now() / 1000));
        const invoiceId = TypeUtils.bufferToHex(randomBytes(32));
        const currency = EthereumSmartContractHelper.toCurrency(network, token);
        const isBaseCurrency = !ethers.utils.isAddress(token);
        const invoice = {
            invoiceId,
            wallet,
            amountRaw,
            amountDisplay: isBaseCurrency ? ethers.utils.formatEther(amountRaw) : await this.helper.amountToHuman(currency, amountRaw),
            currency,
            symbol: isBaseCurrency ? token : await this.helper.symbol(currency),
            payments: [],
            paid: false,
            timedOut: false,
            creationTime: Date.now(),
            item,
        } as Invoice<T>;
        await this.invoiceModel!.create(invoice);
        return invoice;
    }

    async newWallet(network: string, token: string, timestampSeconds: number) {
        this.verifyInit();
        console.log('newWallet', {network, token, timestampSeconds})
        const currency = EthereumSmartContractHelper.toCurrency(network, token);
        const wf = await this.walletFactory(network);
        const tb = this.config.timeBucketSeconds || DEFAULT_TIME_BUCKET_SECONDS;
        const tbRepeat = this.config.timeBucketRepeatLen || DEFAULT_TIME_BUCKET_REPEAT_LEN;
        const timeBucket = Math.round(timestampSeconds / tb) % tbRepeat;
        const timeBucketWithMargin = (Math.round(timestampSeconds / tb) - 1) % tbRepeat;
        const randomSeed = '0x' + TypeUtils.bufferToHex(randomBytes(32));
        const salt = this.getSalt(
            EthereumSmartContractHelper.isBaseCurrency(`${network}:${token}`) ? ETH_TOKEN : token,
            timeBucketWithMargin,
            randomSeed);
        const wallet = await wf.getAddress(await wf.implementation(), salt);

        return {
            network, address: wallet.toLowerCase(), currency, addressForDisplay: wallet, timeBucket, timeBucketWithMargin, randomSeed, salt,
        } as WalletInstance;   
    }

    async getInvoicesById(invoiceIds: string[]): Promise<Invoice<any>[]> {
        // Return invoices with pagination
        this.verifyInit();
        console.log('Get invoices by ID', invoiceIds);
        const invs = await this.invoiceModel!.find({invoiceId: {$in: invoiceIds}}).exec();
        return invs.map(i => i.toJSON());
    }

    async getInvoiceById(invoiceId: string): Promise<Invoice<any>|null> {
        // Return invoices with pagination
        this.verifyInit();
        console.log('Get invoice by ID', invoiceId);
        const inv = await this.invoiceModel!.findOne({invoiceId}).exec();
        return inv ? inv.toJSON() : null;
    }

    async updateInvoiceById(invoiceId: string, item: any) {
        // Return invoices with pagination
        this.verifyInit();
        console.log('Updating invoice by ID', invoiceId);
        await this.invoiceModel!.findOneAndUpdate({invoiceId}, {$set: {item}}).exec();
    }

    async getInvoices(from: number, to: number): Promise<Invoice<any>[]> {
        // Return invoices with pagination
        this.verifyInit();
        console.log('Getting invoices from', new Date(from), from, 'to', new Date(to), to);
        const inv = await this.invoiceModel!.find({ creationTime: { $gte: from, $lte: to } }).exec();
        return inv.map(i => i.toJSON());
    }

    getSalt(token: string, timestamp: number, randomSeed: string): string {
        // encode with ethers
        const abi = new AbiCoder();
        return ethers.utils.keccak256(abi.encode(['address', 'uint256', 'bytes32'], [token, timestamp, randomSeed]));
    }

    async payInvoice(invoiceId: string, payment: InvoicePayment, hasEnoughPayments: boolean) {
        // Implement the logic to pay the invoice
        // For simplicity, we just mark the invoice as paid
        this.verifyInit();
        await this.invoiceModel!.updateOne({ invoiceId }, { $set: { paid: hasEnoughPayments, payments: [payment] } }).exec();
    }

    async timeOutInvoice(invoiceId: string, payment: InvoicePayment) {
        // Implement the logic to pay the invoice
        // For simplicity, we just mark the invoice as paid
        this.verifyInit();
        await this.invoiceModel!.updateOne({ invoiceId }, { $push: { payments: payment }, $set: { timedOut: true } }).exec();
    }

    /**
     * TODO: Enable tx-level check and update...
     * Get all the payment for time range and pay them if they are paid
     */
    async checkAndUpdatePayments(network: string, fromTime: number, toTime: number) {
        const expired = (i: Invoice<any>) => (Date.now() - i.creationTime) > 
            (this.config.invoiceTimeout || DEFAULT_INVOICE_TIMEOUT);

        const invoicePayments = await this.checkPayments(network, fromTime, toTime);
        const hasPayment = invoicePayments.filter(i => (i.payments || []).length > 0 && !expired(i));
        const timedOut = invoicePayments.filter(expired);
        const f = hasPayment.map(i => this.payInvoice(i.invoiceId, i.payments[0], hasEnoughPayments(i)));
        // TODO: Do something with timed out
        const t = timedOut.map(i => this.payInvoice(i.invoiceId, i.payments[0], hasEnoughPayments(i)));
        await Promise.all(f);
        await Promise.all(t);
        return [...hasPayment, ...timedOut];
    }

    async getInvoicesForSweep(network: string, fromTime: number, toTime: number): Promise<Invoice<any>[]> {
        const paid = await this.invoiceModel!.find({
            paid: true,
            'wallet.network': network,
            creationTime: { $gte: fromTime, $lt: toTime } }).exec();
        const timedOut = await this.invoiceModel!.find({
            timedOut: true,
            'wallet.network': network,
            creationTime: { $gte: fromTime, $lt: toTime } }).exec();
        const allInvoices = [...paid.map(p => p.toJSON(), ...timedOut.map(t => t.toJSON()))];
        return (await this.filterInvoicesWithBalance(network, allInvoices)).map(i => i[0]);
    }

    /**
     * Check all the unpaid invoices for a given time period. Once invoices are paid, they need to be marked as paid.
     */
    async checkPayments(network: string, fromTime: number, toTime: number) {
        this.verifyInit();
        // Query all the invoices that are not paid for the time range filtered by the wallet network 
        const invoices = await this.invoiceModel!.find({ paid: false, 'wallet.network': network, creationTime: { $gte: fromTime, $lt: toTime } }).exec();
        console.log('$invoices', invoices.length, 'from', new Date(fromTime), 'to', new Date(toTime));
        const withBal = await this.filterInvoicesWithBalance(network, invoices.map(i => i.toJSON()));
        return withBal.filter(invNpay => { // Filter invoices with new balance
            const [inv, pay] = invNpay;
            // Notes: we have only one payment at the moment as we just check the balance
            return BigNumber.from(pay[0].amountRaw).gt(totalAmount(inv.payments || []))
        }).map(invNpay => ({
                ...invNpay[0],
                payments: invNpay[1],
            } as Invoice<any>));
    }

    /**
     * Filters invoices with balance on chain. For simplicity, if an invoice is paid partially in multiple transactions,
     *  we only keep one payment that reflects the total balance.
     */
    async filterInvoicesWithBalance(network: string, invoices: Invoice<any>[]): Promise<[Invoice<any>, payments: InvoicePayment[]][]> {
        const invoiceLoockup = {} as {[key: string]: Invoice<any>};
        invoices.forEach(i => invoiceLoockup[i.wallet.address.toLocaleLowerCase()] = i);
        const walletAddresses = invoices.map(i => i.wallet.address.toLocaleLowerCase());
        const tokens = new Set(invoices
            .filter(i => !EthereumSmartContractHelper.isBaseCurrency(i.wallet.currency))
            .map(i =>   EthereumSmartContractHelper.parseCurrency(i.wallet.currency)[1]));
        console.log('wallets', walletAddresses, tokens);
        const withBal = await (await this.walletFactory(network)).filterWithBalance(Array.from(tokens), walletAddresses);
        return Promise.all(withBal.filter(w => w.tokens.length > 0)
            .map(async w => ([
                { ...invoiceLoockup[w.wallet.toLocaleLowerCase()]} as Invoice<any>,
                await invoiceToPayments(this.helper, network, w.tokens, w.balances.map(b => b.toString()))
            ])));
    }

    /**
     * Get all the invoices that are paid in the last period and ready to be swept
     */
    async checkPaidWaitingForSweep(network: string, fromTime: number, toTime: number) {
        const invoicePayments = await this.checkPayments(network, fromTime, toTime);
        return invoicePayments.filter(hasEnoughPayments);
    }

    async bulkSweepPaidWallets(network: string, wallets: string[], tokens: string[]) {
        const tx = (await this.walletFactory(network)).sweepMulti(tokens, wallets);
        // Find invoices relevant to the wallets and save the tx in those invoices
        // Save the tx in the wallet sweeptx field 
        await this.invoiceModel!.updateMany({ 'wallet.address': { $in: wallets } }, { $push: { sweepTxs: tx } }).exec();
    }

    /**
     * Create an ethers instance of the wallet factory
     */
    async walletFactory(network: string): Promise<WalletFactory> {
        // new ethers instance of the walletfactory from typechain
        const provider = this.helper.ethersProvider(network);
        const contract = this.config.contracts[network]?.walletFactory;
        ValidationUtils.isTrue(!!contract, 'Contract not found for network: ' + network);

        return WalletFactory__factory.connect(
            contract,
            provider,);
    }
}

async function invoiceToPayments(helper: EthereumSmartContractHelper, network: string, tokens: string[], balances: string[]): Promise<InvoicePayment[]> {
    const txId = ""; // TODO: Generate a unique transaction ID
    const from = ""; // TODO: Get the sender address
    const to = ""; // TODO: Get the recipient address
    return Promise.all(tokens.map(async (t, i) => {
        const amountRaw = balances[i];
        const currency = EthereumSmartContractHelper.toCurrency(network, t);
        const baseCurrency = Networks.for(network).baseSymbol;
        const [symbol, amountDisplay] = t.toLocaleLowerCase() === ethers.constants.AddressZero.toLocaleLowerCase() ?
            [baseCurrency, ethers.utils.formatEther(amountRaw).toString()] :
            [await helper.symbol(currency), await helper.amountToHuman(currency, amountRaw)]; 
        const timestamp = Math.round(Date.now() / 1000); // TODO: Get the current timestamp

        return {
            network,
            currency,
            txId,
            from,
            to,
            amountRaw,
            amountDisplay,
            symbol,
            timestamp
        } as InvoicePayment;
    }));
}

function totalAmount(payments: InvoicePayment[]): BigNumber {
    return payments.map(i => BigNumber.from(i.amountRaw)).reduce((prev, cur) => cur.add(prev), BigNumber.from(0));
}

function hasEnoughPayments(invoice: Invoice<any>) {
    return invoice.payments.length > 0 && totalAmount(invoice.payments).gte(BigNumber.from(invoice.amountRaw || '0'));
}
