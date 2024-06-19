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
        console.log('AppConfig loaded', 
            // AppConfig.instance().get(),
            process.env["CONFIG_FILE_BITECOM"]);
        c.registerSingleton(EthereumSmartContractHelper, () => new EthereumSmartContractHelper(AppConfig.instance().getChainProviders()));
        console.log('EthereumSmartContractHelper initialized');

        c.registerSingleton(WalletService, () => new WalletService(
            AppConfig.instance().get<WalletServiceConfig>(),
            c.get(EthereumSmartContractHelper)));

        await c.get<WalletService>(WalletService).init(AppConfig.instance().get<MongooseConfig>("database"));
        console.log('App module initialzied');
    }
}