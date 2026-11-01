import type { CustomWrapper } from "~/lib/custom-bouquet";
import { fromCents, getDb, nowIso, toCents } from "./db";

interface WrapperRow {
	id: string;
	name: string;
	color_hex: string;
	price_cents: number;
	stock_quantity: number | null;
	is_enabled: number;
	image: string;
}

/** What staff send when adding or editing a wrapper. */
export type WrapperInput = Omit<CustomWrapper, "id" | "image"> & {
	image: string;
};

const toWrapper = (row: WrapperRow): CustomWrapper => ({
	id: row.id,
	name: row.name,
	colorHex: row.color_hex,
	price: fromCents(row.price_cents),
	enabled: row.is_enabled === 1,
	...(row.stock_quantity === null ? {} : { stock: row.stock_quantity }),
	...(row.image ? { image: row.image } : {}),
});

/** Every wrapper, in the order shoppers see them. */
export function listWrappers(): CustomWrapper[] {
	return (
		getDb()
			.query("SELECT * FROM wrappers ORDER BY sort, name")
			.all() as WrapperRow[]
	).map(toWrapper);
}

export function getWrapper(id: string): CustomWrapper | null {
	const row = getDb()
		.query("SELECT * FROM wrappers WHERE id = $id")
		.get({ id }) as WrapperRow | null;
	return row ? toWrapper(row) : null;
}

const wrapperParams = (input: WrapperInput) => ({
	name: input.name,
	colorHex: input.colorHex,
	price: toCents(input.price),
	stock: input.stock ?? null,
	enabled: input.enabled ? 1 : 0,
	image: input.image,
});

/** Adds a wrapper (`id` null) or replaces one. Returns its id. */
export function saveWrapper(id: string | null, input: WrapperInput) {
	const db = getDb();
	const now = nowIso();
	if (id) {
		const { changes } = db
			.query(
				`UPDATE wrappers SET name = $name, color_hex = $colorHex, price_cents = $price,
				   stock_quantity = $stock, is_enabled = $enabled, image = $image, updated_at = $now
				 WHERE id = $id`,
			)
			.run({ id, ...wrapperParams(input), now });
		if (changes === 0) throw new Error("Wrapper not found");
		return id;
	}
	const newId = `w-${crypto.randomUUID().slice(0, 8)}`;
	db.query(
		`INSERT INTO wrappers (id, name, color_hex, price_cents, stock_quantity, is_enabled, image, sort,
		   created_at, updated_at)
		 VALUES ($id, $name, $colorHex, $price, $stock, $enabled, $image,
		   (SELECT COALESCE(MAX(sort), -1) + 1 FROM wrappers), $now, $now)`,
	).run({ id: newId, ...wrapperParams(input), now });
	return newId;
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
		`INSERT INTO wrappers (id, name, color_hex, price_cents, stock_quantity, is_enabled, image, sort,
		   created_at, updated_at)
		 VALUES ($id, $name, $colorHex, $price, $stock, $enabled, $image, $sort, $now, $now)`,
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
