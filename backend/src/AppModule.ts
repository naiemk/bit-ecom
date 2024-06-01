import { MongooseConfig } from 'aws-lambda-helper'
import { AppConfig } from 'aws-lambda-helper/dist/AppConfig';
import { Container, Module } from "ferrum-plumbing";
import { WalletService, WalletServiceConfig } from './data/WalletService';
import { EthereumSmartContractHelper } from 'aws-lambda-helper/dist/blockchain';

export class AppModule implements Module {
    async configAsync(c: Container): Promise<void> {
        // Set up the configs
        await AppConfig.instance().loadConstants();
        await AppConfig.instance().forChainProviders();
        await AppConfig.instance().fromSecret('', 'BITECOM');
        console.log('AppConfig loaded', AppConfig.instance().get());
        c.registerSingleton(WalletService, () => new WalletService(
            AppConfig.instance().get<WalletServiceConfig>(),
            c.get(EthereumSmartContractHelper)));
    }
}