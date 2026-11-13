import { companyColor, isCadetClass, isClassOption } from "~/lib/cadets";
import { SERIAL_NUMBER_MAX, serialDigits } from "~/lib/checkout";

/**
 * Whether the online shop takes orders. The shop is for an event, so staff
 * close it when orders are full: shopping pages then show `heading` and
 * `message`, and a short form where people can leave their name.
 */
export interface ShopStatus {
	closed: boolean;
	heading: string;
	message: string;
}

export const SHOP_HEADING_MAX = 80;
export const SHOP_MESSAGE_MAX = 800;
export const WISH_NAME_MAX = 60;

export const DEFAULT_SHOP_STATUS: ShopStatus = {
	closed: false,
	heading: "We’re fully booked. Thank you!",
	message:
		"Your love for ORAIA filled our orders faster than we ever imagined, so we’ve closed online ordering to give every bouquet the care it deserves.\n\nTo everyone who ordered: thank you, we can’t wait for you to see them.\n\nMissed out? Don’t worry. We’re bringing extra bouquets to the event. Come find us on November 14 and 15!",
};

/**
 * Paths of the shopping pages, which show the closed notice instead while
 * the shop is closed. Order tracking, payment, accounts and the card pages
 * stay open, so people can still follow and pay for what they ordered.
 */
export function isShoppingPath(pathname: string) {
	const path = pathname.replace(/\/+$/, "") || "/";
	if (path === "/") return true;
	return ["/shop", "/products", "/custom", "/checkout", "/promos"].some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
}

/**
 * A name left on the extra bouquets list, tidied: spaces collapsed,
 * no control characters. Undefined when it isn't a usable name.
 */
export function cleanWishName(raw: unknown) {
	if (typeof raw !== "string") return undefined;
	const name = raw
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (name.length < 2 || name.length > WISH_NAME_MAX) return undefined;
	// At least one letter: not just digits or symbols.
	if (!/\p{L}/u.test(name)) return undefined;
	return name;
}

/** The event days someone can say they'd come for a bouquet. */
export const WISH_DATES = ["2026-11-14", "2026-11-15"] as const;

/** What someone leaves on the extra bouquets list. */
export interface WishDetails {
	name: string;
	/** "1CL"–"4CL", or "Civilian". */
	className: string;
	/** Cadet company, e.g. "Alfa"; empty for civilians. */
	company: string;
	/** A cadet's serial number, digits only; empty for civilians. */
	serialNumber: string;
	/** One of `WISH_DATES`. */
	date: string;
}

export type WishField = keyof WishDetails;

/**
 * Tidies what the form sent and checks it the way checkout checks a buyer:
 * cadets need a company and a serial number, civilians neither.
 */
export function checkWish(
	raw: unknown,
):
	| { ok: true; wish: WishDetails }
	| { ok: false; errors: Partial<Record<WishField, string>> } {
	const source =
		typeof raw === "object" && raw !== null
			? (raw as Record<string, unknown>)
			: {};
	const str = (key: string) =>
		typeof source[key] === "string" ? (source[key] as string).trim() : "";
	const errors: Partial<Record<WishField, string>> = {};

	const name = cleanWishName(source.name);
	if (!name)
		errors.name = `Please enter your name (up to ${WISH_NAME_MAX} characters).`;

	const className = str("className");
	const cadet = isCadetClass(className);
	if (!isClassOption(className)) errors.className = "Choose your class.";

	const company = cadet ? str("company") : "";
	if (cadet && !companyColor(company)) errors.company = "Choose your company.";

	const serialNumber = cadet ? serialDigits(str("serialNumber")) : "";
	if (cadet) {
		if (!serialNumber) errors.serialNumber = "Enter your serial number.";
		else if (serialNumber.length > SERIAL_NUMBER_MAX)
			errors.serialNumber = `Keep it under ${SERIAL_NUMBER_MAX} digits.`;
	}

	const date = str("date");
	if (!(WISH_DATES as readonly string[]).includes(date))
		errors.date = "Choose the day you’ll be there.";

	if (Object.keys(errors).length || !name) return { ok: false, errors };
	return { ok: true, wish: { name, className, company, serialNumber, date } };
}
