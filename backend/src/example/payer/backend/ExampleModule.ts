import { Container, Module } from "ferrum-plumbing";
import { SwapConfig, SwapService } from "./SwapService";
import { AppModule } from "../../../AppModule";
import { AppConfig } from "aws-lambda-helper/dist/AppConfig";
import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";

export class ExampleModule implements Module {
    async configAsync(container: Container): Promise<void> {
      await container.registerModule(new AppModule());
      container.registerSingleton(SwapService, c => new SwapService(AppConfig.instance().get<SwapConfig>('swap'), c.get(EthereumSmartContractHelper)));
    }
}