import Fastify, { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify'
import { Container, LocalCache } from 'ferrum-plumbing';
import { AppModule } from './AppModule';
import { WalletService } from './data/WalletService';
import { LambdaGlobalContext } from 'aws-lambda-helper';
require("dotenv").config({ path: __dirname.replace('src', '') + "localConfig/dev.env" })
console.log('PATH', __dirname.replace('src','') + "localConfig/dev.env" )

interface Pagination {
  from: number; len: number;
  network: string;
}

const globalCache = new LocalCache();
async function initContainer() {
  const container = await LambdaGlobalContext.container();
  await container.registerModule(new AppModule());
  globalCache.set('CONTAINER', container);
}

async function getContainer() {
  return globalCache.get('CONTAINER') as Container;
}

const server: FastifyInstance = Fastify({});

const opts: RouteShorthandOptions = {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          pong: {
            type: 'string'
          }
        }
      }
    }
  }
}

async function instrument(call: () => Promise<any>) {
  try {
    return await call();
  } catch (e) {
    console.error('Error in request', e);
    throw e;
  }
}

server.get('/ping', opts, async (request, reply) => {
  return { pong: 'ok' }
});

server.get<{Querystring: Pagination}>('/payments', opts, async (request, reply) => {
  // Returns the list of invoices, with pagination
  const from = request.query.from || 0;
  const len = request.query.len || 40 * 3600; // 40 hours default
  const to = from + len;
  const network = request.query.network;
  const c = await getContainer();
  const payments = c.get<WalletService>(WalletService).checkPayments(network, from, to);
  reply.send(payments);
});

server.get<{Querystring: Pagination}>('/invoices', opts, async (request, reply) => {
  // Returns the list of wallets with balance, with pagination
  const from = request.query.from || 0;
  const len = request.query.len || 40;
  const to = from + len;
  const c = await getContainer();
  const invoices = c.get<WalletService>(WalletService).getInvoices(from, to);
  reply.send(invoices);
});

server.post('/invoice', opts, (request, reply) => instrument(async () => {
  // Create a new invoice. Invoice will be recorded, and comes with a wallet attached
  const {network, token, amountRaw, item} = request.body as any;
  const c = await getContainer();
  const invoice = await c.get<WalletService>(WalletService).newInvoice(network, token, amountRaw, Date.now(), item);
  reply.send(invoice);
}));

server.post<{}>('/sweep', opts, async (request, reply) => {
  // Executes the sweep operation, using registered account for gas, for given currencies
  // It will list all the wallets that are not empty, per currency, then sweeps them
  const bod = request.body as any;
  const network = bod.network;
  const tokens = bod.tokens;
  const wallets = bod.wallets;
  const c = await getContainer();
  const ws = c.get<WalletService>(WalletService);
  const txid = await ws.bulkSweepPaidWallets(network, wallets, tokens);
  reply.send({ network, txid });
});

const start = async () => {
  try {
    await initContainer();
    await server.listen({ port: 3000 })
    console.log('Server listening at', server.server.address());

    const address = server.server.address()
    const port = typeof address === 'string' ? address : address?.port

  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start();