import { hasCard } from "~/lib/bouquet-messages";
import { CLASS_OPTIONS, COMPANIES } from "~/lib/cadets";
import {
	DEFAULT_PAGE_SIZE,
	FACETS,
	type FacetId,
	NONE,
	type OrdersSearch,
	typeKeys,
} from "~/lib/order-filters";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "~/lib/payment";
import type { PricedLine } from "~/lib/pricing";
import { parseList } from "~/lib/shop-filters";
import {
	type Order,
	PAYMENT_STATUSES,
	STAGE_LABELS,
	WRAPPER_STATUS_LABELS,
	WRAPPER_STATUSES,
} from "~/types/order";
import { listOrders } from "./orders-repo";

/** One bouquet of an order: the table shows a row per bouquet. */
export interface OrderRow {
	order: Order;
	line: PricedLine;
	index: number;
}

export interface FilterOption {
	key: string;
	label: string;
	/** Rows this choice would show, given the other filters. */
	count: number;
}

export interface OrderRowsPage {
	rows: OrderRow[];
	/** Rows matching every filter, across all pages. */
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
	options: Record<FacetId, FilterOption[]>;
}

/** What a row can be filtered by, with the choices known up front in order. */
const FIELDS: Record<
	FacetId,
	{
		keys: (row: OrderRow) => string[];
		fixed?: readonly string[];
		label?: (key: string, row?: OrderRow) => string;
	}
> = {
	stage: {
		keys: ({ order }) => [order.stage],
		fixed: ["new", "making", "done", "cancelled"],
		label: (key) => STAGE_LABELS[key as Order["stage"]],
	},
	// Labelled on the page, next to the payment pills' own wording.
	payment: {
		keys: ({ order }) => [order.payment.status],
		fixed: PAYMENT_STATUSES,
	},
	method: {
		keys: ({ order }) => [order.payment.method],
		fixed: PAYMENT_METHODS,
		label: (key) => PAYMENT_METHOD_LABELS[key as Order["payment"]["method"]],
	},
	company: {
		keys: ({ order }) => [order.details.company || NONE],
		fixed: [...COMPANIES.map((company) => company.name), NONE],
		label: (key) => (key === NONE ? "No company" : key),
	},
	class: {
		keys: ({ order }) => [order.details.className || NONE],
		fixed: [...CLASS_OPTIONS, NONE],
		label: (key) => (key === NONE ? "Not given" : key),
	},
	style: {
		keys: ({ line }) => [line.sku],
		label: (key, row) => {
			if (key === "Custom") return "Custom bouquet";
			const title = row?.line.title;
			return title && title !== key ? `${key} · ${title}` : key;
		},
	},
	flower: {
		keys: ({ line }) => [
			...new Set((line.recipe ?? []).map((item) => item.flower)),
		],
	},
	wrapper: {
		keys: ({ line }) => [line.wrapperColor || NONE],
		label: (key) => (key === NONE ? "No wrapper" : key),
	},
	wrapperStatus: {
		// Bouquets without a wrapper have no wrapper status to filter by.
		keys: ({ line }) =>
			line.wrapperColor ? [line.wrapperStatus ?? "todo"] : [],
		fixed: WRAPPER_STATUSES,
		label: (key) =>
			WRAPPER_STATUS_LABELS[key as keyof typeof WRAPPER_STATUS_LABELS],
	},
	card: {
		// This bouquet's own card, or an older order's card for the whole order.
		keys: ({ order, line }) => [
			order.details.addDedication || line.messages?.some(hasCard)
				? "yes"
				: "no",
		],
		fixed: ["yes", "no"],
		label: (key) => (key === "yes" ? "With card" : "No card"),
	},
	type: {
		keys: ({ order }) => [order.isTest ? "test" : "real"],
		fixed: ["real", "test"],
		label: (key) => (key === "test" ? "Test orders" : "Real orders"),
	},
};

const FACET_IDS: FacetId[] = ["stage", ...FACETS.map((facet) => facet.id)];

/** Shop-local (Asia/Manila, UTC+8 with no DST) day an order was placed. */
const placedDay = (createdAt: string) =>
	new Date(Date.parse(createdAt) + 8 * 3_600_000).toISOString().slice(0, 10);

/**
 * The orders table, one row per bouquet: filtered, counted and cut into a
 * page here, so the page only ever holds what's on screen.
 */
export function queryOrderRows(search: OrdersSearch): OrderRowsPage {
	const rows = listOrders({ search: search.q, limit: 1_000_000 })
		.filter((order) => {
			const day = placedDay(order.createdAt);
			return (
				(!search.from || day >= search.from) && (!search.to || day <= search.to)
			);
		})
		.flatMap((order) =>
			order.lines.map((line, index) => ({ order, line, index })),
		);

	const chosen = Object.fromEntries(
		FACET_IDS.map((id) => [
			id,
			new Set(id === "type" ? typeKeys(search.type) : parseList(search[id])),
		]),
	) as Record<FacetId, Set<string>>;
	const keys = rows.map(
		(row) =>
			Object.fromEntries(
				FACET_IDS.map((id) => [id, FIELDS[id].keys(row)]),
			) as Record<FacetId, string[]>,
	);
	// A row passes a filter if it has any of the ticked choices.
	const passes = (i: number, except?: FacetId) =>
		FACET_IDS.every(
			(id) =>
				id === except ||
				!chosen[id].size ||
				keys[i][id].some((key) => chosen[id].has(key)),
		);

	const options = {} as Record<FacetId, FilterOption[]>;
	for (const id of FACET_IDS) {
		const field = FIELDS[id];
		const counts = new Map<string, { count: number; row: OrderRow }>();
		rows.forEach((row, i) => {
			const hit = passes(i, id) ? 1 : 0;
			for (const key of keys[i][id]) {
				const seen = counts.get(key);
				counts.set(key, { count: (seen?.count ?? 0) + hit, row });
			}
		});
		const fixed = (field.fixed ?? []).filter(
			// "None" only shows once some row has it.
			(key) => key !== NONE || counts.has(key),
		);
		const rest = [...counts.keys()]
			.filter((key) => !fixed.includes(key))
			.sort(
				(a, b) =>
					(counts.get(b)?.count ?? 0) - (counts.get(a)?.count ?? 0) ||
					a.localeCompare(b),
			);
		options[id] = [...fixed, ...rest].map((key) => ({
			key,
			label: field.label?.(key, counts.get(key)?.row) ?? key,
			count: counts.get(key)?.count ?? 0,
		}));
	}

	const matching = rows
		.filter((_, i) => passes(i))
		.sort((a, b) => {
			const order =
				Number(a.order.number) - Number(b.order.number) ||
				a.order.createdAt.localeCompare(b.order.createdAt);
			// An order's bouquets stay in their own order either way.
			return (search.sort === "oldest" ? order : -order) || a.index - b.index;
		});
	const pageSize = search.perPage ?? DEFAULT_PAGE_SIZE;
	const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
	const page = Math.min(search.page ?? 1, pageCount);
	return {
		rows: matching.slice((page - 1) * pageSize, page * pageSize),
		total: matching.length,
		page,
		pageSize,
		pageCount,
		options,
	};
}
