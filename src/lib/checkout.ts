import { companyColor, isCadetClass, isClassOption } from "~/lib/cadets";
import { shopNow } from "~/lib/time";

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
	/** Optional notes for the shop. */
	notes: string;
	/** When set, the bouquet carries a dedication card. */
	addDedication: boolean;
	/** The receiver named on the card ("To: …"). */
	dedicationFor: string;
	dedicationMessage: string;
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
export const NOTES_MAX = 300;
/** About as much as fits on half an A5 card (148 × 105 mm) at a readable size. */
export const DEDICATION_MESSAGE_MAX = 600;

const TEXT_FIELDS = [
	"firstName",
	"lastName",
	"company",
	"className",
	"notes",
	"dedicationFor",
	"dedicationMessage",
] as const;

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
	const flag = source.addDedication;
	const addDedication = flag === true || flag === "true" || flag === "on";
	const firstName = text("firstName");
	const lastName = text("lastName");
	return {
		firstName,
		lastName,
		fullName: [firstName, lastName].filter(Boolean).join(" "),
		// Civilians have no company, whatever the form sent.
		company: isCadetClass(text("className")) ? text("company") : "",
		className: text("className"),
		// Keep the line breaks people type into notes and card messages.
		notes: typeof source.notes === "string" ? source.notes.trim() : "",
		addDedication,
		// A switched-off dedication never reaches the order.
		dedicationFor: addDedication ? text("dedicationFor") : "",
		dedicationMessage:
			addDedication && typeof source.dedicationMessage === "string"
				? source.dedicationMessage.trim()
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

	if (details.notes.length > NOTES_MAX)
		errors.notes = `Keep notes under ${NOTES_MAX} characters.`;

	if (details.addDedication) {
		if (!details.dedicationFor)
			errors.dedicationFor = "Who is the card addressed to?";
		else if (details.dedicationFor.length > NAME_MAX)
			errors.dedicationFor = `Keep the name under ${NAME_MAX} characters.`;
		if (!details.dedicationMessage)
			errors.dedicationMessage = "Write the message for the card.";
		else if (details.dedicationMessage.length > DEDICATION_MESSAGE_MAX)
			errors.dedicationMessage = `That’s too long for the card — keep it under ${DEDICATION_MESSAGE_MAX} characters.`;
	}

	return errors;
}

export function hasErrors(errors: FieldErrors) {
	return Object.keys(errors).length > 0;
}

/** Who the bouquet is for: the dedication's receiver, else the buyer. */
export function orderFor(details: CheckoutDetails) {
	return details.dedicationFor || details.fullName;
}

/** Shop-local calendar date an order was placed, `YYYY-MM-DD`. */
export function orderDay(createdAt: string) {
	return shopNow(new Date(createdAt)).date;
}
