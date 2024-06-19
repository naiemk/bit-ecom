import Fastify, {
  FastifyInstance,
  RouteShorthandOptions,
} from "fastify";
import { Container, LocalCache } from "ferrum-plumbing";
import { AppModule } from "../../../AppModule";
import { WalletService } from "../../../data/WalletService";
import { LambdaGlobalContext } from "aws-lambda-helper";
import cfTurnstile from "fastify-cloudflare-turnstile";
import { AppConfig } from "aws-lambda-helper/dist/AppConfig";
import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { SwapService } from "./SwapService";
import { ExampleModule } from "./ExampleModule";
require("dotenv").config({ path: process.cwd() + "/localConfig/dev.env" });
console.log("PATH", process.cwd() + "/localConfig/dev.env");

const globalCache = new LocalCache();
async function initContainer(): Promise<FastifyInstance> {
  const server: FastifyInstance = Fastify({});
  const container = await LambdaGlobalContext.container();
  await container.registerModule(new ExampleModule());
  globalCache.set("CONTAINER", container);
  const turnstileConf = AppConfig.instance().get("cfTurnstile");
  server.register(cfTurnstile, turnstileConf as any);
  return server;
}

async function getContainer() {
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
  const devMode = AppConfig.instance().get("stage") === 'dev';
  server.get("/ping", opts, async (request, reply) => {
    return { pong: "ok" };
  });

  /**
   * Returns an invoice. Invoice has all the necessary information about payments (i.e. if the invoice is paid)
   * and all the extra data on the invoice, including traching deliverries, etc.
   */
  server.get<{ Querystring: { id: string } }>(
    "/invoice",
    opts,
    (request, reply) =>
      instrument(async () => {
        // Returns the list of wallets with balance, with pagination
        const c = await getContainer();
        // //   const invoices = await c.get<WalletService>(WalletService).getInvoices(id, to);
        //   reply
        //     .code(200)
        //     .header('Content-Type', 'application/json; charset=utf-8')
        //     .send(invoices);
        //   return invoices;
      })
  );

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
            fromAddress: {type: 'string'},
            fromNetwork: {type: 'string'},
            fromCurrency: {type: 'string'},
            toAddress: {type: 'string'},
            toNetwork: {type: 'string'},
            toCurrency: {type: 'string'},
            receiveAmountRaw: {type: 'string'},
          },
          required: ['fromAddress', 'fromNetwork', 'fromCurrency', 'toAddress', 'toNetwork', 'toCurrency', 'receiveAmountRaw'],
        }
      }
    },
    (request, reply) =>
      instrument(async () => {
        const { fromAddress, fromNetwork, fromCurrency, toAddress, toNetwork, toCurrency, receiveAmountRaw } = request.body as any;
        const c = await getContainer();
        const sendAmountRaw = await c.get<SwapService>(SwapService).calculateSwapAmount(
          fromCurrency, toCurrency, receiveAmountRaw);
        const item = {
          fromAddress, fromNetwork, fromCurrency, toAddress, toNetwork, toCurrency, sendAmountRaw, receiveAmountRaw,
        };
        const invoice = await c
          .get<WalletService>(WalletService)
          .newInvoice(fromNetwork, EthereumSmartContractHelper.parseCurrency(fromCurrency)[1], sendAmountRaw, item);
        reply.send(invoice);
      })
  );
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
