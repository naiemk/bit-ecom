import { Container, Module } from "ferrum-plumbing";
import { SwapConfig, SwapService } from "./SwapService";
import { AppModule } from "../../../AppModule";
import { AppConfig } from "aws-lambda-helper/dist/AppConfig";

export class ExampleModule implements Module {
    async configAsync(container: Container): Promise<void> {
      await container.registerModule(new AppModule());
      container.register(SwapService, c => new SwapService(AppConfig.instance().get<SwapConfig>('swap')));
    }
}