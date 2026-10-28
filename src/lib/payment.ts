export const PAYMENT_METHODS = ["card", "gcash", "maya", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type QrPaymentMethod = Exclude<PaymentMethod, "card">;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
	card: "Card",
	gcash: "GCash",
	maya: "Maya",
	bank: "Bank transfer",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
	return PAYMENT_METHODS.includes(value as PaymentMethod);
}

/** QR methods are settled outside the site, so they need proof of payment. */
export function isQrPayment(method: PaymentMethod): method is QrPaymentMethod {
	return method !== "card";
}

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validateReferenceNumber(value: string): string | undefined {
	const compact = normalizeReferenceNumber(value);
	if (!compact) return "Enter the reference number from your receipt.";
	if (!/^[A-Za-z0-9]{6,30}$/.test(compact))
		return "Use the 6–30 letters or digits shown on your receipt.";
	return undefined;
}

/** Strips the spaces and dashes apps insert for readability. */
export function normalizeReferenceNumber(value: string) {
	return value.replace(/[\s-]/g, "");
}

export function validateProofFile(
	file: { type: string; size: number } | null | undefined,
): string | undefined {
	if (!file || file.size === 0)
		return "Upload a screenshot of your payment receipt.";
	if (!PROOF_MIME_TYPES.includes(file.type))
		return "Use a PNG, JPG or WEBP image.";
	if (file.size > PROOF_MAX_BYTES) return "Keep the image under 5 MB.";
	return undefined;
}

/**
 * Checks an upload's leading bytes so a renamed file can't pass as an image.
 * Returns the file extension to store it under, or undefined if unrecognised.
 */
export function sniffImageType(
	bytes: Uint8Array,
): "png" | "jpg" | "webp" | undefined {
	const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
	if (starts(0x89, 0x50, 0x4e, 0x47)) return "png";
	if (starts(0xff, 0xd8, 0xff)) return "jpg";
	const ascii = (from: number, to: number) =>
		String.fromCharCode(...bytes.slice(from, to));
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
	return undefined;
}

// --- Cards (validated in the browser only; card data never leaves it) ---

export type CardBrand = "visa" | "mastercard" | "amex" | "jcb" | "unknown";

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
	visa: "Visa",
	mastercard: "Mastercard",
	amex: "American Express",
	jcb: "JCB",
	unknown: "Card",
};

export function detectCardBrand(digits: string): CardBrand {
	if (/^4/.test(digits)) return "visa";
	if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "mastercard";
	if (/^3[47]/.test(digits)) return "amex";
	if (/^35/.test(digits)) return "jcb";
	return "unknown";
}

export const cardDigits = (value: string) => value.replace(/\D/g, "");

/** Groups digits the way they're printed: 4-6-5 for Amex, 4-4-4-4 otherwise. */
export function formatCardNumber(value: string) {
	const digits = cardDigits(value);
	const groups =
		detectCardBrand(digits) === "amex" ? [4, 6, 5] : [4, 4, 4, 4, 3];
	const parts: string[] = [];
	let index = 0;
	for (const size of groups) {
		if (index >= digits.length) break;
		parts.push(digits.slice(index, index + size));
		index += size;
	}
	return parts.join(" ");
}

export function formatExpiry(value: string) {
	const digits = cardDigits(value).slice(0, 4);
	return digits.length > 2
		? `${digits.slice(0, 2)}/${digits.slice(2)}`
		: digits;
}

function passesLuhn(digits: string) {
	let sum = 0;
	for (let i = 0; i < digits.length; i++) {
		let digit = Number(digits[digits.length - 1 - i]);
		if (i % 2 === 1) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
	}
	return sum % 10 === 0;
}

export interface CardInput {
	number: string;
	name: string;
	expiry: string;
	cvc: string;
}

export type CardErrors = Partial<Record<keyof CardInput, string>>;

export function validateCard(card: CardInput, now: Date): CardErrors {
	const errors: CardErrors = {};
	const digits = cardDigits(card.number);
	const brand = detectCardBrand(digits);
	const expectedLength = brand === "amex" ? [15] : [16, 19];

	if (!digits) errors.number = "Enter your card number.";
	else if (!expectedLength.includes(digits.length) || !passesLuhn(digits))
		errors.number = "That card number doesn’t look right.";

	if (!card.name.trim()) errors.name = "Enter the name printed on the card.";

	const match = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
	if (!match) errors.expiry = "Use MM/YY.";
	else {
		const month = Number(match[1]);
		const year = 2000 + Number(match[2]);
		const endOfMonth = new Date(year, month, 0, 23, 59, 59);
		if (month < 1 || month > 12) errors.expiry = "Use MM/YY.";
		else if (endOfMonth < now) errors.expiry = "This card has expired.";
	}

	const cvcLength = brand === "amex" ? 4 : 3;
	if (!new RegExp(`^\\d{${cvcLength}}$`).test(card.cvc))
		errors.cvc = `Enter the ${cvcLength}-digit security code.`;

	return errors;
}
