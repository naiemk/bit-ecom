import { EthereumSmartContractHelper } from "aws-lambda-helper/dist/blockchain";
import { Signer, Wallet, ethers } from "ethers";
import { Injectable, LocalCache, TypeUtils, ValidationUtils } from "ferrum-plumbing";
import fs from 'fs';

export interface ISignerProvider {
  signer(): Promise<Signer>;
}

export class EnvSignerProvider implements ISignerProvider, Injectable {
  private cache = new LocalCache();
  private pw: string = '';
  constructor(private signerWalletFile: string) {
    this.pw = process.env.SIGNER_JSON_FILE_PW!;
    ValidationUtils.isTrue(!!signerWalletFile, 'Make sure to provide "signerWalletFile" config');
    ValidationUtils.isTrue(!!this.pw, 'Make sure to provide "SIGNER_JSON_FILE_PW" env variable');
  }
  __name__(): string {
    return 'EnvSignerProvider';
  }

  async signer(): Promise<Signer> {
    return this.cache.getAsync<Signer>('EnvSignerProvider.signer', async () => {
      return ethers.Wallet.fromEncryptedJsonSync(fs.readFileSync(this.signerWalletFile).toString(), this.pw);
    });
  }
}