import { createServerFn } from "@tanstack/solid-start";
import {
	ORDER_PROMO_NAME_MAX,
	ORDER_PROMO_TERMS_MAX,
	type OrderPromo,
} from "~/lib/order-promo";
import {
	type ItemScope,
	SALE_KINDS,
	SALE_NAME_MAX,
	SALE_PERCENT_MAX,
	SALE_PRICINGS,
	SALE_SCOPES,
	type Sale,
} from "~/lib/sale";
import { requireOwner } from "../admin-auth";
import { listArrangementTypes } from "../arrangement-types-repo";
import { listAdminProducts } from "../catalog-repo";
import {
	deleteOrderPromo,
	listOrderPromos,
	type OrderPromoInput,
	saveOrderPromo,
} from "../order-promos-repo";
import { deleteSale, listSales, type SaleInput, saveSale } from "../sales-repo";
import { asRecord, InputError, oneOf, text } from "../validate";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (value: string) =>
	DAY.test(value) &&
	new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const ids = (value: unknown) =>
	Array.isArray(value)
		? [
				...new Set(
					value.filter(
						(id): id is string =>
							typeof id === "string" && id.length > 0 && id.length <= 64,
					),
				),
			].slice(0, 500)
		: [];

/** Checks a sale from the form; throws InputError with what to fix. */
export function parseSaleInput(input: unknown): SaleInput {
	const source = asRecord(input);
	const kind = oneOf(source.kind, SALE_KINDS, "Discount type");
	const value = Number(source.value);
	if (!Number.isInteger(value) || value < 1)
		throw new InputError(
			kind === "percent"
				? "Enter a whole percent, like 5."
				: "Enter a whole peso amount, like 100.",
		);
	if (kind === "percent" && value > SALE_PERCENT_MAX)
		throw new InputError(`A sale can take up to ${SALE_PERCENT_MAX}% off.`);
	if (kind === "amount" && value > 100_000)
		throw new InputError("That amount is too large.");
	const startsOn = text(source, "startsOn", { label: "Start date", max: 10 });
	const endsOn = text(source, "endsOn", { label: "End date", max: 10 });
	if (!isDay(startsOn) || !isDay(endsOn))
		throw new InputError("Choose the start and end dates.");
	if (endsOn < startsOn)
		throw new InputError("The end date can’t be before the start date.");
	return {
		name: text(source, "name", { label: "Name", max: SALE_NAME_MAX }),
		kind,
		value,
		pricing: oneOf(source.pricing ?? "discount", SALE_PRICINGS, "Pricing"),
		startsOn,
		endsOn,
		enabled: source.enabled !== false,
		...parseScope(source, "sale"),
	};
}

/** Everything, or the chosen types, arrangements and custom bouquets. */
function parseScope(
	source: Record<string, unknown>,
	what: "sale" | "promo",
): ItemScope {
	const scope = oneOf(source.scope ?? "all", SALE_SCOPES, "Applies to");
	const chosen: ItemScope = {
		scope,
		arrangementTypes: scope === "selected" ? ids(source.arrangementTypes) : [],
		products: scope === "selected" ? ids(source.products) : [],
		includeCustom: scope === "selected" && source.includeCustom === true,
	};
	if (
		scope === "selected" &&
		!chosen.arrangementTypes.length &&
		!chosen.products.length &&
		!chosen.includeCustom
	)
		throw new InputError(`Choose what the ${what} is on.`);
	return chosen;
}

/** The sales, and what a sale can be put on. */
export const getSalesAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireOwner();
		return {
			sales: listSales(),
			orderPromos: listOrderPromos(),
			arrangementTypes: listArrangementTypes().map(({ id, pluralName }) => ({
				id,
				name: pluralName,
			})),
			products: listAdminProducts().map((product) => ({
				id: product.id,
				name: product.title,
				arrangement: product.arrangement,
				hidden: !product.isVisible,
			})),
		};
	},
);

export type SaleResult =
	| { ok: true; sale: Sale }
	| { ok: false; message: string };

export const saveSaleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const id =
			typeof source.id === "string" && source.id ? source.id.slice(0, 64) : "";
		try {
			return { id, sale: parseSaleInput(source.sale), error: "" };
		} catch (error) {
			if (error instanceof InputError)
				return { id, sale: null, error: error.message };
			throw error;
		}
	})
	.handler(async ({ data }): Promise<SaleResult> => {
		await requireOwner();
		if (!data.sale) return { ok: false, message: data.error };
		return { ok: true, sale: saveSale(data.sale, data.id || undefined) };
	});

export const deleteSaleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => text(asRecord(input), "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireOwner();
		deleteSale(data);
		return { ok: true as const };
	});

/** Checks an order promo from the form; throws InputError with what to fix. */
export function parseOrderPromoInput(input: unknown): OrderPromoInput {
	const source = asRecord(input);
	const every = Number(source.every);
	if (!Number.isInteger(every) || every < 2 || every > 100)
		throw new InputError(
			"Choose which order gets it: from the 2nd to the 100th.",
		);
	const amount = Number(source.amount);
	if (!Number.isInteger(amount) || amount < 1)
		throw new InputError("Enter a whole peso amount, like 500.");
	if (amount > 100_000) throw new InputError("That amount is too large.");
	const minSpend =
		source.minSpend === "" || source.minSpend === undefined
			? 0
			: Number(source.minSpend);
	if (!Number.isInteger(minSpend) || minSpend < 0)
		throw new InputError(
			"Enter the minimum order in whole pesos, or 0 for none.",
		);
	if (minSpend > 1_000_000)
		throw new InputError("That minimum order is too large.");
	const startsOn = text(source, "startsOn", { label: "Start date", max: 10 });
	const endsOn = text(source, "endsOn", {
		label: "End date",
		max: 10,
		required: false,
	});
	if (!isDay(startsOn)) throw new InputError("Choose the start date.");
	if (endsOn && !isDay(endsOn)) throw new InputError("Check the end date.");
	if (endsOn && endsOn < startsOn)
		throw new InputError("The end date can’t be before the start date.");
	const terms = typeof source.terms === "string" ? source.terms : "";
	return {
		name: text(source, "name", { label: "Name", max: ORDER_PROMO_NAME_MAX }),
		every,
		amount,
		minSpend,
		...parseScope(source, "promo"),
		repeat: source.repeat !== false,
		startsOn,
		endsOn,
		enabled: source.enabled !== false,
		terms: text({ terms: terms.replace(/\r\n?/g, "\n") }, "terms", {
			label: "Terms",
			max: ORDER_PROMO_TERMS_MAX,
			required: false,
		}),
	};
}

export type OrderPromoResult =
	| { ok: true; promo: OrderPromo }
	| { ok: false; message: string };

export const saveOrderPromoFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const id =
			typeof source.id === "string" && source.id ? source.id.slice(0, 64) : "";
		try {
			return { id, promo: parseOrderPromoInput(source.promo), error: "" };
		} catch (error) {
			if (error instanceof InputError)
				return { id, promo: null, error: error.message };
			throw error;
		}
	})
	.handler(async ({ data }): Promise<OrderPromoResult> => {
		await requireOwner();
		if (!data.promo) return { ok: false, message: data.error };
		return {
			ok: true,
			promo: saveOrderPromo(data.promo, data.id || undefined),
		};
	});

export const deleteOrderPromoFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => text(asRecord(input), "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireOwner();
		deleteOrderPromo(data);
		return { ok: true as const };
	});
