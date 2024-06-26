import Fastify, {
  FastifyInstance,
  RouteShorthandOptions,
} from "fastify";
import { Container, LocalCache, ValidationUtils } from "ferrum-plumbing";
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
require("dotenv").config({ path: process.cwd() + "/localConfig/dev.env" });
console.log("PATH", process.cwd() + "/localConfig/dev.env");

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

  server.get('/clientconfig', {}, async (req, res) => {
    return AppConfig.instance().get("client");
  });

  server.get<{Querystring: {currency: string}}>('/liquidity', {}, (requsest) => {
    const c = getContainer();
    const service = c.get<HoldingWalletService>(HoldingWalletService);
    return service.liquidity(requsest.query.currency);
  });

  /**
   * Returns an invoice. Invoice has all the necessary information about payments (i.e. if the invoice is paid)
   * and all the extra data on the invoice, including traching deliverries, etc.
   */
  server.get<{ Querystring: { id: string } }>("/invoicebyid", { }, (request) =>
      instrument(async () => {
        const c = getContainer();
        ValidationUtils.isTrue(!!request.query.id, 'Invoice ID is required');
        return await c.get<WalletService>(WalletService).getInvoiceById(request.query.id);
      })
  );

  server.get<{ Querystring: { id: string } }>("/invoicews", { websocket: true }, async (socket, request) => {
    ValidationUtils.isTrue(!!request.query.id, 'invoiceId is required');
    if (!request.query.id) {
      socket.send(JSON.stringify({error: 'id is required'}));
      socket.close();
      // socket.terminate();
    } else {
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
            fromNetwork: {type: 'string'},
            fromCurrency: {type: 'string'},
            toNetwork: {type: 'string'},
            toAddress: {type: 'string'},
            toCurrency: {type: 'string'},
            toAmountRaw: {type: 'string'},
          },
          required: ['fromNetwork', 'fromCurrency', 'toAddress', 'toNetwork', 'toCurrency', 'toAmountRaw'],
        }
      }
    },
    (request, reply) =>
      instrument(async () => {
        const { fromNetwork, fromCurrency, toAddress, toNetwork, toCurrency, toAmountRaw } = request.body as any;
        const c = await getContainer();
        const fromAmountRaw = (await c.get<SwapService>(SwapService).calculateSwapAmount(
          fromCurrency, toCurrency, toAmountRaw)).amount;
        const item = {
          fromNetwork, fromCurrency, toAddress, toNetwork, toCurrency, fromAmountRaw, toAmountRaw,
          payed: false, paymentTxs: [],
        } as SwapInvoiceType;
        const invoice = await c
          .get<WalletService>(WalletService)
          .newInvoice(fromNetwork, EthereumSmartContractHelper.parseCurrency(fromCurrency)[1], fromAmountRaw, item);
        reply.send(invoice);
      })
  );
  server.get<{Querystring: SwapInvoiceType}>('/quote', {}, async (request) => {
    const {fromCurrency, toCurrency, toAmountRaw} = request.query;
    ValidationUtils.allRequired({fromCurrency, toCurrency, toAmountRaw});
    const c = await getContainer();
    const swap = c.get<SwapService>(SwapService);
    return await swap.calculateSwapAmount(fromCurrency, toCurrency, toAmountRaw);
  });
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
