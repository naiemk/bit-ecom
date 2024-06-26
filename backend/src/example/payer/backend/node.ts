import { LambdaGlobalContext } from "aws-lambda-helper/dist/LambdaGlobalContext";
import { LocalCache } from "ferrum-plumbing/dist/utils/LocalCache";
import { ExampleModule } from "./ExampleModule";
import { Logger, LoggerFactory, sleep } from "ferrum-plumbing";
import { AppConfig } from "aws-lambda-helper/dist/AppConfig";
import { Injectable } from "ferrum-plumbing/dist/ioc/Container";
import { WalletService } from "../../../data/WalletService";
import { EthereumSmartContractHelper, EthereumTransactionStatus } from "aws-lambda-helper/dist/blockchain";
import { EnvSignerProvider, ISignerProvider } from "../../../EnvSignerProvider";
import { HoldingWalletService } from "../../../data/HoldingWalletService";
import { Invoice } from "../../../data/Types";
import { SwapInvoiceType } from "./Types";
import axios from 'axios';
import { ParseArgsConfig, parseArgs } from 'node:util';


require("dotenv").config({ path: process.cwd() + "/localConfig/dev.env" });
console.log("PATH", process.cwd() + "/localConfig/dev.env");

interface NodeConfig {
  walletServiceEndpoint: string;
  nodeSecret: string;
}

function dateRange(): [number, number] {
  const lookBack = 24 * 3600 * 1000;
  return [Date.now() - lookBack, Date.now()];
}

function dateRangeForSweep(): [number, number] {
  const startLookBack = 3 * 24 * 3600 * 1000;
  const lookBack = 1 * 24 * 3600 * 1000;
  return [Date.now() - startLookBack, Date.now() - lookBack];
}

class Node implements Injectable {
  private log: Logger;
  constructor(
    private walletService: WalletService,
    private holdingWallet: HoldingWalletService,
    private helper: EthereumSmartContractHelper,
    private signerForWallet: ISignerProvider,
    private config: NodeConfig,
    logger: LoggerFactory) {
    this.log = logger.getLogger(Node);
  }
  __name__(): string {
    return 'Node';
  }

  async runOnce() {
    // Fetch for unpaid invoices. Check if paid, set them as paid
    const [from, to] = dateRange();
    const allInvoices = await this.walletService.getInvoices(from, to);
    const networks = Array.from(new Set(allInvoices.map(i => i.wallet.network)));
    const tokens = Array.from(new Set(allInvoices.map(i => i.wallet.currency)));
    this.log.info(`********* We have ${allInvoices.length} invoices, from ${networks.length} networks, for ${tokens.length} tokens.`);
    for(const network of networks) {
      const updated = await this.walletService.checkAndUpdatePayments(network, from, to);
      this.log.info(`********* Paid ${updated.length} invoices on ${network}`);
      await this.notifyInvoicesChanged(updated.map(i => i.invoiceId));
      // TODO: Notify em'all
    }
  }

  async sweep() {
    // Fetch for unsweeped invoices. Sweep-em-all but only from up-to 24 hours ago.
    // The delay is to make sure a paid invoice is processed as paid.
    const wallet = await this.signerForWallet.signer();
    const [from, to] = dateRangeForSweep();
    const allInvoices = await this.walletService.getInvoices(from, to);
    const networks = Array.from(new Set(allInvoices.map(i => i.wallet.network)));
    const tokens = Array.from(new Set(allInvoices.map(i => i.wallet.currency)));
    this.log.info(`Sweep: We have ${allInvoices.length} invoices, from ${networks.length} networks, for ${tokens.length} tokens.`);
    for(const network of networks) {
      const forSweep = await this.walletService.getInvoicesForSweep(network, from, to);
      const wf = await this.walletService.walletFactory(network);
      const walletsForSweep = forSweep.map(fs => fs.wallet.address);
      const saltsForSweep = forSweep.map(fs => fs.wallet.salt);
      const saltsForDeploy: string[] = (await wf.needsDeploy(walletsForSweep)).map(
          (needs, i) => needs ? saltsForSweep[i] : undefined
        ).filter(s => !!s).map(s => s!);
      if (saltsForDeploy.length > 0) {
        // Deploy wallets needing deploy
        this.log.info(`Need to deploy ${saltsForDeploy.length} wallets on ${network}`)
        const depTx = await wf.connect(wallet).multiDeploy(saltsForDeploy);
        this.log.info(`Deployed using tx id "${network}:${depTx}"`)
        await this.trackTransaction(network, depTx.hash);
      }
      if (walletsForSweep.length > 0) {
        this.log.info(`Sweeping for "${network}" - ${walletsForSweep.length} wallets and ${tokens.length} tokens`);
        const sweepTx = await wf.connect(wallet).sweepMulti(tokens, walletsForSweep);
        await this.trackTransaction(network, sweepTx.hash);
      }
    }
  }

  async pay() {
    const [from, to] = dateRange();
    const allInvoices: Invoice<SwapInvoiceType>[] = await this.walletService.getInvoices(from, to);
    const notPaid = allInvoices.filter(i => !!i.item && !i.item.payed);
    for(const inv of notPaid) {
      const changed = await this.processSinglePayment(inv);
      if (changed) {
        await this.notifyInvoicesChanged([inv.invoiceId]);
      }
    }
  }

  /***
   * Return true if invoice changed...
   */
  async processSinglePayment(inv: Invoice<SwapInvoiceType>): Promise<boolean> {
    const paymentTxs = inv.item.paymentTxs || [];
    if (paymentTxs.find(pt => pt.status === 'successful')) {
      // Already paid. Set it as paid.
      await this.walletService.updateInvoiceById(inv.invoiceId, {...inv.item, paid: true});
      return true;
    }

    if (paymentTxs.find(pt => !pt.status || pt.status == 'pending')) {
      const pending = paymentTxs.find(pt => !pt.status || pt.status == 'pending')!;
      const status = await this.helper.getTransactionStatus(inv.item.toNetwork, pending.txId, pending.submissionTime || inv.creationTime);
      if (status == 'successful') {
        pending.status === 'successful';
        await this.walletService.updateInvoiceById(inv.invoiceId, {...inv.item, paid: true});
        return true;
      }
      
      if (status === 'failed' || status === 'timedout') {
        pending.status === status;
        await this.walletService.updateInvoiceById(inv.invoiceId, {...inv.item});
        return true;
      }

      // If just pending do nothing...
      return false;
    }

    // We know there is no pending at this point.
    if (paymentTxs.length === 0 || !paymentTxs.find(pt => pt.status === 'sucessful')) {
      // Pay the invoice
      const isPaid = await this.holdingWallet.isPaid(inv.item.toNetwork, inv.invoiceId);
      if (isPaid) {
        console.log(`Setting invoice "${inv.invoiceId}" to PAID. But there was no sucessful paiment tx found!!!`);
        await this.walletService.updateInvoiceById(inv.invoiceId, {...inv.item, paid: true});
        return true;
      }

      // TODO: VALIDATE THE SWAP OBJECT. DONT TRUST THE DATABASE!!!
      // Pay the invoice and update the DB
      const txId = await this.holdingWallet.pay(inv.item.toCurrency, inv.invoiceId, inv.item.toAddress, inv.item.toAmountRaw);
      await this.walletService.updateInvoiceById(inv.invoiceId, {...inv, paymentTxs: [...paymentTxs, { txId, status: '', submissionTime: Date.now() }]});
      return true;
    }
    return false;
  }

  async notifyInvoicesChanged(invoiceIds: string[]) {
    if (!!this.config.walletServiceEndpoint) {
      await axios.post(`${this.config.walletServiceEndpoint}/invoiceupdated`, {invoiceIds}, {
        headers: { 'X-NodeSecret': this.config.nodeSecret }
      });
    }
  }

  async trackTransaction(network: string, txid: string) {
    const submissionTime = Date.now();
    let status: EthereumTransactionStatus|undefined;
    do {
      await sleep(500);
      status = await this.helper.getTransactionStatus(network, txid, submissionTime);
      this.log.info(`Got tx status for tx "${network}:${txid}" => ${status}`);
    } while (!status || status === 'pending');
    if (!status || status === 'timedout' || status === 'failed') {
      this.log.error(`Error submitting tx "${network}:${txid}" ==> ${status}`);
      throw new Error(`Error submitting tx "${network}:${txid}" ==> ${status}`);
    }
  }
}

const globalCache = new LocalCache();
async function initContainer() {
  const container = await LambdaGlobalContext.container();
  await container.registerModule(new ExampleModule());
  container.registerSingleton('EnvSignerProviderForPayer',
    () => new EnvSignerProvider(AppConfig.instance().get<any>('node')?.signerwallet));
  container.registerSingleton('EnvSignerProviderForSigner',
    () => new EnvSignerProvider(AppConfig.instance().get<any>('node')?.signerwallet));
  container.register(Node, c => new Node(c.get(WalletService),
    c.get(EthereumSmartContractHelper),
    c.get('EnvSignerProviderForSigner'),
    c.get('EnvSignerProviderForPayer'),
    AppConfig.instance().get('node'), // Node config
    c.get(LoggerFactory)));
  globalCache.set("CONTAINER", container);
  return container.get<Node>(Node);
}

/**
 * Node is the process responsible for tracking invoice events, and updating the invoice.
 * We define a simple cli. But in prod its better to be a daemon service.
 */

const start = async () => {
  const node = await initContainer();
  // const  = ['--process-invoices', '--pay', '--sweep'];
  const argConf = {
    options: {
      run: {
        type: 'string',
      },
    }
  } as ParseArgsConfig;
  try {
    const parsed = parseArgs(argConf);
    const runType = parsed.values.run;
    if (runType === 'process-invoice') {
      await node.runOnce();
    } else if (runType === 'pay') {
      await node.pay();
    } else if (runType === 'sweep') {
      await node.sweep();
    } else {
      console.log(`--run type ${runType} not found!`);
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    const {name, message} = err as any;
    if (name === 'TypeError') {
      console.log(message);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
};

start();
