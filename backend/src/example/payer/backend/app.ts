import Fastify, {
  FastifyInstance,
  RouteShorthandOptions,
} from "fastify";
import { Container, LocalCache, Networks, ValidationUtils } from "ferrum-plumbing";
import { WalletService } from "../../../data/WalletService";
import { LambdaGlobalContext } from "aws-lambda-helper";
import cfTurnstile from "fastify-cloudflare-turnstile";
import FastifyWebSocket from '@fastify/websocket';
import { AppConfig } from "aws-lambda-helper/dist/AppConfig";
import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { SwapService } from "./SwapService";
import { ExampleModule } from "./ExampleModule";
import { WsMux } from "./WsMux";
import { SwapInvoiceType } from "./Types";
import { HoldingWalletService } from "../../../data/HoldingWalletService";
import cors from '@fastify/cors'
import { ethers } from "ethers";
import { Utils } from "./utils";
require("dotenv").config({ path: process.cwd() + "/localConfig/dev.env" });
console.log("PATH", process.cwd() + "/localConfig/dev.env");

const {parseCurrency} = EthereumSmartContractHelper;

const globalCache = new LocalCache();
async function initContainer(): Promise<FastifyInstance> {
  const server: FastifyInstance = Fastify({});
  const container = await LambdaGlobalContext.container();
  await container.registerModule(new ExampleModule());
  container.register(HoldingWalletService, c => new HoldingWalletService(
    AppConfig.instance().get('holdingWallets'),
    c.get(EthereumSmartContractHelper),
    {} as any, // No signer...
  ));
  globalCache.set("CONTAINER", container);
  const turnstileConf = AppConfig.instance().get("cfTurnstile");
  server.register(cfTurnstile, turnstileConf as any);
  server.register(FastifyWebSocket);
  await server.register(cors, { });
  return server;
}

function getContainer() {
  return globalCache.get("CONTAINER") as Container;
}

const opts: RouteShorthandOptions = {};

async function instrument(call: () => Promise<any>) {
  try {
    return await call();
  } catch (e) {
    console.error("Error in request", e);
    throw e;
  }
}

function configServer(server: FastifyInstance) {
  const wsMux = new WsMux();
  const devMode = AppConfig.instance().get("stage") === 'dev';
  server.get("/ping", opts, async (request, reply) => {
    return { pong: "ok" };
  });

  server.get('/clientconfig', {}, (req, res) => instrument( async () => {
    const c = getContainer();
    const helper = c.get<EthereumSmartContractHelper>(EthereumSmartContractHelper);
    const clientConfig = AppConfig.instance().get<{currencies: string[]}>("client");
    const networkConfig = Array.from(new Set(clientConfig.currencies.map(c => parseCurrency(c)[0]))).map(
      n => ({ ...Networks.for(n) })
    ).reduce((dict, n) => ({...dict, [n.id]: n}), {} as any);
    const tokenConfigF = clientConfig.currencies.map(async c => 
      ethers.utils.isAddress(parseCurrency(c)[1]) ? ({
        currency: c,
        name: await helper.name(c),
        symbol: await helper.symbol(c),
        decimals: await helper.decimals(c),
        isNative: false,
      }) : ({
        currency: c,
        name: parseCurrency(c)[1],
        symbol: parseCurrency(c)[1],
        decimals: 18,
        isNative: true,
      }));
    const tokenConfig = (await Promise.all(tokenConfigF)).reduce((dict, tc) => ({...dict, [tc.currency]: tc}), {} as any);
    return {...clientConfig, networkConfig, tokenConfig};
  }));

  server.get<{Querystring: {currency: string}}>('/liquidity', {}, (requsest) => {
    const c = getContainer();
    const service = c.get<HoldingWalletService>(HoldingWalletService);
    return service.liquidity(requsest.query.currency);
  });

  /**
   * Returns an invoice. Invoice has all the necessary information about payments (i.e. if the invoice is paid)
   * and all the extra data on the invoice, including traching deliverries, etc.
   */
  server.get<{ Querystring: { invoiceId: string } }>("/invoicebyid", { }, (request) =>
      instrument(async () => {
        const c = getContainer();
        ValidationUtils.isTrue(!!request.query.invoiceId, 'Invoice ID is required');
        return await c.get<WalletService>(WalletService).getInvoiceById(request.query.invoiceId);
      })
  );

  server.get<{ Querystring: { id: string } }>("/invoicews", { websocket: true }, async (socket, request) => {
    ValidationUtils.isTrue(!!request.query.id, 'invoiceId is required');
    if (!request.query.id) {
      console.log('A websocket request without id was received. Rejecting...');
      socket.send(JSON.stringify({error: 'id is required'}));
      socket.close();
      // socket.terminate();
    } else {
      console.log('Registering a request for invoice id ', request.query.id);
      console.log('Active connections: ', wsMux.clients.size)
      wsMux.registerSocketForObjectId(request.query.id, socket);
    }
  });

  server.post("/invoiceupdated", {}, async (request, reply) => {
    const body = await request.body as any;
    ValidationUtils.isTrue(!!body?.invoiceIds, 'invoiceIds are required');
    const invoiceIds: string[] = body.invoiceIds || [];
    const walletService = await getContainer().get<WalletService>(WalletService);
    const invoices = await walletService.getInvoicesById(invoiceIds);
    if (!!invoices) {
      for(const i of invoices) {
        wsMux.notify(i.invoiceId, i);
      }
    }
    reply.send({ok:'ok'});
  });

  if (devMode) {
    // Write dev mode only stuff here
  }

  /**
   * Creates a custom invoice for the given use-case. In this case the usecase must follow our example schema.
   */
  server.post(
    "/invoice",
    {
      preValidation: (server as any).cfTurnstile,
      schema: {
        summary: 'New Invoice',
        body: {
          type: 'object',
          properties: {
            fromCurrency: {type: 'string'},
            toAddress: {type: 'string'},
            toCurrency: {type: 'string'},
            toAmountRaw: {type: 'string'},
          },
          required: ['fromCurrency', 'toAddress', 'toCurrency', 'toAmountRaw'],
        }
      }
    },
    (request, reply) =>
      instrument(async () => {
        const { fromCurrency, toAddress, toCurrency, toAmountRaw } = request.body as any;
        const c = getContainer();
        const helper = c.get<EthereumSmartContractHelper>(EthereumSmartContractHelper);
        const fromAmount = (await c.get<SwapService>(SwapService).calculateSwapAmount(
          fromCurrency, toCurrency, toAmountRaw));
        const [fromNetwork,] = EthereumSmartContractHelper.parseCurrency(fromCurrency);
        const [toNetwork,] = EthereumSmartContractHelper.parseCurrency(toCurrency);
        const item = {
          fromNetwork, fromCurrency, toAddress, toNetwork, toCurrency, fromAmountRaw: fromAmount.amountRaw, toAmountRaw,
          payed: false, paymentTxs: [],
          fromAmountDisplay: fromAmount.amount, toAmountDisplay: fromAmount.targetAmount,
          fromSymbol: await Utils.currencySymbol(helper, fromAmount.sourceCurrency),
          toSymbol: await Utils.currencySymbol(helper, fromAmount.targetCurrency),
        } as SwapInvoiceType;
        const invoice = await c
          .get<WalletService>(WalletService)
          .newInvoice(fromNetwork, parseCurrency(fromCurrency)[1], fromAmount.amountRaw, item);
        reply.send(invoice);
      })
  );
  server.get<{Querystring: SwapInvoiceType}>('/quote', {}, (request) => instrument(async () => {
    const {fromCurrency, toCurrency, toAmountRaw} = request.query;
    ValidationUtils.allRequired({fromCurrency, toCurrency, toAmountRaw});
    const c = await getContainer();
    const swap = c.get<SwapService>(SwapService);
    return await swap.calculateSwapAmount(fromCurrency, toCurrency, toAmountRaw);
  }));
}

const start = async () => {
  const server = await initContainer();
  try {
    configServer(server);
    await server.listen({ port: AppConfig.instance().get<any>('server')?.port || 3000 });
    console.log("Server listening at", server.server.address());
 } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
