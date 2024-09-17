import { BigNumber } from 'bignumber.js';

export class UiUtils {
  static roundAmount(amount: string) {
    return new BigNumber(amount || '0').decimalPlaces(5, BigNumber.ROUND_CEIL).toString();
  }
}