import type { CustomWrapper } from "~/lib/custom-bouquet";
import { fromCents, getDb, nowIso, toCents } from "./db";

interface WrapperRow {
	id: string;
	code: string | null;
	name: string;
	color_hex: string;
	extra_colors: string;
	price_cents: number;
	stock_quantity: number | null;
	stock_actual: number | null;
	is_enabled: number;
	image: string;
}

/** What staff send when adding or editing a wrapper. */
export type WrapperInput = Omit<CustomWrapper, "id" | "image"> & {
	image: string;
};

/** Each wrapper's supplier ids, in the order staff listed them. */
function supplierIdsByWrapper(wrapperId?: string) {
	const rows = getDb()
		.query(
			`SELECT wrapper_id, supplier_id FROM wrapper_suppliers
			 WHERE $id IS NULL OR wrapper_id = $id ORDER BY wrapper_id, sort`,
		)
		.all({ id: wrapperId ?? null }) as {
		wrapper_id: string;
		supplier_id: string;
	}[];
	const byWrapper = new Map<string, string[]>();
	for (const row of rows) {
		const list = byWrapper.get(row.wrapper_id) ?? [];
		list.push(row.supplier_id);
		byWrapper.set(row.wrapper_id, list);
	}
	return byWrapper;
}

const toWrapper = (
	row: WrapperRow,
	suppliers: Map<string, string[]>,
): CustomWrapper => {
	const extraColors = JSON.parse(row.extra_colors) as string[];
	return {
		id: row.id,
		...(row.code ? { code: row.code } : {}),
		name: row.name,
		colorHex: row.color_hex,
		...(extraColors.length ? { extraColors } : {}),
		price: fromCents(row.price_cents),
		enabled: row.is_enabled === 1,
		...(row.stock_quantity === null ? {} : { stock: row.stock_quantity }),
		...(row.stock_actual === null ? {} : { stockActual: row.stock_actual }),
		...(row.image ? { image: row.image } : {}),
		...(suppliers.has(row.id)
			? { supplierIds: suppliers.get(row.id) as string[] }
			: {}),
	};
};

/** Every wrapper, in the order shoppers see them. */
export function listWrappers(): CustomWrapper[] {
	const suppliers = supplierIdsByWrapper();
	return (
		getDb()
			.query("SELECT * FROM wrappers ORDER BY sort, name")
			.all() as WrapperRow[]
	).map((row) => toWrapper(row, suppliers));
}

export function getWrapper(id: string): CustomWrapper | null {
	const row = getDb()
		.query("SELECT * FROM wrappers WHERE id = $id")
		.get({ id }) as WrapperRow | null;
	return row ? toWrapper(row, supplierIdsByWrapper(row.id)) : null;
}

export function getWrapperByCode(code: string): CustomWrapper | null {
	const row = getDb()
		.query("SELECT * FROM wrappers WHERE code = $code")
		.get({ code }) as WrapperRow | null;
	return row ? toWrapper(row, supplierIdsByWrapper(row.id)) : null;
}

const wrapperParams = (input: WrapperInput) => ({
	code: input.code || null,
	name: input.name,
	colorHex: input.colorHex,
	extraColors: JSON.stringify(input.extraColors ?? []),
	price: toCents(input.price),
	stock: input.stock ?? null,
	stockActual: input.stockActual ?? null,
	enabled: input.enabled ? 1 : 0,
	image: input.image,
});

/** Replaces the wrapper's suppliers with these, in this order. */
function setWrapperSuppliers(wrapperId: string, supplierIds: string[] = []) {
	const db = getDb();
	db.query("DELETE FROM wrapper_suppliers WHERE wrapper_id = $wrapperId").run({
		wrapperId,
	});
	const insert = db.query(
		`INSERT INTO wrapper_suppliers (wrapper_id, supplier_id, sort)
		 VALUES ($wrapperId, $supplierId, $sort)`,
	);
	supplierIds.forEach((supplierId, sort) => {
		insert.run({ wrapperId, supplierId, sort });
	});
}

/** Adds a wrapper (`id` null) or replaces one, suppliers too. Returns its id. */
export function saveWrapper(id: string | null, input: WrapperInput) {
	const db = getDb();
	const now = nowIso();
	return db.transaction(() => {
		if (id) {
			const { changes } = db
				.query(
					`UPDATE wrappers SET code = $code, name = $name, color_hex = $colorHex, extra_colors = $extraColors, price_cents = $price,
					   stock_quantity = $stock, stock_actual = $stockActual, is_enabled = $enabled, image = $image, updated_at = $now
					 WHERE id = $id`,
				)
				.run({ id, ...wrapperParams(input), now });
			if (changes === 0) throw new Error("Wrapper not found");
			setWrapperSuppliers(id, input.supplierIds);
			return id;
		}
		const newId = `w-${crypto.randomUUID().slice(0, 8)}`;
		db.query(
			`INSERT INTO wrappers (id, code, name, color_hex, extra_colors, price_cents, stock_quantity, stock_actual, is_enabled, image, sort,
			   created_at, updated_at)
			 VALUES ($id, $code, $name, $colorHex, $extraColors, $price, $stock, $stockActual, $enabled, $image,
			   (SELECT COALESCE(MAX(sort), -1) + 1 FROM wrappers), $now, $now)`,
		).run({ id: newId, ...wrapperParams(input), now });
		setWrapperSuppliers(newId, input.supplierIds);
		return newId;
	})();
}

/**
 * The wrapper with this name (ignoring case), added switched off for custom
 * bouquets if there isn't one. For seed scripts that name wrappers.
 */
export function wrapperIdByName(name: string) {
	const row = getDb()
		.query("SELECT id FROM wrappers WHERE lower(name) = lower($name)")
		.get({ name: name.trim() }) as { id: string } | null;
	if (row) return row.id;
	return saveWrapper(null, {
		name: name.trim(),
		colorHex: "#d9cfc7",
		price: 0,
		enabled: false,
		image: "",
	});
}

/**
 * Saves a wrapper from an Excel import: the one with this code is overwritten
 * (keeping what the sheet doesn't hold: whether it's offered, its extra
 * colors and its suppliers), otherwise it's added.
 */
export function importWrapper(input: WrapperInput & { code: string }) {
	const existing = getWrapperByCode(input.code);
	return existing
		? saveWrapper(existing.id, {
				...input,
				enabled: existing.enabled,
				extraColors: existing.extraColors,
				supplierIds: existing.supplierIds,
			})
		: saveWrapper(null, input);
}

/** Switches a wrapper on or off without touching the rest. */
export function setWrapperEnabled(id: string, enabled: boolean) {
	const { changes } = getDb()
		.query(
			"UPDATE wrappers SET is_enabled = $enabled, updated_at = $now WHERE id = $id",
		)
		.run({ id, enabled: enabled ? 1 : 0, now: nowIso() });
	return changes > 0;
}

/** Deletes a wrapper. Past orders keep its name and color. */
export function deleteWrapper(id: string) {
	const { changes } = getDb()
		.query("DELETE FROM wrappers WHERE id = $id")
		.run({ id });
	return changes > 0;
}

/** Replaces every wrapper (keeping their ids), for restoring a catalog snapshot. */
export function replaceWrappers(wrappers: CustomWrapper[]) {
	const db = getDb();
	const insert = db.query(
		`INSERT INTO wrappers (id, code, name, color_hex, extra_colors, price_cents, stock_quantity, stock_actual, is_enabled, image, sort,
		   created_at, updated_at)
		 VALUES ($id, $code, $name, $colorHex, $extraColors, $price, $stock, $stockActual, $enabled, $image, $sort, $now, $now)`,
	);
	db.transaction(() => {
		db.exec("DELETE FROM wrappers");
		wrappers.forEach((wrapper, sort) => {
			insert.run({
				id: wrapper.id,
				...wrapperParams({ ...wrapper, image: wrapper.image ?? "" }),
				sort,
				now: nowIso(),
			});
		});
	})();
}

/**
 * Moves wrappers in or out of stock for built bouquets: `-1` when an order is
 * placed, `+1` when it's cancelled. Wrappers whose stock isn't counted are
 * left alone. Run inside the order's transaction. Returns the wrapper that
 * ran out, if taking failed.
 */
export function adjustWrapperStock(
	lines: { custom?: { wrapperId: string }; quantity: number }[],
	direction: 1 | -1,
): string | null {
	const update = getDb().query(
		`UPDATE wrappers SET stock_quantity = stock_quantity + $change, updated_at = $now
		 WHERE id = $id AND stock_quantity IS NOT NULL AND stock_quantity + $change >= 0`,
	);
	for (const line of lines) {
		if (!line.custom) continue;
		const wrapper = getWrapper(line.custom.wrapperId);
		if (wrapper?.stock === undefined) continue;
		const { changes } = update.run({
			id: wrapper.id,
			change: direction * line.quantity,
			now: nowIso(),
		});
		if (changes === 0) return wrapper.name;
	}
	return null;
}
