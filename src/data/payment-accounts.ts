import type { QrPaymentMethod } from "~/lib/payment";

export interface QrPaymentAccount {
	label: string;
	accountName: string;
	/** Mobile number or bank account number shown under the QR code. */
	accountNumber: string;
	/** Bank name, for bank transfers. */
	bankName?: string;
	qrImage: string;
	/** Short "how to pay" steps for this app. */
	steps: string[];
}

// SAMPLE DETAILS — replace the account names/numbers and the QR images in
// public/images/payments/ with ORAIA's real GCash, Maya and bank QR Ph codes.
export const qrPaymentAccounts: Record<QrPaymentMethod, QrPaymentAccount> = {
	gcash: {
		label: "GCash",
		accountName: "ORAIA Flowers",
		accountNumber: "0917 000 0000",
		qrImage: "/images/payments/gcash-qr.svg",
		steps: [
			"Open GCash and tap Pay QR.",
			"Scan the code, or save it and tap Upload QR.",
			"Pay the exact amount, then screenshot the receipt.",
		],
	},
	maya: {
		label: "Maya",
		accountName: "ORAIA Flowers",
		accountNumber: "0918 000 0000",
		qrImage: "/images/payments/maya-qr.svg",
		steps: [
			"Open Maya and tap Scan to Pay.",
			"Scan the code, or save it and upload it from your gallery.",
			"Pay the exact amount, then screenshot the receipt.",
		],
	},
	bank: {
		label: "Bank transfer",
		bankName: "BDO Unibank",
		accountName: "ORAIA Flowers Trading",
		accountNumber: "0000 0000 0000",
		qrImage: "/images/payments/bank-qr.svg",
		steps: [
			"Open your banking app and choose QR Ph / InstaPay.",
			"Scan the code, or transfer to the account details below.",
			"Send the exact amount, then screenshot the confirmation.",
		],
	},
};
