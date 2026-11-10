import { joinList, parseList } from "~/lib/shop-filters";

/**
 * The admin orders table's filters, kept in the address so a view can be
 * shared or bookmarked. Each list filter is comma-separated keys, like the
 * shop's ("gcash,maya").
 */
export interface OrdersSearch {
	/** One stage tab: new, making, done or cancelled. */
	stage?: string;
	payment?: string;
	method?: string;
	company?: string;
	class?: string;
	/** Arrangement type ids, or "custom" for custom bouquets. */
	arrangement?: string;
	/** Bouquet codes, e.g. "SB-01,Custom". */
	style?: string;
	flower?: string;
	wrapper?: string;
	wrapperStatus?: string;
	/** Florist ids, or "none" for bouquets not given to a florist yet. */
	florist?: string;
	/** "yes" or "no". */
	card?: string;
	/** "real" or "test"; missing means real orders only, "all" means both. */
	type?: string;
	/** Shop-local dates, YYYY-MM-DD, both ends included. */
	from?: string;
	to?: string;
	q?: string;
	/** Latest order on top unless "oldest". */
	sort?: "oldest";
	page?: number;
	perPage?: number;
}

/** The ticked-choice filters, in the order the toolbar shows them. */
export const FACETS = [
	{ id: "payment", label: "Payment" },
	{ id: "method", label: "Method" },
	{ id: "company", label: "Company" },
	{ id: "class", label: "Class" },
	{ id: "arrangement", label: "Arrangement" },
	{ id: "style", label: "Bouquet" },
	{ id: "flower", label: "Flower" },
	{ id: "wrapper", label: "Wrapper" },
	{ id: "wrapperStatus", label: "Wrapper status" },
	{ id: "florist", label: "Florist" },
	{ id: "card", label: "Dedication card" },
	{ id: "type", label: "Real / test" },
] as const;
export type FacetId = (typeof FACETS)[number]["id"] | "stage";

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** Stands in for an empty company, class or wrapper. */
export const NONE = "none";

/** The arrangement filter's key for custom bouquets, built or from a chat. */
export const CUSTOM_ARRANGEMENT = "custom";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateOrdersSearch(
	search: Record<string, unknown>,
): OrdersSearch {
	const list = (key: string) =>
		typeof search[key] === "string" && search[key]
			? (search[key] as string).slice(0, 400)
			: undefined;
	const date = (key: string) =>
		typeof search[key] === "string" && DATE.test(search[key] as string)
			? (search[key] as string)
			: undefined;
	// The router reads an all-digit value as a number.
	const q = typeof search.q === "number" ? String(search.q) : search.q;
	const page = Number(search.page);
	const perPage = Number(search.perPage);
	return {
		stage: list("stage"),
		payment: list("payment"),
		method: list("method"),
		company: list("company"),
		class: list("class"),
		arrangement: list("arrangement"),
		style: list("style"),
		flower: list("flower"),
		wrapper: list("wrapper"),
		wrapperStatus: list("wrapperStatus"),
		florist: list("florist"),
		card: list("card"),
		type: list("type"),
		from: date("from"),
		to: date("to"),
		q: typeof q === "string" && q.trim() ? q.trim().slice(0, 80) : undefined,
		sort: search.sort === "oldest" ? "oldest" : undefined,
		page: Number.isInteger(page) && page > 1 ? page : undefined,
		perPage: (PAGE_SIZES as readonly number[]).includes(perPage)
			? perPage
			: undefined,
	};
}

/** The ticked real/test choices: real orders only, until staff say otherwise. */
export function typeKeys(type?: string) {
	if (!type) return ["real"];
	return type === "all" ? [] : parseList(type);
}

/** The other way round: the default stays out of the address. */
export function typeParam(keys: string[]) {
	if (keys.length === 1 && keys[0] === "real") return undefined;
	return joinList(keys) ?? "all";
}

/** Whether any filter is changed from its default; the stage tab doesn't count. */
export function isFiltering(search: OrdersSearch) {
	return (
		FACETS.some((facet) => search[facet.id]) ||
		!!(search.from || search.to || search.q)
	);
}
