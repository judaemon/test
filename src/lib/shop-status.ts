import { CIVILIAN, companyColor } from "~/lib/cadets";
import { SERIAL_NUMBER_MAX, serialDigits } from "~/lib/checkout";

/**
 * How the online shop runs:
 * - `open`: taking orders (for an event).
 * - `closed`: the event's orders are full. Shopping pages show `heading` and
 *   `message`, and a short form where people can leave their name.
 * - `view`: between events. The home page and bouquet pages are for looking
 *   only; the bag, builder, checkout and promos are off.
 */
export const SHOP_MODES = ["open", "view", "closed"] as const;
export type ShopMode = (typeof SHOP_MODES)[number];

export interface ShopStatus {
	mode: ShopMode;
	heading: string;
	message: string;
	/** The current event's delivery days, offered on the fully booked form. */
	days?: string[];
}

/**
 * How the shop runs follows the events: with no current event it's view
 * only; with one it takes orders until it has its most orders, then it's
 * fully booked. Cancelled and test orders don't count.
 */
export function shopModeForEvent(
	event: { maxOrders: number | null } | null,
	orders: number,
): ShopMode {
	if (!event) return "view";
	if (event.maxOrders !== null && orders >= event.maxOrders) return "closed";
	return "open";
}

/** Whether new orders are taken. */
export const takesOrders = (status: Pick<ShopStatus, "mode">) =>
	status.mode === "open";

export const SHOP_HEADING_MAX = 80;
export const SHOP_MESSAGE_MAX = 800;
export const WISH_NAME_MAX = 60;

export const DEFAULT_SHOP_STATUS: ShopStatus = {
	mode: "open",
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
 * Paths of the ordering pages, which go back to the home page while the shop
 * is view only: there's nothing to put in a bag or pay for.
 */
export function isOrderingPath(pathname: string) {
	const path = pathname.replace(/\/+$/, "") || "/";
	return ["/custom", "/checkout", "/promos"].some(
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

/** The days to offer when there's no current event to take them from. */
export const WISH_DATES = ["2026-11-14", "2026-11-15"] as const;

/** What someone leaves on the extra bouquets list. */
export interface WishDetails {
	name: string;
	/** Cadet company, e.g. "Alfa", or "Civilian". */
	company: string;
	/** A cadet's serial number, digits only; empty for civilians. */
	serialNumber: string;
	/** One of the event's delivery days. */
	date: string;
}

export type WishField = keyof WishDetails;

/**
 * Tidies what the form sent and checks it: everyone picks a company (or
 * Civilian), and cadets also give their serial number.
 */
export function checkWish(
	raw: unknown,
	/** The days on offer: the current event's delivery days. */
	days: readonly string[] = WISH_DATES,
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

	const company = str("company");
	const cadet = !!companyColor(company);
	if (!cadet && company !== CIVILIAN) errors.company = "Choose your company.";

	const serialNumber = cadet ? serialDigits(str("serialNumber")) : "";
	if (cadet) {
		if (!serialNumber) errors.serialNumber = "Enter your serial number.";
		else if (serialNumber.length > SERIAL_NUMBER_MAX)
			errors.serialNumber = `Keep it under ${SERIAL_NUMBER_MAX} digits.`;
	}

	const date = str("date");
	if (!days.includes(date))
		errors.date = "Choose the day you’ll be there.";

	if (Object.keys(errors).length || !name) return { ok: false, errors };
	return { ok: true, wish: { name, company, serialNumber, date } };
}
