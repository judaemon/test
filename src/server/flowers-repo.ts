import {
	type CustomFlowerOption,
	type FlowerRecord,
	itemColor,
	itemUnits,
} from "~/lib/custom-bouquet";
import type { RecipeItem } from "~/types/product";
import { fromCents, getDb, nowIso, toCents } from "./db";
import { InputError } from "./validate";

interface FlowerRow {
	id: string;
	name: string;
	hint: string;
	is_enabled: number;
	image: string;
}

interface ColorRow {
	id: string;
	flower_id: string;
	name: string;
	price_cents: number;
	stock_quantity: number | null;
	is_enabled: number;
	image: string;
}

/** What staff send when adding or editing a flower. */
export interface FlowerInput {
	name: string;
	hint: string;
	enabled: boolean;
	image: string;
	colors: {
		/** Missing for colors added since the flower was loaded. */
		id?: string;
		name: string;
		price: number;
		stock?: number;
		enabled: boolean;
		image: string;
	}[];
}

// TODO: "flowers" also covers greenery like Eucalyptus; see TODO.md.

/** Every flower and its colors, in the order staff see them. */
function readFlowers(where = "", params: Record<string, string> = {}) {
	const db = getDb();
	const flowers = db
		.query(`SELECT * FROM flowers ${where} ORDER BY sort, name`)
		.all(params) as FlowerRow[];
	const colors = db
		.query("SELECT * FROM flower_colors ORDER BY sort, name")
		.all() as ColorRow[];
	return flowers.map((row): Omit<FlowerRecord, "usedIn"> => {
		const own = colors.filter((color) => color.flower_id === row.id);
		return {
			id: row.id,
			name: row.name,
			enabled: row.is_enabled === 1,
			...(row.image ? { image: row.image } : {}),
			colors: own.map((color) => ({
				id: color.id,
				name: color.name,
				price: fromCents(color.price_cents),
				...(color.stock_quantity === null
					? {}
					: { stock: color.stock_quantity }),
				enabled: color.is_enabled === 1,
				...(color.image ? { image: color.image } : {}),
			})),
			kind: {
				colors: own.length > 1,
				...(row.hint ? { hint: row.hint } : {}),
			},
		};
	});
}

/** How many signature bouquet styles use each flower in their recipe. */
function recipeUsage() {
	const rows = getDb()
		.query(
			`SELECT f.name, COUNT(DISTINCT sf.style_id) AS n FROM style_flowers sf
			 JOIN flower_colors c ON c.id = sf.flower_color_id
			 JOIN flowers f ON f.id = c.flower_id GROUP BY f.id`,
		)
		.all() as { name: string; n: number }[];
	return new Map(rows.map((row) => [row.name, row.n]));
}

/** Signature bouquet styles using a flower color in their recipe, by name. */
function stylesUsing(colorIds: string[]) {
	if (colorIds.length === 0) return [];
	return getDb()
		.query(
			`SELECT DISTINCT b.name || ' · ' || s.name AS style FROM style_flowers sf
			 JOIN bouquet_styles s ON s.id = sf.style_id
			 JOIN signature_bouquets b ON b.id = s.bouquet_id
			 WHERE sf.flower_color_id IN (SELECT value FROM json_each($ids))
			 ORDER BY b.sort, s.sort`,
		)
		.all({ ids: JSON.stringify(colorIds) })
		.map((row) => (row as { style: string }).style);
}

/** "Odette · Pink, Althea · White and 3 more" */
function listStyles(styles: string[]) {
	const shown = styles.slice(0, 3).join(", ");
	return styles.length > 3 ? `${shown} and ${styles.length - 3} more` : shown;
}

/** The flowers the builder and recipes use, without their ids. */
export function listShopFlowers(): CustomFlowerOption[] {
	return readFlowers().map(({ id: _id, colors, ...flower }) => ({
		...flower,
		colors: colors.map(({ id: _colorId, ...color }) => color),
	}));
}

export function listFlowers(): FlowerRecord[] {
	const usage = recipeUsage();
	return readFlowers().map((flower) => ({
		...flower,
		usedIn: usage.get(flower.name) ?? 0,
	}));
}

export function getFlower(id: string): FlowerRecord | null {
	const [flower] = readFlowers("WHERE id = $id", { id });
	if (!flower) return null;
	return { ...flower, usedIn: recipeUsage().get(flower.name) ?? 0 };
}

/** Another flower already has this name (ignoring case). */
export function flowerNameTaken(name: string, exceptId?: string) {
	return !!getDb()
		.query("SELECT 1 FROM flowers WHERE name = $name AND id != $id")
		.get({ name, id: exceptId ?? "" });
}

/**
 * Adds a flower (`id` null) or replaces one and its colors. Recipes point at
 * flower colors, so a rename shows up everywhere, and a color a recipe still
 * uses can't be removed. Returns the flower's id.
 */
export function saveFlower(id: string | null, input: FlowerInput) {
	const db = getDb();
	const now = nowIso();
	const flowerId = id ?? crypto.randomUUID();
	db.transaction(() => {
		if (id) {
			const { changes } = db
				.query(
					`UPDATE flowers SET name = $name, hint = $hint, is_enabled = $enabled,
					   image = $image, updated_at = $now WHERE id = $id`,
				)
				.run({ id, ...flowerParams(input), now });
			if (changes === 0) throw new Error("Flower not found");
		} else {
			db.query(
				`INSERT INTO flowers (id, name, hint, is_enabled, image, sort, created_at, updated_at)
				 VALUES ($id, $name, $hint, $enabled, $image,
				   (SELECT COALESCE(MAX(sort), -1) + 1 FROM flowers), $now, $now)`,
			).run({ id: flowerId, ...flowerParams(input), now });
		}
		const current = db
			.query("SELECT id, name FROM flower_colors WHERE flower_id = $id")
			.all({ id: flowerId }) as { id: string; name: string }[];
		const keep = new Set(input.colors.flatMap((c) => (c.id ? [c.id] : [])));
		const removed = current.filter((c) => !keep.has(c.id));
		const inUse = stylesUsing(removed.map((c) => c.id));
		if (inUse.length)
			throw new InputError(
				`${input.name} colors you removed are in ${listStyles(inUse)}. Change those recipes first, or switch the color off instead.`,
			);
		const remove = db.query("DELETE FROM flower_colors WHERE id = $id");
		for (const color of removed) remove.run({ id: color.id });
		saveColors(flowerId, input.colors, new Set(current.map((c) => c.id)));
	})();
	return flowerId;
}

const flowerParams = (input: FlowerInput) => ({
	name: input.name,
	hint: input.hint,
	enabled: input.enabled ? 1 : 0,
	image: input.image,
});

/** Updates the colors this flower already has and adds the new ones. */
function saveColors(
	flowerId: string,
	colors: FlowerInput["colors"],
	existing: Set<string>,
) {
	const db = getDb();
	const insert = db.query(
		`INSERT INTO flower_colors (id, flower_id, name, price_cents, stock_quantity, is_enabled, image, sort)
		 VALUES ($id, $flowerId, $name, $price, $stock, $enabled, $image, $sort)`,
	);
	const update = db.query(
		`UPDATE flower_colors SET name = $name, price_cents = $price, stock_quantity = $stock,
		   is_enabled = $enabled, image = $image, sort = $sort WHERE id = $id AND flower_id = $flowerId`,
	);
	colors.forEach((color, sort) => {
		const params = {
			id: color.id && existing.has(color.id) ? color.id : crypto.randomUUID(),
			flowerId,
			name: color.name,
			price: toCents(color.price),
			stock: color.stock ?? null,
			enabled: color.enabled ? 1 : 0,
			image: color.image,
			sort,
		};
		(existing.has(params.id) ? update : insert).run(params);
	});
}

/** Switches a flower on or off without touching its colors. */
export function setFlowerEnabled(id: string, enabled: boolean) {
	const { changes } = getDb()
		.query(
			"UPDATE flowers SET is_enabled = $enabled, updated_at = $now WHERE id = $id",
		)
		.run({ id, enabled: enabled ? 1 : 0, now: nowIso() });
	return changes > 0;
}

/**
 * Deletes a flower and its colors, unless a signature bouquet recipe still
 * uses it. Past orders keep their own copy of the name.
 */
export function deleteFlower(id: string) {
	const colors = getDb()
		.query("SELECT id FROM flower_colors WHERE flower_id = $id")
		.all({ id }) as { id: string }[];
	const inUse = stylesUsing(colors.map((c) => c.id));
	if (inUse.length)
		throw new InputError(
			`It’s in ${listStyles(inUse)}. Take it out of those recipes first, or stop using it in custom bouquets instead.`,
		);
	const { changes } = getDb()
		.query("DELETE FROM flowers WHERE id = $id")
		.run({ id });
	return changes > 0;
}

/** Replaces every flower, for restoring a catalog snapshot. */
export function replaceFlowers(flowers: CustomFlowerOption[]) {
	const db = getDb();
	db.transaction(() => {
		db.exec("DELETE FROM flowers");
		for (const flower of flowers)
			saveFlower(null, {
				name: flower.name,
				hint: flower.kind.hint ?? "",
				enabled: flower.enabled,
				image: flower.image ?? "",
				colors: flower.colors.map((color) => ({
					...color,
					image: color.image ?? "",
				})),
			});
	})();
}

/**
 * Moves flower colors in or out of stock for built bouquets: `-1` when an
 * order is placed, `+1` when it's cancelled. Colors whose stock isn't counted
 * are left alone. Run inside the order's transaction. Returns the flower that
 * ran out, if taking failed.
 */
export function adjustFlowerStock(
	lines: { custom?: { items: RecipeItem[] }; quantity: number }[],
	direction: 1 | -1,
): string | null {
	const flowers = readFlowers();
	const update = getDb().query(
		`UPDATE flower_colors SET stock_quantity = stock_quantity + $change
		 WHERE id = $id AND stock_quantity IS NOT NULL AND stock_quantity + $change >= 0`,
	);
	for (const line of lines) {
		for (const item of line.custom?.items ?? []) {
			const flower = flowers.find((f) => f.name === item.flower);
			const color = itemColor(flower, item.color);
			if (!flower || color?.stock === undefined) continue;
			const { changes } = update.run({
				id: color.id,
				change: direction * itemUnits(item) * line.quantity,
			});
			if (changes === 0)
				return flower.kind.colors
					? `${color.name} ${flower.name}`
					: flower.name;
		}
	}
	return null;
}
