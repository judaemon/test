import type { AdminProduct, AdminVariant, Product } from "~/types/product";
import { fromCents, getDb, nowIso, toCents } from "./db";

interface ProductRow {
	id: string;
	title: string;
	description: string;
	base_price_cents: number;
	currency: string;
	is_visible: number;
}

interface VariantRow {
	product_id: string;
	id: string;
	sku: string;
	color_name: string;
	color_hex: string | null;
	swatch_image: string | null;
	price_cents: number | null;
	stock_quantity: number;
	is_available: number;
	images: string;
}

function toVariant(row: VariantRow): AdminVariant {
	const isAvailable = row.is_available === 1;
	return {
		id: row.id,
		sku: row.sku,
		colorName: row.color_name,
		colorHex: row.color_hex ?? undefined,
		swatchImage: row.swatch_image ?? undefined,
		price: row.price_cents === null ? undefined : fromCents(row.price_cents),
		stockQuantity: row.stock_quantity,
		isAvailable,
		inStock: isAvailable && row.stock_quantity > 0,
		images: JSON.parse(row.images) as string[],
	};
}

export function listAdminProducts({
	includeHidden = true,
} = {}): AdminProduct[] {
	const db = getDb();
	const products = db
		.query(
			`SELECT * FROM products ${includeHidden ? "" : "WHERE is_visible = 1"} ORDER BY sort, created_at`,
		)
		.all() as ProductRow[];
	const variants = db
		.query("SELECT * FROM variants ORDER BY sort")
		.all() as VariantRow[];
	return products.map((row) => ({
		id: row.id,
		title: row.title,
		description: row.description,
		basePrice: fromCents(row.base_price_cents),
		currency: row.currency,
		isVisible: row.is_visible === 1,
		variants: variants.filter((v) => v.product_id === row.id).map(toVariant),
	}));
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
		variants: product.variants.map(
			({ isAvailable: _available, ...variant }) => variant,
		),
	};
}

export function listPublicProducts(): Product[] {
	return listAdminProducts({ includeHidden: false }).map(toPublicProduct);
}

export interface VariantInput {
	/** Present for existing colors; new colors get an id from their name. */
	id?: string;
	sku: string;
	colorName: string;
	colorHex: string;
	price: number | null;
	stockQuantity: number;
	isAvailable: boolean;
	images: string[];
}

export interface ProductInput {
	title: string;
	description: string;
	basePrice: number;
	isVisible: boolean;
	variants: VariantInput[];
}

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

function uniqueSlug(base: string, taken: Set<string>) {
	let slug = base;
	for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
	taken.add(slug);
	return slug;
}

/**
 * Creates or fully replaces a product and its colors in one transaction.
 * Colors missing from `input.variants` are removed; past orders keep their
 * own snapshot, so removing a color never rewrites history.
 */
export function saveProduct(productId: string | null, input: ProductInput) {
	const db = getDb();
	return db.transaction(() => {
		let id = productId;
		if (id === null) {
			const taken = new Set(
				(db.query("SELECT id FROM products").all() as { id: string }[]).map(
					(r) => r.id,
				),
			);
			id = uniqueSlug(slugify(input.title), taken);
			const sort = (
				db
					.query("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM products")
					.get() as {
					n: number;
				}
			).n;
			db.query(
				`INSERT INTO products (id, title, description, base_price_cents, currency, is_visible, sort, created_at, updated_at)
				 VALUES ($id, $title, $description, $price, 'PHP', $visible, $sort, $now, $now)`,
			).run({
				id,
				title: input.title,
				description: input.description,
				price: toCents(input.basePrice),
				visible: input.isVisible ? 1 : 0,
				sort,
				now: nowIso(),
			});
		} else {
			const result = db
				.query(
					`UPDATE products SET title = $title, description = $description, base_price_cents = $price,
					 is_visible = $visible, updated_at = $now WHERE id = $id`,
				)
				.run({
					id,
					title: input.title,
					description: input.description,
					price: toCents(input.basePrice),
					visible: input.isVisible ? 1 : 0,
					now: nowIso(),
				});
			if (result.changes === 0) throw new Error("Product not found");
		}

		const existing = new Set(
			(
				db
					.query("SELECT id FROM variants WHERE product_id = $id")
					.all({ id }) as {
					id: string;
				}[]
			).map((r) => r.id),
		);
		const kept = new Set<string>();
		const taken = new Set(
			input.variants.flatMap((v) => (v.id && existing.has(v.id) ? [v.id] : [])),
		);
		const upsert = db.query(
			`INSERT INTO variants (product_id, id, sku, color_name, color_hex, price_cents, stock_quantity, is_available, images, sort)
			 VALUES ($productId, $id, $sku, $colorName, $colorHex, $price, $stock, $available, $images, $sort)
			 ON CONFLICT (product_id, id) DO UPDATE SET sku = excluded.sku, color_name = excluded.color_name,
			   color_hex = excluded.color_hex, price_cents = excluded.price_cents,
			   stock_quantity = excluded.stock_quantity, is_available = excluded.is_available,
			   images = excluded.images, sort = excluded.sort`,
		);
		input.variants.forEach((variant, index) => {
			const variantId =
				variant.id && existing.has(variant.id)
					? variant.id
					: uniqueSlug(slugify(variant.colorName), taken);
			kept.add(variantId);
			upsert.run({
				productId: id,
				id: variantId,
				sku: variant.sku,
				colorName: variant.colorName,
				colorHex: variant.colorHex,
				price: variant.price === null ? null : toCents(variant.price),
				stock: variant.stockQuantity,
				available: variant.isAvailable ? 1 : 0,
				images: JSON.stringify(variant.images),
				sort: index,
			});
		});
		const remove = db.query(
			"DELETE FROM variants WHERE product_id = $productId AND id = $id",
		);
		for (const variantId of existing) {
			if (!kept.has(variantId)) remove.run({ productId: id, id: variantId });
		}
		return id;
	})();
}

/** Quick inventory edit from the stock table. */
export function updateVariantStock(
	productId: string,
	variantId: string,
	patch: { stockQuantity?: number; isAvailable?: boolean },
) {
	const db = getDb();
	const result = db
		.query(
			`UPDATE variants SET
			   stock_quantity = COALESCE($stock, stock_quantity),
			   is_available = COALESCE($available, is_available)
			 WHERE product_id = $productId AND id = $variantId`,
		)
		.run({
			productId,
			variantId,
			stock: patch.stockQuantity ?? null,
			available:
				patch.isAvailable === undefined ? null : patch.isAvailable ? 1 : 0,
		});
	if (result.changes === 0) throw new Error("Color not found");
	db.query("UPDATE products SET updated_at = $now WHERE id = $id").run({
		id: productId,
		now: nowIso(),
	});
}
