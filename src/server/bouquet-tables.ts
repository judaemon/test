import type { Database } from "bun:sqlite";

// Signature bouquets and their styles, and moving the old products/variants
// tables into them. Kept apart from db.ts because the migration, the starter
// data and the catalog snapshot import all use it.

export const BOUQUET_TABLES_SQL = `
	CREATE TABLE signature_bouquets (
		-- Also the shop link: /products/<id>.
		id TEXT PRIMARY KEY,
		-- A girl's name, e.g. Odette.
		name TEXT NOT NULL UNIQUE COLLATE NOCASE,
		description TEXT NOT NULL DEFAULT '',
		-- petite, classic, impressive or grand; empty if not set.
		size TEXT NOT NULL DEFAULT '',
		is_visible INTEGER NOT NULL DEFAULT 1,
		sort INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	-- The versions shoppers pick between ("themes" in the shop), e.g. Pink and Cream.
	CREATE TABLE bouquet_styles (
		id TEXT PRIMARY KEY,
		bouquet_id TEXT NOT NULL REFERENCES signature_bouquets(id) ON DELETE CASCADE ON UPDATE CASCADE,
		-- Also the shop link's ?theme= value; orders and bags refer to it.
		slug TEXT NOT NULL,
		name TEXT NOT NULL,
		color_hex TEXT,
		color_hex2 TEXT,
		swatch_image TEXT,
		price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
		-- Unavailable styles still show in the shop but can't be ordered.
		is_available INTEGER NOT NULL DEFAULT 1,
		images TEXT NOT NULL DEFAULT '[]',
		image_tags TEXT NOT NULL DEFAULT '[]',
		ai_photos INTEGER NOT NULL DEFAULT 1,
		wrapper_id TEXT REFERENCES wrappers(id) ON DELETE SET NULL,
		sort INTEGER NOT NULL DEFAULT 0,
		UNIQUE (bouquet_id, slug)
	);
	-- A style's recipe: how many of which flower color.
	CREATE TABLE style_flowers (
		style_id TEXT NOT NULL REFERENCES bouquet_styles(id) ON DELETE CASCADE,
		-- A flower color can't be deleted while a recipe uses it.
		flower_color_id TEXT NOT NULL REFERENCES flower_colors(id) ON DELETE RESTRICT,
		count INTEGER NOT NULL CHECK (count > 0),
		sort INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX style_flowers_style ON style_flowers (style_id);
	CREATE INDEX style_flowers_color ON style_flowers (flower_color_id);
	-- Old /products/<product>?variant=<color> links, and where they go now.
	CREATE TABLE bouquet_redirects (
		old_product_id TEXT NOT NULL,
		old_variant_id TEXT NOT NULL,
		bouquet_id TEXT NOT NULL REFERENCES signature_bouquets(id) ON DELETE CASCADE ON UPDATE CASCADE,
		style_slug TEXT NOT NULL,
		PRIMARY KEY (old_product_id, old_variant_id)
	);
`;

/** The old tables, for loading a catalog snapshot taken before bouquets had their own. */
export const LEGACY_CATALOG_SQL = `
	CREATE TABLE products (
		id TEXT PRIMARY KEY, title TEXT, description TEXT, base_price_cents INTEGER, currency TEXT,
		is_visible INTEGER, sort INTEGER, created_at TEXT, updated_at TEXT,
		size_reference_image TEXT, holder_height_cm INTEGER, size TEXT
	);
	CREATE TABLE variants (
		product_id TEXT, id TEXT, sku TEXT, color_name TEXT, color_hex TEXT, color_hex2 TEXT,
		swatch_image TEXT, price_cents INTEGER, stock_quantity INTEGER, is_available INTEGER,
		images TEXT, image_tags TEXT, recipe TEXT, wrapper_color TEXT, wrapper_id TEXT,
		size TEXT, ai_photos INTEGER, sort INTEGER
	);
`;

const now = () => new Date().toISOString();

export function slugify(value: string) {
	return (
		value
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "item"
	);
}

/** `base`, or `base-2`, `base-3`… if it's taken; adds the result to `taken`. */
export function uniqueSlug(base: string, taken: Set<string>) {
	let slug = base;
	for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
	taken.add(slug);
	return slug;
}

/** Rough swatches for wrapper names that only existed as text. */
const NAMED_SWATCHES: Record<string, string> = {
	black: "#1f1a1c",
	white: "#f7f4ee",
	ivory: "#f7f1e1",
	cream: "#f4ecd9",
	kraft: "#c9a77c",
	brown: "#8b5e3c",
	red: "#b3122e",
	maroon: "#800000",
	pink: "#f2a6b8",
	blush: "#f2c4ce",
	peach: "#f7b99a",
	coral: "#f27a5c",
	yellow: "#f5c542",
	gold: "#d4af37",
	green: "#7fa36b",
	blue: "#5b7fd1",
	lavender: "#c3a8e0",
	purple: "#7b4fa8",
	violet: "#8e5bc4",
};

/** "Light Purple" → purple's swatch; the first color word found wins. */
function swatchForName(name: string) {
	for (const word of name.toLowerCase().split(/[^a-z]+/))
		if (NAMED_SWATCHES[word]) return NAMED_SWATCHES[word];
	return "#d9cfc7";
}

/**
 * The wrapper with this name (ignoring case), added switched off for custom
 * bouquets if there isn't one. Empty for a blank name.
 */
export function wrapperIdForName(db: Database, rawName: string) {
	const name = rawName.trim();
	if (!name) return null;
	const row = db
		.query("SELECT id FROM wrappers WHERE lower(trim(name)) = lower($name)")
		.get({ name }) as { id: string } | null;
	if (row) return row.id;
	const id = `w-${crypto.randomUUID().slice(0, 8)}`;
	db.query(
		`INSERT INTO wrappers (id, name, color_hex, price_cents, is_enabled, sort, created_at, updated_at)
		 VALUES ($id, $name, $hex, 0, 0, (SELECT COALESCE(MAX(sort), -1) + 1 FROM wrappers), $now, $now)`,
	).run({ id, name, hex: swatchForName(name), now: now() });
	return id;
}

/**
 * The flower color a recipe line names: the color picked, or the flower's
 * only color. Flowers and colors that only existed as text are added,
 * switched off for custom bouquets.
 */
export function flowerColorIdFor(
	db: Database,
	flowerName: string,
	colorName?: string,
) {
	let flower = db
		.query("SELECT id FROM flowers WHERE name = $name")
		.get({ name: flowerName.trim() }) as { id: string } | null;
	if (!flower) {
		flower = { id: crypto.randomUUID() };
		db.query(
			`INSERT INTO flowers (id, name, is_enabled, sort, created_at, updated_at)
			 VALUES ($id, $name, 0, (SELECT COALESCE(MAX(sort), -1) + 1 FROM flowers), $now, $now)`,
		).run({ id: flower.id, name: flowerName.trim(), now: now() });
	}
	const colors = db
		.query(
			"SELECT id, name FROM flower_colors WHERE flower_id = $id ORDER BY sort",
		)
		.all({ id: flower.id }) as { id: string; name: string }[];
	const wanted = colorName?.trim().toLowerCase();
	const match = wanted
		? colors.find((c) => c.name.toLowerCase() === wanted)
		: colors.length === 1
			? colors[0]
			: undefined;
	if (match) return match.id;
	// Named with no color, on a flower with several: its first color.
	if (!wanted && colors[0]) return colors[0].id;
	const id = crypto.randomUUID();
	db.query(
		`INSERT INTO flower_colors (id, flower_id, name, price_cents, is_enabled, sort)
		 VALUES ($id, $flowerId, $name,
		   (SELECT COALESCE(MIN(price_cents), 0) FROM flower_colors WHERE flower_id = $flowerId), 0,
		   (SELECT COALESCE(MAX(sort), -1) + 1 FROM flower_colors WHERE flower_id = $flowerId))`,
	).run({ id, flowerId: flower.id, name: colorName?.trim() || "Natural" });
	return id;
}

interface LegacyProduct {
	id: string;
	title: string;
	description: string | null;
	base_price_cents: number | null;
	is_visible: number | null;
}

interface LegacyVariant {
	product_id: string;
	id: string;
	sku: string | null;
	color_name: string | null;
	color_hex: string | null;
	color_hex2: string | null;
	swatch_image: string | null;
	price_cents: number | null;
	stock_quantity: number | null;
	is_available: number | null;
	images: string | null;
	image_tags: string | null;
	recipe: string | null;
	wrapper_color: string | null;
	size: string | null;
	ai_photos: number | null;
}

/**
 * Moves the old `products` and `variants` tables into signature bouquets:
 * each style code (a girl's name) becomes a bouquet with that name, and each
 * of its colors becomes one of its styles. Recipes and wrappers are linked to
 * the flower and wrapper tables, old shop links are kept as redirects, order
 * lines are pointed at the new bouquets, and the old tables are dropped.
 */
export function moveProductsToBouquets(db: Database) {
	const products = db
		.query("SELECT * FROM products ORDER BY sort, created_at, id")
		.all() as LegacyProduct[];
	const variants = db
		.query("SELECT * FROM variants ORDER BY sort, id")
		.all() as LegacyVariant[];

	const bouquetIds = new Set(
		(
			db.query("SELECT id FROM signature_bouquets").all() as { id: string }[]
		).map((r) => r.id),
	);
	let sort = (
		db
			.query("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM signature_bouquets")
			.get() as { n: number }
	).n;
	const insertBouquet = db.query(
		`INSERT INTO signature_bouquets (id, name, description, size, is_visible, sort, created_at, updated_at)
		 VALUES ($id, $name, $description, $size, $visible, $sort, $now, $now)`,
	);
	const insertStyle = db.query(
		`INSERT INTO bouquet_styles (id, bouquet_id, slug, name, color_hex, color_hex2, swatch_image, price_cents,
		   is_available, images, image_tags, ai_photos, wrapper_id, sort)
		 VALUES ($id, $bouquetId, $slug, $name, $colorHex, $colorHex2, $swatchImage, $price, $available,
		   $images, $imageTags, $aiPhotos, $wrapperId, $sort)`,
	);
	const insertFlower = db.query(
		`INSERT INTO style_flowers (style_id, flower_color_id, count, sort)
		 VALUES ($styleId, $colorId, $count, $sort)`,
	);
	const insertRedirect = db.query(
		`INSERT OR REPLACE INTO bouquet_redirects (old_product_id, old_variant_id, bouquet_id, style_slug)
		 VALUES ($productId, $variantId, $bouquetId, $slug)`,
	);

	// Bouquets by name (ignoring case), in the order their products came.
	const bouquets = new Map<string, { id: string; slugs: Set<string> }>();
	let styleSort = 0;
	for (const product of products) {
		for (const variant of variants.filter((v) => v.product_id === product.id)) {
			const name = (variant.sku?.trim() || product.title).replace(/\s+/g, " ");
			const key = name.toLowerCase();
			let bouquet = bouquets.get(key);
			if (!bouquet) {
				const sizes = variants
					.filter(
						(v) =>
							v.product_id === product.id &&
							(v.sku?.trim() || product.title)
								.replace(/\s+/g, " ")
								.toLowerCase() === key,
					)
					.map((v) => v.size ?? "")
					.filter(Boolean);
				bouquet = {
					id: uniqueSlug(slugify(name), bouquetIds),
					slugs: new Set(),
				};
				bouquets.set(key, bouquet);
				insertBouquet.run({
					id: bouquet.id,
					name,
					description: product.description ?? "",
					// One size for the bouquet: the one most of its colors had.
					size: mostCommon(sizes) ?? "",
					visible: product.is_visible === 0 ? 0 : 1,
					sort: sort++,
					now: now(),
				});
			}
			const styleId = crypto.randomUUID();
			// Named after the style (?theme=cream); old links go through redirects.
			const slug = uniqueSlug(
				slugify(variant.color_name?.trim() || variant.id),
				bouquet.slugs,
			);
			insertStyle.run({
				id: styleId,
				bouquetId: bouquet.id,
				slug,
				name: variant.color_name?.trim() || "Standard",
				colorHex: variant.color_hex,
				colorHex2: variant.color_hex2 || null,
				swatchImage: variant.swatch_image,
				price: variant.price_cents ?? product.base_price_cents ?? 0,
				// Styles kept no stock count; a sold-out one is unavailable.
				available:
					variant.is_available === 0 || (variant.stock_quantity ?? 0) <= 0
						? 0
						: 1,
				images: variant.images ?? "[]",
				imageTags: variant.image_tags ?? "[]",
				aiPhotos: variant.ai_photos === 0 ? 0 : 1,
				wrapperId: wrapperIdForName(db, variant.wrapper_color ?? ""),
				sort: styleSort++,
			});
			const recipe = JSON.parse(variant.recipe || "[]") as {
				flower: string;
				color?: string;
				count?: number;
			}[];
			recipe.forEach((item, index) => {
				if (!item.flower?.trim()) return;
				insertFlower.run({
					styleId,
					colorId: flowerColorIdFor(db, item.flower, item.color),
					count: Math.max(1, item.count || 1),
					sort: index,
				});
			});
			insertRedirect.run({
				productId: product.id,
				variantId: variant.id,
				bouquetId: bouquet.id,
				slug,
			});
		}
	}

	// Open orders cancel by product and style, so point their
	// lines at the bouquets. What the shopper saw (title, style, color) stays.
	const redirects = db.query("SELECT * FROM bouquet_redirects").all() as {
		old_product_id: string;
		old_variant_id: string;
		bouquet_id: string;
		style_slug: string;
	}[];
	const target = new Map(
		redirects.map((r) => [`${r.old_product_id}::${r.old_variant_id}`, r]),
	);
	const orders = db.query("SELECT id, lines FROM orders").all() as {
		id: string;
		lines: string;
	}[];
	const updateOrder = db.query(
		"UPDATE orders SET lines = $lines WHERE id = $id",
	);
	for (const order of orders) {
		const lines = JSON.parse(order.lines) as {
			productId: string;
			variantId: string;
		}[];
		let changed = false;
		for (const line of lines) {
			const to = target.get(`${line.productId}::${line.variantId}`);
			if (!to) continue;
			line.productId = to.bouquet_id;
			line.variantId = to.style_slug;
			changed = true;
		}
		if (changed)
			updateOrder.run({ id: order.id, lines: JSON.stringify(lines) });
	}

	db.exec("DROP TABLE variants");
	db.exec("DROP TABLE products");
}

function mostCommon(values: string[]) {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
