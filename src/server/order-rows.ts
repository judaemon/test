import { hasCard } from "~/lib/bouquet-messages";
import { CLASS_OPTIONS, COMPANIES } from "~/lib/cadets";
import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import { type FloristOption, floristOf } from "~/lib/florists";
import {
	CUSTOM_ARRANGEMENT,
	DEFAULT_PAGE_SIZE,
	FACETS,
	type FacetId,
	NONE,
	type OrdersSearch,
	typeKeys,
} from "~/lib/order-filters";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "~/lib/payment";
import { type PricedLine, tracksWrapper } from "~/lib/pricing";
import { wrapperNames } from "~/lib/product";
import { parseList } from "~/lib/shop-filters";
import {
	type Order,
	PAYMENT_STATUSES,
	STAGE_LABELS,
	WRAPPER_STATUS_LABELS,
	WRAPPER_STATUSES,
} from "~/types/order";
import { listArrangementTypes } from "./arrangement-types-repo";
import { listAdminProducts } from "./catalog-repo";
import { listFloristOptions } from "./florists-repo";
import { countOrderNotes } from "./order-notes-repo";
import { listOrders } from "./orders-repo";

/** One bouquet of an order: the table shows a row per bouquet. */
/**
 * One bouquet of an order: a line ordered twice is two rows, so neither is
 * missed. `index` is the line, `unit` which of its bouquets, from 0.
 */
export interface OrderRow {
	order: Order;
	line: PricedLine;
	index: number;
	unit: number;
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
	summary: ArrangementSummary[];
	/** Staff notes per order on this page; orders without any are left out. */
	noteCounts: Record<string, number>;
	/** Every florist, for the rows' florist pickers. */
	florists: FloristOption[];
}

/** One card above the orders table: an arrangement type and its bouquets. */
export interface ArrangementSummary {
	/** The arrangement filter's key. */
	key: string;
	label: string;
	/** Bouquets, counting each of several in one row. */
	bouquets: number;
	stages: Record<Order["stage"], number>;
	/** Bouquets that need a wrapper (not cancelled), and how many are made. */
	wrappers: { needed: number; made: number };
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
	arrangement: {
		keys: ({ line }) => [arrangementOf(line)],
		fixed: [],
		label: (key) =>
			key === CUSTOM_ARRANGEMENT
				? "Custom bouquet"
				: (typeNames.get(key) ?? "Unknown type"),
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
		// A bouquet with several wrappers is listed under each of them.
		keys: ({ line }) => {
			const names = wrapperNames(line.wrapperColor);
			return names.length ? names : [NONE];
		},
		label: (key) => (key === NONE ? "No wrapper" : key),
	},
	wrapperStatus: {
		// Ready-made bouquets without a wrapper have no wrapper status to filter by.
		keys: ({ line }) =>
			tracksWrapper(line) ? [line.wrapperStatus ?? "todo"] : [],
		fixed: WRAPPER_STATUSES,
		label: (key) =>
			WRAPPER_STATUS_LABELS[key as keyof typeof WRAPPER_STATUS_LABELS],
	},
	florist: {
		keys: ({ line, unit }) => [floristOf(line, unit) || NONE],
		fixed: [],
		label: (key) =>
			key === NONE
				? "Not assigned"
				: (floristLabels.get(key) ?? "Removed florist"),
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

/** Each arrangement's type now, and the types' names, for the filter. */
let productTypes = new Map<string, string>();
let typeNames = new Map<string, string>();
let typePlurals = new Map<string, string>();
let floristLabels = new Map<string, string>();
let florists: FloristOption[] = [];
const refreshArrangements = () => {
	florists = listFloristOptions();
	floristLabels = new Map(
		florists.map((florist) => [florist.id, florist.name]),
	);
	// Not assigned first, then every florist A–Z, even with no bouquets yet.
	FIELDS.florist.fixed = [NONE, ...florists.map((florist) => florist.id)];
	const types = listArrangementTypes();
	typeNames = new Map(types.map((type) => [type.id, type.name]));
	typePlurals = new Map(types.map((type) => [type.id, type.pluralName]));
	FIELDS.arrangement.fixed = [
		...types.map((type) => type.id),
		CUSTOM_ARRANGEMENT,
	];
	productTypes = new Map(
		listAdminProducts().map((product) => [product.id, product.arrangement]),
	);
};

/** "Corsages", or "Custom bouquets", for the cards above the table. */
const summaryLabel = (key: string) =>
	key === CUSTOM_ARRANGEMENT
		? "Custom bouquets"
		: (typePlurals.get(key) ?? "Unknown type");

/**
 * A bouquet's type: as ordered, or (older orders) its arrangement's type now.
 * Custom bouquets, built or from a chat, are their own.
 */
function arrangementOf(line: PricedLine) {
	if (line.productId === CUSTOM_PRODUCT_ID) return CUSTOM_ARRANGEMENT;
	return line.arrangement ?? productTypes.get(line.productId) ?? NONE;
}

const FACET_IDS: FacetId[] = ["stage", ...FACETS.map((facet) => facet.id)];

/** Shop-local (Asia/Manila, UTC+8 with no DST) day an order was placed. */
const placedDay = (createdAt: string) =>
	new Date(Date.parse(createdAt) + 8 * 3_600_000).toISOString().slice(0, 10);

/**
 * The orders table, one row per bouquet: filtered, counted and cut into a
 * page here, so the page only ever holds what's on screen.
 */
export function queryOrderRows(search: OrdersSearch): OrderRowsPage {
	const { matching, options, summary } = filterOrderRows(search);
	const pageSize = search.perPage ?? DEFAULT_PAGE_SIZE;
	const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
	const page = Math.min(search.page ?? 1, pageCount);
	const pageRows = matching.slice((page - 1) * pageSize, page * pageSize);
	return {
		rows: pageRows,
		noteCounts: countOrderNotes([
			...new Set(pageRows.map((row) => row.order.id)),
		]),
		total: matching.length,
		page,
		pageSize,
		pageCount,
		options,
		summary,
		florists,
	};
}

/** Every bouquet the table's filters match, on all pages. */
export const matchingOrderRows = (search: OrdersSearch) =>
	filterOrderRows(search).matching;

function filterOrderRows(search: OrdersSearch) {
	refreshArrangements();
	const rows = listOrders({ search: search.q, limit: 1_000_000 })
		.filter((order) => {
			const day = placedDay(order.createdAt);
			return (
				(!search.from || day >= search.from) && (!search.to || day <= search.to)
			);
		})
		.flatMap((order) =>
			order.lines.flatMap((line, index) =>
				Array.from({ length: Math.max(line.quantity, 1) }, (_, unit) => ({
					order,
					line,
					index,
					unit,
				})),
			),
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
	const passes = (i: number, ...except: FacetId[]) =>
		FACET_IDS.every(
			(id) =>
				except.includes(id) ||
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
			(key) => key !== NONE || counts.has(key) || id === "florist",
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
			return (
				(search.sort === "oldest" ? order : -order) ||
				a.index - b.index ||
				a.unit - b.unit
			);
		});
	// The cards above the table: every arrangement type, how many bouquets
	// of it and how far they are, for the other filters but not type or stage.
	const summaryCounts = new Map<string, ArrangementSummary>();
	for (const key of FIELDS.arrangement.fixed ?? [])
		summaryCounts.set(key, {
			key,
			label: summaryLabel(key),
			bouquets: 0,
			stages: { new: 0, making: 0, done: 0, cancelled: 0 },
			wrappers: { needed: 0, made: 0 },
		});
	rows.forEach((row, i) => {
		if (!passes(i, "arrangement", "stage")) return;
		const key = arrangementOf(row.line);
		const entry = summaryCounts.get(key) ?? {
			key,
			label: summaryLabel(key),
			bouquets: 0,
			stages: { new: 0, making: 0, done: 0, cancelled: 0 },
			wrappers: { needed: 0, made: 0 },
		};
		// Each row is one bouquet.
		entry.bouquets += 1;
		entry.stages[row.order.stage] += 1;
		if (row.order.stage !== "cancelled" && tracksWrapper(row.line)) {
			entry.wrappers.needed += 1;
			if (row.line.wrapperStatus === "made") entry.wrappers.made += 1;
		}
		summaryCounts.set(key, entry);
	});
	const summary = [...summaryCounts.values()].filter(
		// Custom bouquets and unknown types only show once there are some.
		(entry) =>
			entry.bouquets > 0 ||
			(entry.key !== CUSTOM_ARRANGEMENT && entry.key !== NONE),
	);

	return { matching, options, summary };
}
