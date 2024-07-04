import { Turnstile } from '@marsidev/react-turnstile'
import { useAtomValue } from 'jotai';
import { clientConfig } from '@/app/store/global';

export default function Captcha(props: {onSuccess: (t: string) => void}) {
  const config = useAtomValue(clientConfig);
  return !!config?.turnstileSitekey && <Turnstile onSuccess={props.onSuccess} siteKey={config?.turnstileSitekey || ''} />
}
