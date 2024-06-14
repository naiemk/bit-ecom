# Wallet manager smart contract and backend

Use this project to create invoices, for e-commerce payments.

## On-chain Invoice Representations
Invoices are assigned a wallet with the following criteria:

1. Wallet is `CREATE2`, base on a salt. So no transaction is required for getting a wallet
2. A wallet is a proxy. It can receive ETH and ERC-20. It can sweep them to the hardcoded `sweepTo` address on the implementation
3. Once payment is received, the wallet can be sweeped. We support bulk sweep of wallets, for multi-token.
4. Before sweep, the wallet MUST be deployed. We support `multiDeploy`
5. The cost of deploy and sweep for a single wallet is slightly higher than the cost of sending gas to the wallet, then to sweep it later. However, with multiSweep this gap will be reduced. Still will always be a bit higher, unless if we start re-using wallets. (E.g. after a timeout) in which case the charge can start becoming cheaper, as no deploy will be necessary for re-use and the sweep is happening in bulk.


## Steps to Manage Invoices Properly

1. Create your invoices `/invoice`
2. Check for payment `/payments`
3. Once every while, call `/updatePaid` to update the payment status on DB(step 2)
4. Once every while, call `/forsweep` to get a list of invoices that need to be sweeped (paid fully, or timed-out)
5. Deploy all the invoices from step 4 by calling `multiDeploy`
6. Call `/forsweepparams` to get list of tokens and wallets for sweep
7. Call `sweepMulti` with the result of step 6, to sweep the payments
