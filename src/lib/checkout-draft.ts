import type { BouquetMessage } from "~/lib/bouquet-messages";

/**
 * What's been typed at checkout, kept for this browser tab so a reload or a
 * look back at the shop doesn't lose it. Nothing about payment is kept.
 */
export interface CheckoutDraft {
	className: string;
	company: string;
	serialNumber: string;
	lastName: string;
	firstName: string;
	email: string;
	messages: Record<string, BouquetMessage>;
}

const KEY = "oraia:checkout-draft:v1";

export function readCheckoutDraft(): CheckoutDraft | null {
	try {
		const raw = window.sessionStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as CheckoutDraft) : null;
	} catch {
		return null;
	}
}

export function writeCheckoutDraft(draft: CheckoutDraft) {
	try {
		window.sessionStorage.setItem(KEY, JSON.stringify(draft));
	} catch {
		// Private windows can refuse storage; the form still works without it.
	}
}

export function clearCheckoutDraft() {
	try {
		window.sessionStorage.removeItem(KEY);
	} catch {
		// Nothing to clear.
	}
}
