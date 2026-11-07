import {
	type PublicSale,
	type Sale,
	type SaleKind,
	type SaleScope,
	saleStatus,
	shopToday,
} from "~/lib/sale";
import { getDb, nowIso } from "./db";

interface SaleRow {
	id: string;
	name: string;
	kind: SaleKind;
	value: number;
	starts_on: string;
	ends_on: string;
	enabled: number;
	scope: SaleScope;
	arrangement_types: string;
	products: string;
	include_custom: number;
}

const toSale = (row: SaleRow): Sale => ({
	id: row.id,
	name: row.name,
	kind: row.kind,
	value: row.value,
	startsOn: row.starts_on,
	endsOn: row.ends_on,
	enabled: row.enabled === 1,
	scope: row.scope,
	arrangementTypes: JSON.parse(row.arrangement_types) as string[],
	products: JSON.parse(row.products) as string[],
	includeCustom: row.include_custom === 1,
});

/** Every sale, newest first by start day. */
export function listSales(): Sale[] {
	return (
		getDb()
			.query("SELECT * FROM sales ORDER BY starts_on DESC, name")
			.all() as SaleRow[]
	).map(toSale);
}

/** The sales live today (Manila time), as the shop and checkout see them. */
export function listLiveSales(today = shopToday()): PublicSale[] {
	return listSales()
		.filter((sale) => saleStatus(sale, today) === "live")
		.map(({ enabled: _enabled, ...sale }) => sale);
}

export type SaleInput = Omit<Sale, "id">;

/** Adds a sale, or replaces one with the same id. */
export function saveSale(input: SaleInput, id?: string): Sale {
	const db = getDb();
	const saleId = id ?? crypto.randomUUID();
	const values = {
		id: saleId,
		name: input.name,
		kind: input.kind,
		value: input.value,
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		enabled: input.enabled ? 1 : 0,
		scope: input.scope,
		arrangementTypes: JSON.stringify(input.arrangementTypes),
		products: JSON.stringify(input.products),
		includeCustom: input.includeCustom ? 1 : 0,
		now: nowIso(),
	};
	if (id) {
		const result = db
			.query(
				`UPDATE sales SET name = $name, kind = $kind, value = $value, starts_on = $startsOn,
				   ends_on = $endsOn, enabled = $enabled, scope = $scope,
				   arrangement_types = $arrangementTypes, products = $products,
				   include_custom = $includeCustom, updated_at = $now
				 WHERE id = $id`,
			)
			.run(values);
		if (result.changes === 0) throw new Error("That sale was deleted.");
	} else {
		db.query(
			`INSERT INTO sales (id, name, kind, value, starts_on, ends_on, enabled, scope,
			   arrangement_types, products, include_custom, created_at, updated_at)
			 VALUES ($id, $name, $kind, $value, $startsOn, $endsOn, $enabled, $scope,
			   $arrangementTypes, $products, $includeCustom, $now, $now)`,
		).run(values);
	}
	return listSales().find((sale) => sale.id === saleId) as Sale;
}

export function deleteSale(id: string) {
	getDb().query("DELETE FROM sales WHERE id = $id").run({ id });
}
