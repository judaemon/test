import { companyColor, isCadetClass, isClassOption } from "~/lib/cadets";
import { addDays, shopNow } from "~/lib/time";

export interface CheckoutDetails {
	/** The buyer's name, both parts required. */
	firstName: string;
	lastName: string;
	/** `firstName lastName`, derived; older orders only have this. */
	fullName: string;
	/** Cadet company, e.g. "Alfa"; empty for civilians. */
	company: string;
	/** "1CL"–"4CL", or "Civilian". */
	className: string;
	/** A cadet's serial number, digits only (shown as C-12345); empty otherwise. */
	serialNumber: string;
	/** Where the order's details are sent; older orders have none. */
	email: string;
	/**
	 * Order-wide note for the florist. Checkout now takes notes and cards per
	 * bouquet (`PricedLine.messages`); older orders and chat orders use these.
	 */
	notes: string;
	/** The order-wide dedication card has a message. */
	addDedication: boolean;
	/** The receiver named on the card ("To: …"); optional. */
	dedicationFor: string;
	dedicationMessage: string;
	/**
	 * When the shopper would like it delivered, `YYYY-MM-DD` (Manila); optional,
	 * empty when not chosen.
	 */
	deliveryDate?: string;
}

/** How far ahead a delivery date can be chosen. */
export const DELIVERY_DATE_MAX_DAYS = 365;

/** The days a delivery date can be: from today to a year ahead, Manila time. */
export function deliveryDateRange(now = new Date()) {
	const today = shopNow(now).date;
	return { min: today, max: addDays(today, DELIVERY_DATE_MAX_DAYS) };
}

/** "Monday, November 9, 2026". */
export function formatDeliveryDate(date: string) {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", {
		timeZone: "UTC",
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

export type CheckoutField = keyof CheckoutDetails;
export type PaymentField =
	| "paymentMethod"
	| "referenceNumber"
	| "cardNumber"
	| "cardName"
	| "cardExpiry"
	| "cardCvc";
export type FieldErrors = Partial<Record<CheckoutField | PaymentField, string>>;

export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const SERIAL_NUMBER_MAX = 12;
export const NOTES_MAX = 300;
/** About as much as fits on half an A5 card (148 × 105 mm) at a readable size. */
export const DEDICATION_MESSAGE_MAX = 600;

const TEXT_FIELDS = [
	"firstName",
	"lastName",
	"company",
	"className",
	"serialNumber",
	"email",
	"notes",
	"dedicationFor",
	"dedicationMessage",
] as const;

/** The digits of a serial number, as typed or pasted. */
export const serialDigits = (value: string) => value.replace(/\D/g, "");

/** "12345" → "C-12345". */
export const formatSerialNumber = (digits: string) => `C-${digits}`;

export function readCheckoutForm(form: FormData): CheckoutDetails {
	return parseCheckoutDetails(Object.fromEntries(form.entries()));
}

/** Normalizes untrusted input into trimmed strings for every field. */
export function parseCheckoutDetails(raw: unknown): CheckoutDetails {
	const source =
		typeof raw === "object" && raw !== null
			? (raw as Record<string, unknown>)
			: {};
	const text = (field: (typeof TEXT_FIELDS)[number]) => {
		const value = source[field];
		return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
	};
	// A card is printed only when there's a message for it.
	const dedicationMessage =
		typeof source.dedicationMessage === "string"
			? source.dedicationMessage.trim()
			: "";
	const firstName = text("firstName");
	const lastName = text("lastName");
	return {
		firstName,
		lastName,
		fullName: [firstName, lastName].filter(Boolean).join(" "),
		// Civilians have no company, whatever the form sent.
		company: isCadetClass(text("className")) ? text("company") : "",
		className: text("className"),
		// Civilians have no serial number. Only the digits are kept, so a pasted
		// "C-12345" is fine too.
		serialNumber: isCadetClass(text("className"))
			? serialDigits(text("serialNumber"))
			: "",
		email: text("email").toLowerCase(),
		// Keep the line breaks people type into notes and card messages.
		notes: typeof source.notes === "string" ? source.notes.trim() : "",
		addDedication: dedicationMessage !== "",
		dedicationFor: text("dedicationFor"),
		dedicationMessage,
		deliveryDate:
			typeof source.deliveryDate === "string" &&
			/^\d{4}-\d{2}-\d{2}$/.test(source.deliveryDate.trim())
				? source.deliveryDate.trim()
				: "",
	};
}

/** Field-level validation shared by the checkout form and the order handler. */
export function validateCheckoutDetails(details: CheckoutDetails): FieldErrors {
	const errors: FieldErrors = {};

	if (!details.firstName) errors.firstName = "Enter your first name.";
	else if (details.firstName.length > NAME_MAX)
		errors.firstName = `Keep it under ${NAME_MAX} characters.`;

	if (!details.lastName) errors.lastName = "Enter your last name.";
	else if (details.lastName.length > NAME_MAX)
		errors.lastName = `Keep it under ${NAME_MAX} characters.`;

	if (!isClassOption(details.className))
		errors.className = "Choose your class.";
	else if (isCadetClass(details.className) && !companyColor(details.company))
		errors.company = "Choose your company.";

	if (isCadetClass(details.className)) {
		if (!details.serialNumber)
			errors.serialNumber = "Enter your serial number.";
		else if (details.serialNumber.length > SERIAL_NUMBER_MAX)
			errors.serialNumber = `Keep it under ${SERIAL_NUMBER_MAX} digits.`;
	}

	if (!details.email) errors.email = "Enter your email.";
	else if (
		details.email.length > EMAIL_MAX ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)
	)
		errors.email = "That email doesn’t look right.";

	if (details.notes.length > NOTES_MAX)
		errors.notes = `Keep notes under ${NOTES_MAX} characters.`;

	if (details.deliveryDate) {
		const { min, max } = deliveryDateRange();
		const time = Date.parse(`${details.deliveryDate}T00:00:00Z`);
		const real =
			!Number.isNaN(time) &&
			new Date(time).toISOString().slice(0, 10) === details.deliveryDate;
		if (!real) errors.deliveryDate = "Choose a date from the calendar.";
		else if (details.deliveryDate < min)
			errors.deliveryDate = "Choose today or a later day.";
		else if (details.deliveryDate > max)
			errors.deliveryDate = "Choose a day within the next year.";
	}

	// The card is optional; "To" on its own would print an empty card.
	if (details.dedicationFor.length > NAME_MAX)
		errors.dedicationFor = `Keep the name under ${NAME_MAX} characters.`;
	if (details.dedicationFor && !details.dedicationMessage)
		errors.dedicationMessage = `Write a message for ${details.dedicationFor}, or clear “To” for no card.`;
	else if (details.dedicationMessage.length > DEDICATION_MESSAGE_MAX)
		errors.dedicationMessage = `That’s too long for the card — keep it under ${DEDICATION_MESSAGE_MAX} characters.`;

	return errors;
}

export function hasErrors(errors: FieldErrors) {
	return Object.keys(errors).length > 0;
}

/** Shop-local calendar date an order was placed, `YYYY-MM-DD`. */
export function orderDay(createdAt: string) {
	return shopNow(new Date(createdAt)).date;
}
