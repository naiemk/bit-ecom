'use client'

import { Card } from "@nextui-org/card";
import {Button, Slider} from "@nextui-org/react";
import { useAtom, useAtomValue } from "jotai";
import { clientConfig, numOrZero, selectReceiveAddress, storedSelectedReceiveAmount, storedSelectedReceiveNetwork, storedSelectedReceiveToken } from "../store/global";
import { NetworkDropdown } from "@/components/network-dropdown";
import { TokenDropdown } from "@/components/token-dropdown";
import { subtitle, title, viewWidth } from "@/components/primitives";
import { unique } from "@/components/utils";
import {Input} from "@nextui-org/input";
import { IoQrCode } from "react-icons/io5";
import { useState } from "react";
import SwapInCard from "./swap-in-card";

export default function SwapPage() {
  const config = useAtomValue(clientConfig);
  const [errors, setError] = useState({} as any);
  const [editMode, setEditMode] = useState(true);
  const [receiveNetwork, setReceiveNetwork] = useAtom(storedSelectedReceiveNetwork);
  const [receiveToken, setReceiveToken] = useAtom(storedSelectedReceiveToken);
  const [receiveAmount, setReceiveAmount] = useAtom(storedSelectedReceiveAmount);
  const [receiveAddress, setReceiveAddress] = useAtom(selectReceiveAddress);
  const token = (config?.tokenConfig || {})[`${receiveNetwork}:${receiveToken}`];
  const validateAndMove = () => {
    let err = {...errors};
    if (!receiveNetwork) {err.network= 'Did you select the "network"?';}
    if (!receiveToken) {err.token= 'Did you select the "token"?'}
    if (!receiveAddress) {err.address= 'Did you provide the address"?'}
    if (!!receiveAddress && receiveAddress.length != 42) {err.address= 'Address is not valid'}
    setError(err);
    if (!(err.network || err.token || err.address)) { setEditMode(false); }
  };
  const [rangeMin, rangeMax] = !!token ? config.validRanges[token.currency].map(v => numOrZero(v)) : [0, 0];
  if (editMode) {
    return (
      <Card className={viewWidth()}>
        <h1 className={title()}>
            Receive Token for Gas
        </h1>
        <h2>Select network and token to receive</h2>
        <NetworkDropdown
          label="Network"
          placeholder="Receive token on this network"
          selected={receiveNetwork}
          networks={unique((config.currencies || []).map(c => c.split(':')[0]))}
          onSelect={n => {setReceiveNetwork(n); setReceiveToken(''); setError({})}}
          error={errors?.network}
        />
        <TokenDropdown
          label="Token to receive"
          placeholder="The token you want to receive"
          selected={receiveToken}
          network={receiveNetwork}
          tokens={unique((config.currencies || []).map(c => c.split(':')).filter(([n, _]) => n === receiveNetwork).map(([_, t]) => t))}
          onSelect={n => {setReceiveToken(n); setError({});}}
          error={errors?.token}
        />

        <Slider   
          size="lg"
          step={Math.round(10000 * (rangeMax - rangeMin) / 10) / 10000}
          color="foreground"
          label={!!token ? `Amount (${rangeMin} - ${rangeMax})` : 'Amount'}
          value={receiveAmount || rangeMin}
          showSteps={true} 
          minValue={rangeMin} 
          maxValue={rangeMax} 
          defaultValue={(rangeMax + rangeMin) / 2}
          className=""
          onChange={v => {setReceiveAmount(v as any); setError({});}}
        />

        <Input
          size={'lg'} type="address" label="Address" placeholder={`Address to receive ${token?.symbol || 'tokens'}`}
          value={receiveAddress}
          onValueChange={v => {setReceiveAddress(v); setError({});}}
          endContent={ <IoQrCode /> }
          errorMessage={errors?.address}
          isInvalid={!!errors?.address}
          />

        <Button color="primary" className="" variant="flat" size={'lg'} onClick={() => validateAndMove()}>
          Continue
        </Button>  
      </Card>);
  } else {
    return (
      <>
      <Card className={viewWidth()}>
        <h2 className={subtitle()}>
            Receive Token for Gas
        </h2>
        <Input
          size={'lg'} type="text" label="Receive Network" placeholder={``}
          value={receiveNetwork}
          disabled={true}
          />
        <Input
          size={'lg'} type="text" label="Receive Amount" placeholder={``}
          value={`${receiveAmount} ${token?.symbol}` }
          disabled={true}
          />

        <Input
          size={'lg'} type="text" label="To Address" placeholder={``}
          value={receiveAddress}
          disabled={true}
          />

        <Button color="default" className="" variant="flat" size={'lg'} onClick={() => setEditMode(true)}>
          Update
        </Button>  
      </Card>
      <div className="p-8"> </div>
      <SwapInCard />
      </>
      );
  }
}
