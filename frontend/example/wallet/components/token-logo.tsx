import {
  TokenIcon
} from '@token-icons/react'

const commonProps: any ={
  size: 32,
  variant: "mono",
  // className: "my-custom-class",
};

export const TokenLogo = (props: {network: string, token: string}) => 
          (props.token || '').startsWith('0x') ? (
            <TokenIcon
              network={(props.network || '').toLocaleLowerCase() as any}
              address={props.token}
              {...commonProps}
            />
          ) : (
            <TokenIcon
              key={props.token}
              symbol={props.token}
              {...commonProps}
            />
          )
