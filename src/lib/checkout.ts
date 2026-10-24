export interface CheckoutDetails {
	email: string;
	phone: string;
	recipientName: string;
	address: string;
	city: string;
	postalCode: string;
	/** Local calendar date, `YYYY-MM-DD`. */
	deliveryDate: string;
	giftMessage: string;
}

export type CheckoutField = keyof CheckoutDetails;
export type PaymentField =
	| "paymentMethod"
	| "referenceNumber"
	| "paymentProof"
	| "cardNumber"
	| "cardName"
	| "cardExpiry"
	| "cardCvc";
export type FieldErrors = Partial<Record<CheckoutField | PaymentField, string>>;

export const GIFT_MESSAGE_MAX = 200;
export const DELIVERY_WINDOW_DAYS = 7;
/** Orders after this local hour roll to next-day delivery. */
export const SAME_DAY_CUTOFF_HOUR = 14;

const FIELDS: CheckoutField[] = [
	"email",
	"phone",
	"recipientName",
	"address",
	"city",
	"postalCode",
	"deliveryDate",
	"giftMessage",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readCheckoutForm(form: FormData): CheckoutDetails {
	return parseCheckoutDetails(Object.fromEntries(form.entries()));
}

/** Normalizes untrusted input into trimmed strings for every field. */
export function parseCheckoutDetails(raw: unknown): CheckoutDetails {
	const source =
		typeof raw === "object" && raw !== null
			? (raw as Record<string, unknown>)
			: {};
	const details = {} as CheckoutDetails;
	for (const field of FIELDS) {
		const value = source[field];
		details[field] = typeof value === "string" ? value.trim() : "";
	}
	return details;
}

/**
 * Field-level validation shared by the checkout form and the order handler.
 * `today` is the shopper's local date (`YYYY-MM-DD`) so date rules don't drift
 * across time zones; the server passes its own date with a day of slack.
 */
export function validateCheckoutDetails(
	details: CheckoutDetails,
	today: string,
	{ allowYesterday = false } = {},
): FieldErrors {
	const errors: FieldErrors = {};

	if (!details.email) errors.email = "Enter your email for order updates.";
	else if (!EMAIL_PATTERN.test(details.email) || details.email.length > 254)
		errors.email = "That email doesn’t look quite right.";

	const phoneDigits = details.phone.replace(/\D/g, "");
	if (!details.phone)
		errors.phone = "Enter a mobile number so the courier can reach you.";
	else if (
		!/^\+?[\d\s().-]+$/.test(details.phone) ||
		phoneDigits.length < 10 ||
		phoneDigits.length > 15
	)
		errors.phone = "Use a mobile number like 0917 123 4567.";

	if (!details.recipientName) errors.recipientName = "Who are the flowers for?";
	else if (details.recipientName.length > 80)
		errors.recipientName = "Keep the name under 80 characters.";

	if (!details.address) errors.address = "Enter a street address.";
	else if (details.address.length > 160)
		errors.address = "Keep the address under 160 characters.";

	if (!details.city) errors.city = "Enter a city.";
	if (!details.postalCode) errors.postalCode = "Enter a postal code.";
	else if (!/^[A-Za-z0-9 -]{3,10}$/.test(details.postalCode))
		errors.postalCode = "That postal code doesn’t look right.";

	const earliest = allowYesterday ? addDays(today, -1) : today;
	if (!DATE_PATTERN.test(details.deliveryDate))
		errors.deliveryDate = "Pick a delivery day.";
	else if (
		details.deliveryDate < earliest ||
		details.deliveryDate > addDays(today, DELIVERY_WINDOW_DAYS)
	)
		errors.deliveryDate = "Pick a delivery day from the list.";

	if (details.giftMessage.length > GIFT_MESSAGE_MAX)
		errors.giftMessage = `Keep the card under ${GIFT_MESSAGE_MAX} characters.`;

	return errors;
}

export function hasErrors(errors: FieldErrors) {
	return Object.keys(errors).length > 0;
}

/** `YYYY-MM-DD` for a Date's local calendar day. */
export function toISODate(date: Date) {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(isoDate: string, days: number) {
	const time = Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS;
	return new Date(time).toISOString().slice(0, 10);
}

/** Selectable delivery days, starting tomorrow once the same-day cutoff passes. */
export function getDeliveryDays(now: Date) {
	const today = toISODate(now);
	const start = now.getHours() >= SAME_DAY_CUTOFF_HOUR ? 1 : 0;
	return Array.from({ length: DELIVERY_WINDOW_DAYS }, (_, i) => {
		const offset = start + i;
		return { date: addDays(today, offset), offset };
	});
}

export function formatDeliveryDate(
	isoDate: string,
	options: Intl.DateTimeFormatOptions = {
		weekday: "long",
		month: "long",
		day: "numeric",
	},
) {
	return new Intl.DateTimeFormat("en-US", {
		...options,
		timeZone: "UTC",
	}).format(new Date(`${isoDate}T00:00:00Z`));
}
