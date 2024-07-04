import {Select, SelectItem} from "@nextui-org/react";
import { NetworkLogo } from "./network-logo";
import { useAtomValue } from "jotai";
import { clientConfig } from "@/app/store/global";

export function NetworkDropdown(props: {
  label: string,
  placeholder: string,
  networks: string[],
  selected: string,
  error: string | undefined,
  onSelect: (k: string) => void }) {

  const networkConfig = useAtomValue(clientConfig)?.networkConfig;
  return (
    <>
    <Select
      label={props.label}
      placeholder={props.placeholder}
      className=""
      selectedKeys={[props.selected]}
      onSelectionChange={e => props.onSelect(Array.from(e as string)[0])}
      errorMessage={props.error}
      isInvalid={!!props.error}
    >
      {props.networks.map(
        (network) => <SelectItem key={network} startContent={<NetworkLogo network={network} />}>
          {networkConfig[network]?.displayName}
        </SelectItem>
      )}
    </Select>
    </>
  )
}