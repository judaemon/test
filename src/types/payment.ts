import type { PaymentMethod } from "~/lib/payment";

export interface PaymentAccount {
	method: PaymentMethod;
	enabled: boolean;
	label: string;
	/** QR methods only. */
	accountName: string;
	/** Mobile number or bank account number shown under the QR code. */
	accountNumber: string;
	bankName: string;
	qrImage: string;
	/** Short "how to pay" steps for this app. */
	steps: string[];
	/**
	 * A warning shown when shoppers choose this method, e.g. "Please pay before
	 * November 10." Staff change it any time; each order keeps the one it got.
	 */
	notice: string;
}
