import {Select, SelectItem} from "@nextui-org/react";
import { TokenLogo } from "./token-logo";
import { useAtomValue } from "jotai";
import { clientConfig } from "@/app/store/global";

export function TokenDropdown(props: {label: string,
  placeholder: string,
  network: string,
  tokens: string[],
  selected: string,
  error: string|undefined,
  onSelect: (k: string) => void }) {
  const tokenConfig = useAtomValue(clientConfig)?.tokenConfig;
  const tok = (token: string, network: string) => tokenConfig[`${network}:${token}`];
  const n = props.network;
  return (
    <Select
      label={props.label}
      placeholder={props.placeholder}
      className=""
      selectedKeys={[props.selected]}
      onSelectionChange={e => props.onSelect(Array.from(e as string)[0])}
      errorMessage={props.error}
      isInvalid={!!props.error}
    >
      {props.tokens.map(
        (token, i) => <SelectItem key={token} startContent={<TokenLogo key={i} network={props.network} token={token}/>}>
          {(tok(token, n)?.name || 'token') + (!tok(token, n)?.isNative ? ` (${tok(token, n)?.symbol})` : '')}
        </SelectItem>
      )}
    </Select>
  )
}