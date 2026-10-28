import { addDays, formatClock, type ShopClock, toMinutes } from "~/lib/time";

export interface CheckoutDetails {
	email: string;
	phone: string;
	recipientName: string;
	address: string;
	city: string;
	postalCode: string;
	/** Shop-local calendar date, `YYYY-MM-DD`. */
	deliveryDate: string;
	deliverySlot: string;
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
/** A slot closes this long before it starts, leaving time to arrange the bouquet. */
export const SLOT_PREP_MINUTES = 60;

export interface DeliverySlot {
	id: string;
	/** Shop-local `HH:MM`; also the time the courier must leave by. */
	start: string;
	end: string;
}

export const DELIVERY_SLOTS: DeliverySlot[] = [
	{ id: "morning", start: "09:00", end: "12:00" },
	{ id: "afternoon", start: "12:00", end: "15:00" },
	{ id: "evening", start: "15:00", end: "18:00" },
];

export function getSlot(id: string) {
	return DELIVERY_SLOTS.find((slot) => slot.id === id);
}

/** Sort key for "soonest first": date, then the slot's place in the day. */
export function deliverySortKey(details: {
	deliveryDate: string;
	deliverySlot: string;
}) {
	const index = DELIVERY_SLOTS.findIndex(
		(slot) => slot.id === details.deliverySlot,
	);
	return `${details.deliveryDate}#${index}`;
}

export function formatSlot(slot: DeliverySlot) {
	return `${formatClock(slot.start)} – ${formatClock(slot.end)}`;
}

/** Whether a slot on `date` can still be booked at shop time `now`. */
export function isSlotOpen(slot: DeliverySlot, date: string, now: ShopClock) {
	if (date < now.date) return false;
	if (date > now.date) return true;
	return now.minutes <= toMinutes(slot.start) - SLOT_PREP_MINUTES;
}

/** Bookable days: today while any slot is open, then the following days. */
export function getDeliveryDays(now: ShopClock) {
	const todayOpen = DELIVERY_SLOTS.some((slot) =>
		isSlotOpen(slot, now.date, now),
	);
	const start = todayOpen ? 0 : 1;
	return Array.from({ length: DELIVERY_WINDOW_DAYS }, (_, i) => {
		const offset = start + i;
		return { date: addDays(now.date, offset), offset };
	});
}

const FIELDS: CheckoutField[] = [
	"email",
	"phone",
	"recipientName",
	"address",
	"city",
	"postalCode",
	"deliveryDate",
	"deliverySlot",
	"giftMessage",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
 * Both sides pass the shop clock, so "today" and slot cut-offs always agree.
 */
export function validateCheckoutDetails(
	details: CheckoutDetails,
	now: ShopClock,
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

	if (!DATE_PATTERN.test(details.deliveryDate))
		errors.deliveryDate = "Pick a delivery day.";
	else if (
		details.deliveryDate < now.date ||
		details.deliveryDate > addDays(now.date, DELIVERY_WINDOW_DAYS)
	)
		errors.deliveryDate = "Pick a delivery day from the list.";

	const slot = getSlot(details.deliverySlot);
	if (!slot) errors.deliverySlot = "Pick a delivery time.";
	else if (!errors.deliveryDate && !isSlotOpen(slot, details.deliveryDate, now))
		errors.deliverySlot = "That time has closed — pick a later one.";

	if (details.giftMessage.length > GIFT_MESSAGE_MAX)
		errors.giftMessage = `Keep the card under ${GIFT_MESSAGE_MAX} characters.`;

	return errors;
}

export function hasErrors(errors: FieldErrors) {
	return Object.keys(errors).length > 0;
}
