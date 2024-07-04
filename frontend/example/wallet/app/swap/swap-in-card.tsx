'use client'

import { NetworkDropdown } from "@/components/network-dropdown";
import { errorText, title, viewWidth } from "@/components/primitives";
import { TokenDropdown } from "@/components/token-dropdown";
import { unique } from "@/components/utils";
import { Card } from "@nextui-org/card";
import {Button, Chip, CircularProgress, Input, Link} from "@nextui-org/react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { cfTurnstileToken, clientConfig, getNewInvoiceLoadable, getNewInvoiceRequest, invoice, roundUp, sendQuote, storedSelectedRSendToken, storedSelectedSendNetwork } from "../store/global";
import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation'
import Captcha from "@/components/captcha";

export default function SwapInCard() {
  const config = useAtomValue(clientConfig);
  const refreshInvoice = useSetAtom(getNewInvoiceRequest);
  const invoiceGet = useAtomValue(getNewInvoiceLoadable);
  const [errors, setError] = useState({} as any);
  const [showFee, setShowFee] = useState(false);
  const [captcha, setCaptcha] = useAtom(cfTurnstileToken);
  const [sendNetwork, setSendNetwork] = useAtom(storedSelectedSendNetwork);
  const [sendToken, setSendToken] = useAtom(storedSelectedRSendToken);
  const quoteLoading = useAtomValue(sendQuote);
  const quote = quoteLoading.state === 'hasData' ? quoteLoading.data : {} as any;
  const quoteToken = (config?.tokenConfig || {})[quote?.sourceCurrency];

  const invoiceVal = invoiceGet.state === 'hasData' ? invoiceGet.data : null;
  const { push } = useRouter();
  useEffect(() => {
    if (invoiceGet.state === 'hasData' && invoiceVal) {
      console.log('GOT INVOICE', invoiceVal);
      push(`/invoice/${invoiceVal.invoiceId}`);
    }
  }, [invoiceGet.state, invoiceVal]);

  const validateAndMove = () => {
    let err = {...errors};
    if (!sendNetwork) {err.network= 'Did you select the "network"?';}
    if (!sendToken) {err.token= 'Did you select the "token"?'}
    setError(err);
    if (!err.length) {
      console.log('Refreshing invoices...')
      refreshInvoice().catch(console.error);
    }
  };
  return (
      <Card className={viewWidth()}>
        <h1 className={title()}>
            Pay with any token
        </h1>
        <h2>Select network, and token for payment</h2>
        <NetworkDropdown
          label="Network"
          placeholder="Send payment from this network"
          selected={sendNetwork}
          networks={unique((config.currencies || []).map(c => c.split(':')[0]))}
          onSelect={n => {setSendNetwork(n); setSendToken(''); setError({});}}
          error={errors?.network}
        />
        <TokenDropdown
          label="Pay with token"
          placeholder="The token you want to pay with"
          selected={sendToken}
          network={sendNetwork}
          tokens={unique((config.currencies || []).map(c => c.split(':')).filter(([n, _]) => n === sendNetwork).map(([_, t]) => t))}
          onSelect={n => {setSendToken(n); setError({});}}
          error={errors?.token}
        />

        {!!quoteToken && (
          <Input
            size={'lg'} type="text" label="Payment amount" placeholder={``}
            variant="bordered"
            value={`${roundUp(quote.amount)} ${quoteToken.symbol}`}
            disabled={true}
            readOnly={true}
            description={showFee ? 'FEE INFORMATION' : ''}
            endContent={<Link onClick={() => setShowFee(!showFee)}>fees?</Link>}
            />
        )}

        <Captcha onSuccess={setCaptcha}/>
        <Button color="primary" className="" variant="flat" size={'lg'}
          onClick={() => {validateAndMove();}}
          disabled={!captcha || !quoteToken || invoiceGet.state === 'loading'}
        >
          Go to Payment {invoiceGet.state === 'loading' ? <CircularProgress /> : <></>}
        </Button>
        {invoiceGet.state === 'hasError' ?  <span className={errorText()}>{(invoiceGet.error as Error)?.message}</span> : <></>}
      </Card>
  );
}