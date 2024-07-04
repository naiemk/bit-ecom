'use client'

import { title } from "@/components/primitives";
import {Accordion, AccordionItem} from "@nextui-org/accordion";

export default function InvoicePage() {
	return (
		<>
		<div >
			<h1 className={title()}>Admin Functions</h1>
		</div>
		<Accordion className="full-w" variant="splitted">
			<AccordionItem key="1" aria-label="Accordion 1" title="Create New Wallet" subtitle="Force creation of a new wallet">
				ASD
			</AccordionItem>
			<AccordionItem key="2" aria-label="Accordion 2" title="Create New Invoice" subtitle="Re-use wallet if possible">
				ASD
			</AccordionItem>
			<AccordionItem key="3" aria-label="Accordion 3" title="List Wallets" subtitle="Show all created wallets with and without balance">
				ASD
			</AccordionItem>
			<AccordionItem key="4" aria-label="Accordion 4" title="Sweep" subtitle="Initiate a sweep">
				ASD
			</AccordionItem>
		</Accordion>
		</>
	);
}
