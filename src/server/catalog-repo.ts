import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import type { BouquetSize } from "~/lib/sizes";
import type {
	AdminProduct,
	AdminVariant,
	PhotoTag,
	Product,
	RecipeItem,
} from "~/types/product";
import { slugify, uniqueSlug } from "./bouquet-tables";
import { fromCents, getDb, nowIso, toCents } from "./db";
import { InputError } from "./validate";

interface BouquetRow {
	id: string;
	name: string;
	description: string;
	size_id: string | null;
	is_visible: number;
}

interface StyleRow {
	id: string;
	bouquet_id: string;
	slug: string;
	name: string;
	color_hex: string | null;
	color_hex2: string | null;
	swatch_image: string | null;
	price_cents: number;
	is_available: number;
	stock_quantity: number | null;
	takes_preorders: number;
	preorder_slots: number | null;
	preorder_days: number | null;
	preorder_date: string | null;
	images: string;
	image_tags: string;
	image_captions: string;
	ai_photos: number;
	wrapper_id: string | null;
	/** The linked wrapper's name, from the join. */
	wrapper_name: string | null;
}

interface RecipeRow {
	style_id: string;
	flower: string;
	color: string;
	count: number;
	is_filler: number;
	/** How many colors the flower has; with one, recipes name none. */
	colors: number;
}

/**
 * Every signature bouquet with its styles, as products and variants: the
 * bouquet's name is also each style's code (`sku`), and a style's name its
 * `colorName`.
 */
export function listAdminProducts({
	includeHidden = true,
} = {}): AdminProduct[] {
	const db = getDb();
	const bouquets = db
		.query(
			`SELECT * FROM signature_bouquets ${includeHidden ? "" : "WHERE is_visible = 1"} ORDER BY sort, created_at`,
		)
		.all() as BouquetRow[];
	const styles = db
		.query(
			`SELECT s.*, w.name AS wrapper_name FROM bouquet_styles s
			 LEFT JOIN wrappers w ON w.id = s.wrapper_id ORDER BY s.sort`,
		)
		.all() as StyleRow[];
	const recipes = db
		.query(
			`SELECT sf.style_id, f.name AS flower, c.name AS color, sf.count, sf.is_filler,
			   (SELECT COUNT(*) FROM flower_colors WHERE flower_id = f.id) AS colors
			 FROM style_flowers sf
			 JOIN flower_colors c ON c.id = sf.flower_color_id
			 JOIN flowers f ON f.id = c.flower_id
			 ORDER BY sf.sort`,
		)
		.all() as RecipeRow[];
	return bouquets.map((row) => {
		const size = row.size_id ?? "";
		const variants = styles
			.filter((style) => style.bouquet_id === row.id)
			.map((style) => toVariant(style, row, size, recipes));
		return {
			id: row.id,
			title: row.name,
			description: row.description,
			// The cheapest style, for "from ₱…".
			basePrice: variants.length
				? Math.min(...variants.map((v) => v.price ?? 0))
				: 0,
			currency: "PHP",
			size,
			isVisible: row.is_visible === 1,
			variants,
		};
	});
}

function toVariant(
	row: StyleRow,
	bouquet: BouquetRow,
	size: BouquetSize | "",
	recipes: RecipeRow[],
): AdminVariant {
	const isAvailable = row.is_available === 1;
	const readyStock = row.stock_quantity ?? undefined;
	const preorderSlots = row.preorder_slots ?? undefined;
	const takesPreorders = row.takes_preorders === 1;
	// Ready-made bouquets sell first; once they're gone it's a pre-order
	// (when staff take them) or sold out.
	const preorder = readyStock === 0 && takesPreorders;
	const stock = !isAvailable
		? undefined
		: readyStock === 0 && takesPreorders
			? preorderSlots
			: readyStock;
	return {
		id: row.slug,
		sku: bouquet.name,
		colorName: row.name,
		colorHex: row.color_hex ?? undefined,
		colorHex2: row.color_hex2 ?? undefined,
		swatchImage: row.swatch_image ?? undefined,
		price: fromCents(row.price_cents),
		isAvailable,
		inStock: isAvailable && stock !== 0,
		...(isAvailable && preorder ? { preorder: true } : {}),
		...(stock === undefined ? {} : { stock }),
		...(readyStock === undefined ? {} : { readyStock }),
		takesPreorders,
		...(preorderSlots === undefined ? {} : { preorderSlots }),
		...(row.preorder_days ? { readyInDays: row.preorder_days } : {}),
		...(row.preorder_date ? { readyOn: row.preorder_date } : {}),
		images: JSON.parse(row.images) as string[],
		imageTags: JSON.parse(row.image_tags) as PhotoTag[],
		imageCaptions: JSON.parse(row.image_captions) as string[],
		recipe: recipes
			.filter((item) => item.style_id === row.id)
			.map((item) => ({
				flower: item.flower,
				count: item.count,
				...(item.colors > 1 ? { color: item.color } : {}),
				...(item.is_filler ? { filler: true } : {}),
			})),
		size,
		wrapperColor: row.wrapper_name ?? "",
		...(row.wrapper_id ? { wrapperId: row.wrapper_id } : {}),
		aiPhotos: row.ai_photos === 1,
	};
}

export function getAdminProduct(id: string): AdminProduct | undefined {
	return listAdminProducts().find((product) => product.id === id);
}

/** Strips staff-only fields before data goes to the shop. */
export function toPublicProduct(product: AdminProduct): Product {
	return {
		id: product.id,
		title: product.title,
		description: product.description,
		basePrice: product.basePrice,
		currency: product.currency,
		size: product.size,
		variants: product.variants.map(
			({
				isAvailable: _available,
				wrapperId: _wrapperId,
				readyStock: _readyStock,
				takesPreorders: _takesPreorders,
				preorderSlots: _preorderSlots,
				readyInDays,
				readyOn,
				...variant
			}) =>
				// The shop only needs when pre-orders are ready while it's one.
				variant.preorder ? { ...variant, readyInDays, readyOn } : variant,
		),
	};
}

export function listPublicProducts(): Product[] {
	return listAdminProducts({ includeHidden: false }).map(toPublicProduct);
}

/** Where an old /products/<product>?variant=<color> link goes now. */
export function findBouquetRedirect(oldProductId: string, oldVariantId = "") {
	return getDb()
		.query(
			`SELECT bouquet_id AS productId, style_slug AS variant FROM bouquet_redirects
			 WHERE old_product_id = $productId
			 ORDER BY old_variant_id = $variantId DESC, rowid LIMIT 1`,
		)
		.get({ productId: oldProductId, variantId: oldVariantId }) as {
		productId: string;
		variant: string;
	} | null;
}

export interface VariantInput {
	/** Present for existing styles; new styles get one from their name. */
	id?: string;
	colorName: string;
	colorHex: string;
	/** Missing or empty for a single color. */
	colorHex2?: string;
	price: number;
	isAvailable: boolean;
	/** Ready-made bouquets; null or missing when made to order, with no limit. */
	readyStock?: number | null;
	takesPreorders?: boolean;
	/** Null or missing for no limit. */
	preorderSlots?: number | null;
	/** When pre-orders are ready: days after ordering, or a date; at most one. */
	readyInDays?: number | null;
	readyOn?: string | null;
	images: string[];
	/** Missing means "by position". */
	imageTags?: PhotoTag[];
	/** By position; missing means none. */
	imageCaptions?: string[];
	/** Flowers and colors by name, as in Admin → Flowers. */
	recipe: RecipeItem[];
	/** A row of the wrappers table; empty for none. */
	wrapperId: string;
	/** Starts on when left out. */
	aiPhotos?: boolean;
}

export interface ProductInput {
	/** The bouquet's name, a girl's name. */
	title: string;
	description: string;
	size: BouquetSize | "";
	isVisible: boolean;
	variants: VariantInput[];
}

/**
 * Creates or fully replaces a signature bouquet and its styles in one
 * transaction. Styles missing from `input.variants` are removed; past orders
 * keep their own snapshot, so removing a style never rewrites history.
 */
export function saveProduct(productId: string | null, input: ProductInput) {
	const db = getDb();
	return db.transaction(() => {
		let id = productId;
		if (id === null) {
			const taken = new Set(
				(
					db.query("SELECT id FROM signature_bouquets").all() as {
						id: string;
					}[]
				).map((r) => r.id),
			);
			id = uniqueSlug(slugify(input.title), taken);
			db.query(
				`INSERT INTO signature_bouquets (id, name, description, size_id, is_visible, sort, created_at, updated_at)
				 VALUES ($id, $name, $description, $size, $visible,
				   (SELECT COALESCE(MAX(sort), -1) + 1 FROM signature_bouquets), $now, $now)`,
			).run({
				id,
				name: input.title,
				description: input.description,
				size: input.size || null,
				visible: input.isVisible ? 1 : 0,
				now: nowIso(),
			});
		} else {
			const result = db
				.query(
					`UPDATE signature_bouquets SET name = $name, description = $description, size_id = $size,
					   is_visible = $visible, updated_at = $now WHERE id = $id`,
				)
				.run({
					id,
					name: input.title,
					description: input.description,
					size: input.size || null,
					visible: input.isVisible ? 1 : 0,
					now: nowIso(),
				});
			if (result.changes === 0) throw new Error("Bouquet not found");
		}

		const existing = new Map(
			(
				db
					.query("SELECT id, slug FROM bouquet_styles WHERE bouquet_id = $id")
					.all({ id }) as { id: string; slug: string }[]
			).map((r) => [r.slug, r.id]),
		);
		const taken = new Set(
			input.variants.flatMap((v) => (v.id && existing.has(v.id) ? [v.id] : [])),
		);
		const kept = new Set<string>();
		const upsert = db.query(
			`INSERT INTO bouquet_styles (id, bouquet_id, slug, name, color_hex, color_hex2, price_cents, is_available,
			   stock_quantity, takes_preorders, preorder_slots, preorder_days, preorder_date,
			   images, image_tags, image_captions, ai_photos, wrapper_id, sort)
			 VALUES ($id, $bouquetId, $slug, $name, $colorHex, $colorHex2, $price, $available,
			   $stock, $takesPreorders, $preorderSlots, $readyInDays, $readyOn,
			   $images, $imageTags, $imageCaptions, $aiPhotos, $wrapperId, $sort)
			 ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name,
			   color_hex = excluded.color_hex, color_hex2 = excluded.color_hex2, price_cents = excluded.price_cents,
			   is_available = excluded.is_available, stock_quantity = excluded.stock_quantity,
			   takes_preorders = excluded.takes_preorders, preorder_slots = excluded.preorder_slots,
			   preorder_days = excluded.preorder_days, preorder_date = excluded.preorder_date,
			   images = excluded.images, image_tags = excluded.image_tags,
			   image_captions = excluded.image_captions, ai_photos = excluded.ai_photos,
			   wrapper_id = excluded.wrapper_id, sort = excluded.sort`,
		);
		const clearRecipe = db.query(
			"DELETE FROM style_flowers WHERE style_id = $styleId",
		);
		const addFlower = db.query(
			`INSERT INTO style_flowers (style_id, flower_color_id, count, is_filler, sort)
			 VALUES ($styleId, $colorId, $count, $filler, $sort)`,
		);
		input.variants.forEach((variant, index) => {
			const slug =
				variant.id && existing.has(variant.id)
					? variant.id
					: uniqueSlug(slugify(variant.colorName), taken);
			const styleId = existing.get(slug) ?? crypto.randomUUID();
			kept.add(styleId);
			upsert.run({
				id: styleId,
				bouquetId: id,
				slug,
				name: variant.colorName,
				colorHex: variant.colorHex,
				colorHex2: variant.colorHex2 || null,
				price: toCents(variant.price),
				available: variant.isAvailable ? 1 : 0,
				stock: variant.readyStock ?? null,
				takesPreorders: variant.takesPreorders ? 1 : 0,
				preorderSlots: variant.preorderSlots ?? null,
				readyInDays: variant.readyInDays ?? null,
				readyOn: variant.readyOn ?? null,
				images: JSON.stringify(variant.images),
				imageTags: JSON.stringify(variant.imageTags ?? []),
				imageCaptions: JSON.stringify(variant.imageCaptions ?? []),
				aiPhotos: variant.aiPhotos === false ? 0 : 1,
				wrapperId: variant.wrapperId || null,
				sort: index,
			});
			clearRecipe.run({ styleId });
			variant.recipe.forEach((item, sort) => {
				addFlower.run({
					styleId,
					colorId: flowerColorId(item),
					count: item.count ?? 1,
					filler: item.filler ? 1 : 0,
					sort,
				});
			});
		});
		const remove = db.query("DELETE FROM bouquet_styles WHERE id = $id");
		for (const styleId of existing.values())
			if (!kept.has(styleId)) remove.run({ id: styleId });
		return id;
	})();
}

/**
 * Sets the shop's order: `ids` lists every bouquet, the first shown first. A
 * list that's out of date is refused, so a bouquet added or deleted in the
 * meantime can't end up without a place.
 */
export function reorderProducts(ids: string[]) {
	const db = getDb();
	db.transaction(() => {
		const current = db.query("SELECT id FROM signature_bouquets").all() as {
			id: string;
		}[];
		const known = new Set(current.map((row) => row.id));
		const complete =
			new Set(ids).size === known.size &&
			ids.length === known.size &&
			ids.every((id) => known.has(id));
		if (!complete)
			throw new InputError(
				"The bouquets changed since you opened this page. Reload and try again.",
			);
		const update = db.query(
			"UPDATE signature_bouquets SET sort = $sort WHERE id = $id",
		);
		ids.forEach((id, sort) => {
			update.run({ id, sort });
		});
	})();
}

/** The flower color a checked recipe line names (its only color if none). */
function flowerColorId(item: RecipeItem) {
	const row = getDb()
		.query(
			`SELECT c.id FROM flower_colors c JOIN flowers f ON f.id = c.flower_id
			 WHERE f.name = $flower AND ($color = '' OR c.name = $color)
			 ORDER BY c.sort LIMIT 1`,
		)
		.get({ flower: item.flower, color: item.color ?? "" }) as {
		id: string;
	} | null;
	if (!row)
		throw new InputError(
			`${item.flower}${item.color ? ` · ${item.color}` : ""} isn’t in Flowers.`,
		);
	return row.id;
}

/**
 * Quick edits from the list of bouquets: a style's availability, price or
 * ready-made stock (null for made to order).
 */
export function updateStyle(
	productId: string,
	variantId: string,
	patch: { isAvailable?: boolean; price?: number; readyStock?: number | null },
) {
	const db = getDb();
	const result = db
		.query(
			`UPDATE bouquet_styles SET
			   is_available = COALESCE($available, is_available),
			   price_cents = COALESCE($price, price_cents),
			   stock_quantity = CASE WHEN $setStock THEN $stock ELSE stock_quantity END
			 WHERE bouquet_id = $productId AND slug = $variantId`,
		)
		.run({
			productId,
			variantId,
			available:
				patch.isAvailable === undefined ? null : patch.isAvailable ? 1 : 0,
			price: patch.price === undefined ? null : toCents(patch.price),
			setStock: patch.readyStock === undefined ? 0 : 1,
			stock: patch.readyStock ?? null,
		});
	if (result.changes === 0) throw new Error("Style not found");
	db.query(
		"UPDATE signature_bouquets SET updated_at = $now WHERE id = $id",
	).run({ id: productId, now: nowIso() });
}

/** Quick edit from the list of bouquets: shows or hides it in the shop. */
export function setProductVisible(productId: string, isVisible: boolean) {
	const { changes } = getDb()
		.query(
			`UPDATE signature_bouquets SET is_visible = $visible, updated_at = $now
			 WHERE id = $id`,
		)
		.run({ id: productId, visible: isVisible ? 1 : 0, now: nowIso() });
	if (changes === 0) throw new InputError("That bouquet was deleted.");
}

/**
 * Deletes a bouquet and all its styles. Past orders keep their own copy of
 * what was bought, so they're unaffected.
 */
export function deleteProduct(productId: string) {
	const { changes } = getDb()
		.query("DELETE FROM signature_bouquets WHERE id = $id")
		.run({ id: productId });
	return changes > 0;
}

/** Deletes one style of a bouquet; a bouquet keeps at least one style. */
export function deleteVariant(productId: string, variantId: string) {
	const db = getDb();
	return db.transaction(() => {
		const { count } = db
			.query(
				"SELECT COUNT(*) AS count FROM bouquet_styles WHERE bouquet_id = $id",
			)
			.get({ id: productId }) as { count: number };
		if (count <= 1)
			throw new InputError(
				"This is the bouquet’s only style. Delete the whole bouquet instead.",
			);
		db.query(
			"DELETE FROM bouquet_styles WHERE bouquet_id = $productId AND slug = $variantId",
		).run({ productId, variantId });
	})();
}

/**
 * Takes signature bouquets out of stock (-1) or puts them back (1): ready-made
 * ones, or pre-order slots for lines ordered as a pre-order. Styles with no
 * limit are left alone. Returns the first line there aren't enough of.
 */
export function adjustStyleStock<
	T extends {
		productId: string;
		variantId: string;
		quantity: number;
		preorder?: boolean;
	},
>(lines: T[], direction: 1 | -1): T | null {
	const db = getDb();
	for (const line of lines) {
		if (line.productId === CUSTOM_PRODUCT_ID) continue;
		const column = line.preorder ? "preorder_slots" : "stock_quantity";
		const where = "bouquet_id = $productId AND slug = $variantId";
		const keys = { productId: line.productId, variantId: line.variantId };
		const row = db
			.query(`SELECT ${column} AS left FROM bouquet_styles WHERE ${where}`)
			.get(keys) as { left: number | null } | null;
		if (row?.left === null || row === null) continue;
		const left = row.left + direction * line.quantity;
		if (left < 0) return line;
		db.query(`UPDATE bouquet_styles SET ${column} = $left WHERE ${where}`).run({
			...keys,
			left,
		});
	}
	return null;
}
