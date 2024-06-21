import { LambdaGlobalContext } from "aws-lambda-helper/dist/LambdaGlobalContext";
import { LocalCache } from "ferrum-plumbing/dist/utils/LocalCache";
import { ExampleModule } from "./ExampleModule";
import { Logger, LoggerFactory, sleep } from "ferrum-plumbing";
import { AppConfig } from "aws-lambda-helper/dist/AppConfig";
import { Injectable } from "ferrum-plumbing/dist/ioc/Container";
import { WalletService } from "../../../data/WalletService";
import { EthereumSmartContractHelper, EthereumTransactionStatus } from "aws-lambda-helper/dist/blockchain";
import { EnvSignerProvider, ISignerProvider } from "../../../EnvSignerProvider";

require("dotenv").config({ path: process.cwd() + "/localConfig/dev.env" });
console.log("PATH", process.cwd() + "/localConfig/dev.env");

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
    private helper: EthereumSmartContractHelper,
    private signer: ISignerProvider,
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
      // TODO: Notify em'all
    }
  }

  async sweep() {
    // Fetch for unsweeped invoices. Sweep-em-all but only from up-to 24 hours ago.
    // The delay is to make sure a paid invoice is processed as paid.
    const wallet = await this.signer.signer();
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
  container.registerSingleton(EnvSignerProvider,
    () => new EnvSignerProvider(AppConfig.instance().get<any>('node')?.signerwallet));
  container.register(Node, c => new Node(c.get(WalletService),
    c.get(EthereumSmartContractHelper),
    c.get(EnvSignerProvider),
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
  try {
    await node.runOnce();
 } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
