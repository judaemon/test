import { createServerFn } from "@tanstack/solid-start";

import {
	SALE_KINDS,
	SALE_NAME_MAX,
	SALE_PERCENT_MAX,
	SALE_SCOPES,
	type Sale,
} from "~/lib/sale";
import { requireOwner } from "../admin-auth";
import { listArrangementTypes } from "../arrangement-types-repo";
import { listAdminProducts } from "../catalog-repo";
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
	const scope = oneOf(source.scope, SALE_SCOPES, "Applies to");
	const sale: SaleInput = {
		name: text(source, "name", { label: "Name", max: SALE_NAME_MAX }),
		kind,
		value,
		startsOn,
		endsOn,
		enabled: source.enabled !== false,
		scope,
		arrangementTypes: scope === "selected" ? ids(source.arrangementTypes) : [],
		products: scope === "selected" ? ids(source.products) : [],
		includeCustom: scope === "selected" && source.includeCustom === true,
	};
	if (
		scope === "selected" &&
		!sale.arrangementTypes.length &&
		!sale.products.length &&
		!sale.includeCustom
	)
		throw new InputError("Choose what the sale is on.");
	return sale;
}

/** The sales, and what a sale can be put on. */
export const getSalesAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireOwner();
		return {
			sales: listSales(),
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
