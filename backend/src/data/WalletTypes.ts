import { Network } from 'ferrum-plumbing';
import { Connection, Schema, Document } from 'mongoose';

export interface Invoice {
    shopId: String;
    itemId: string;
    metadata: Object;
    createdA: Number;
    validTill: Number;
    token: String;
    network: String;
    addressSeed: String;
    address: String;
}