'use client'

import { useParams } from "next/navigation";
import { atom, useAtom, useAtomValue } from 'jotai';
import { QRCode } from 'react-qrcode-logo';
import { getInvoiceById, getInvoiceByIdLoadable, Invoice, invoinceIdFromUrl } from "@/app/store/global";
import { Card } from "@nextui-org/card";
import { viewWidth } from "@/components/primitives";
import { Spinner } from "@nextui-org/spinner";
import { useHydrateAtoms } from "jotai/utils";
import { UiUtils } from "@/app/uiUtils";

const InvoicePage = () => {
	const { invoiceid } = useParams<{ invoiceid: string }>();
	useHydrateAtoms([[invoinceIdFromUrl, invoiceid]]);
	const invoiceLoadable = useAtomValue(getInvoiceByIdLoadable);
	console.log('INVOICE ID: ', invoiceid, invoiceLoadable);
	const invoice = (invoiceLoadable as any).data as any as Invoice;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(invoice?.wallet?.addressForDisplay || '');
  };

	if (invoiceLoadable.state === 'loading') {
		return (
			<Card className={viewWidth()}>
				<div className="flex flex-col w-full flex-1">
					<Spinner />
				</div>
			</Card> );
	} else if (invoiceLoadable.state === 'hasError') {
		return (
			<Card className={viewWidth()}>
				<div className="flex flex-col w-full p-4">
					<p className="text-red-500">Error loading invoice: <span>{(invoiceLoadable.error || {} as any).message}</span></p>
				</div>
			</Card> );
	}

  if (!invoice) {
		return (
			<Card className={viewWidth()}>
				<div className="flex flex-col w-full p-4">
					<p className="text-red-500">Invoice not found - id: {invoiceid}</p>
				</div>
			</Card> );
  }

	const paymentAddress = invoice?.wallet?.addressForDisplay || '';
  const network = (invoice.currency || '').split(':')[0];
  return (
		<Card className={viewWidth()}>
		<div className="flex flex-col w-full p-4 max-w-fit">
      {/* Payment Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold">Payment required</h1>
      </div>

      {/* QR Code and Address */}
      <div className="flex items-center mb-4 flex-col-reverse sm:flex-row">
        <div className="flex-1">
          <a onClick={handleCopyToClipboard}><QRCode value={paymentAddress} size={128} /></a>
          <p className="text-sm font-bold">{paymentAddress.substring(0, 6)}...{paymentAddress.substring(paymentAddress.length - 4, paymentAddress.length)}</p>
        </div>
        <div className="flex-1 ml-4 text-right pb-8">
        <p className="text-2xl font-bold">{UiUtils.roundAmount(invoice?.amountDisplay)} {invoice?.symbol}</p>
          <p className="text-sm mt-2">{network} network</p>
        </div>
      </div>

      {/* Send Tokens Section */}
      <div className="mb-4">
        <p className="text-sm mb-2">Send tokens to this address on {network} network</p>
        <div className="flex items-center border border-gray-300 rounded p-2">
          <input
            type="text"
            className="flex-1 text-xs"
            value={paymentAddress}
            readOnly
          />
          <button className="ml-2 bg-gray-300 text-xs px-2 py-1 rounded" onClick={handleCopyToClipboard}>C</button>
        </div>
        <p className="text-xs mt-2 text-gray-500">
          Make sure to send tokens to this address ONLY on the {network} network.
          Sending tokens to other networks will lead to permanent loss.
        </p>
      </div>

      {/* Status Section */}
      <div className="mb-4">
        {
          invoice.paid ? (
            <p className="text-sm text-green-500">Payment received</p>
          ) : (
            <p className="text-sm text-violet-500">Payment pending</p>
          )
        }
      </div>

      {/* Invoice ID */}
      <div className="border-t border-gray-300 pt-2 text-xs text-right">
        <p>Invoice ID: {invoiceid}</p>
      </div>
    </div>
		</Card>
  );
};

export default InvoicePage;