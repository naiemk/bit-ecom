'use client'

import { title } from "@/components/primitives";
import {Card, CardHeader, CardBody, CardFooter,} from "@nextui-org/card";
import {Divider} from '@nextui-org/divider';
import {Image} from '@nextui-org/image';
import {Link} from '@nextui-org/link';

export default function WalletPage() {
	return (
	<Card className="max-w-[400px]">
      <CardHeader className="flex gap-3">
        <Image
          alt="nextui logo"
          height={40}
          radius="sm"
          src="https://avatars.githubusercontent.com/u/86160567?s=200&v=4"
          width={40}
        />
        <div className="flex flex-col flex-start">
          <p className="text-md">Your Invoice</p>
          <p className="text-small text-default-500">Send USDT to the following address on the following network</p>
        </div>
      </CardHeader>
      <Divider/>
      <CardBody>
		<h1>QR CODE</h1>
		<h3>address</h3>
		<h3>amount USDT</h3>
		<small>Make sure to only use the right network</small>
		<small>Time left: ..... ms</small>
      </CardBody>
      <Divider/>
      <CardFooter>
        <Link
          isExternal
          showAnchorIcon
          href="https://github.com/nextui-org/nextui"
        >
          Visit source code on GitHub.
        </Link>
      </CardFooter>
    </Card>
	);
}
