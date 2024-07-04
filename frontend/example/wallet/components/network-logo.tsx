import {
  NetworkBinanceSmartChain,
  NetworkEthereum,
  NetworkAvalanche,
  NetworkTron,
  NetworkPolygon,
  NetworkBitcoin,
} from '@token-icons/react'

const commonProps: any ={
  size: 32,
  variant: "mono",
  // className: "my-custom-class",
};

const NETWORK_LOOKUP: { [k: string]: React.ReactElement } = {
  'ETHEREUM': <NetworkEthereum {...commonProps}/>,
  'TRON': <NetworkTron {...commonProps}/>,
  'POLYGON': <NetworkPolygon {...commonProps}/>,
  'BSC': <NetworkBinanceSmartChain {...commonProps}/>,
  'AVALANCHE': <NetworkAvalanche {...commonProps}/>,
  'DEFAULT': <NetworkBitcoin {...commonProps}/>,
}

export const NetworkLogo = (props: {network: string}) => NETWORK_LOOKUP[props.network] || NETWORK_LOOKUP['DEFAULT'];