import clsx from "clsx";
import { fontSans } from "@/config/fonts";
import dynamic from 'next/dynamic'

const Prov = dynamic(() => import('./layoutD'), { ssr: false, })

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head />
			<body
				className={clsx(
					"min-h-screen bg-background font-sans antialiased",
					fontSans.variable
				)}
			>
      <Prov children={children} />
			</body>
		</html>
	);
}
