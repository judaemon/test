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
 * A name left on the "for those who wish" list, tidied: spaces collapsed,
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
