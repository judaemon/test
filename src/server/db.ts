import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { seedPaymentAccounts, seedProducts } from "./seed-data";

// Server-only. Requires the Bun runtime (`bun run dev`, `bun .output/server/index.mjs`).
const DB_PATH = process.env.DATABASE_PATH ?? ".data/oraia.sqlite";

/** Append-only: each entry upgrades the schema by one version. */
const MIGRATIONS = [
	`
	CREATE TABLE products (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		base_price_cents INTEGER NOT NULL,
		currency TEXT NOT NULL DEFAULT 'PHP',
		is_visible INTEGER NOT NULL DEFAULT 1,
		sort INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE variants (
		product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
		id TEXT NOT NULL,
		sku TEXT NOT NULL,
		color_name TEXT NOT NULL,
		color_hex TEXT,
		swatch_image TEXT,
		price_cents INTEGER,
		stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
		is_available INTEGER NOT NULL DEFAULT 1,
		images TEXT NOT NULL DEFAULT '[]',
		sort INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (product_id, id)
	);
	CREATE TABLE orders (
		id TEXT PRIMARY KEY,
		number TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL,
		stage TEXT NOT NULL DEFAULT 'new',
		stage_updated_at TEXT NOT NULL,
		email TEXT NOT NULL,
		phone TEXT NOT NULL,
		recipient_name TEXT NOT NULL,
		address TEXT NOT NULL,
		city TEXT NOT NULL,
		postal_code TEXT NOT NULL,
		delivery_date TEXT NOT NULL,
		delivery_slot TEXT NOT NULL,
		gift_message TEXT NOT NULL DEFAULT '',
		lines TEXT NOT NULL,
		subtotal_cents INTEGER NOT NULL,
		delivery_fee_cents INTEGER NOT NULL,
		total_cents INTEGER NOT NULL,
		currency TEXT NOT NULL,
		payment_method TEXT NOT NULL,
		payment_status TEXT NOT NULL,
		reference_number TEXT,
		proof_file TEXT,
		card_brand TEXT,
		card_last4 TEXT,
		payment_reviewed_by TEXT,
		payment_reviewed_at TEXT
	);
	CREATE INDEX orders_by_delivery ON orders (delivery_date, delivery_slot);
	CREATE INDEX orders_by_stage ON orders (stage);
	CREATE TABLE payment_accounts (
		method TEXT PRIMARY KEY,
		enabled INTEGER NOT NULL DEFAULT 1,
		label TEXT NOT NULL,
		account_name TEXT NOT NULL DEFAULT '',
		account_number TEXT NOT NULL DEFAULT '',
		bank_name TEXT NOT NULL DEFAULT '',
		qr_image TEXT NOT NULL DEFAULT '',
		steps TEXT NOT NULL DEFAULT '[]',
		sort INTEGER NOT NULL DEFAULT 0,
		updated_at TEXT NOT NULL
	);
	`,
	// v2: customer accounts, order tracking, saved addresses and occasions.
	`
	ALTER TABLE orders ADD COLUMN customer_id TEXT;
	ALTER TABLE orders ADD COLUMN rider_name TEXT;
	ALTER TABLE orders ADD COLUMN rider_phone TEXT;
	ALTER TABLE orders ADD COLUMN delivery_photo TEXT;
	ALTER TABLE orders ADD COLUMN delivered_at TEXT;
	CREATE INDEX orders_by_customer ON orders (customer_id, created_at);
	CREATE TABLE order_events (
		order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
		stage TEXT NOT NULL,
		at TEXT NOT NULL
	);
	CREATE INDEX order_events_by_order ON order_events (order_id, at);
	INSERT INTO order_events (order_id, stage, at) SELECT id, 'new', created_at FROM orders;
	INSERT INTO order_events (order_id, stage, at)
		SELECT id, stage, stage_updated_at FROM orders WHERE stage != 'new';
	CREATE TABLE customer_addresses (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		label TEXT NOT NULL,
		recipient_name TEXT NOT NULL,
		address TEXT NOT NULL,
		city TEXT NOT NULL,
		postal_code TEXT NOT NULL,
		is_default INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX customer_addresses_by_user ON customer_addresses (user_id);
	CREATE TABLE customer_occasions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		title TEXT NOT NULL,
		month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
		day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
		note TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL
	);
	CREATE INDEX customer_occasions_by_user ON customer_occasions (user_id);
	`,
	// v3: checkout asks for name, company and class plus an optional dedication
	// instead of a delivery address and time. The old columns stay for history.
	// Payments move to the shop's Maribank and GCash accounts only.
	`
	ALTER TABLE orders ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN company TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN class_name TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN notes TEXT NOT NULL DEFAULT '';
	ALTER TABLE orders ADD COLUMN dedication_for TEXT NOT NULL DEFAULT '';
	UPDATE orders SET full_name = recipient_name,
		dedication_for = CASE WHEN gift_message != '' THEN recipient_name ELSE '' END;
	CREATE INDEX orders_by_created ON orders (created_at);
	UPDATE payment_accounts SET enabled = 0 WHERE method IN ('card', 'maya');
	UPDATE payment_accounts SET enabled = 1, sort = 0, label = 'Bank transfer',
		bank_name = 'Maribank', account_name = 'Lennie Lou Judaya',
		account_number = '11114626063', qr_image = '',
		steps = '["Open your banking app and transfer to the Maribank account below.","Send the exact amount, then screenshot the confirmation."]'
		WHERE method = 'bank';
	UPDATE payment_accounts SET enabled = 1, sort = 1, label = 'GCash',
		account_name = 'Lennie Lou Judaya', account_number = '0976 037 6638',
		qr_image = '',
		steps = '["Open GCash and tap Send Money.","Send to the GCash number below.","Pay the exact amount, then screenshot the receipt."]'
		WHERE method = 'gcash';
	`,
	// v4: checkout no longer takes a payment screenshot, only the reference number.
	`
	UPDATE payment_accounts SET steps = replace(replace(steps,
		'then screenshot the confirmation.', 'then enter the reference number below.'),
		'then screenshot the receipt.', 'then enter the reference number below.');
	`,
	// v5: orders are numbered #1, #2, … in the order they were placed.
	`
	UPDATE orders SET number = (
		SELECT COUNT(*) FROM orders AS earlier
		WHERE earlier.created_at < orders.created_at
		   OR (earlier.created_at = orders.created_at AND earlier.id <= orders.id)
	);
	`,
	// v6: each bouquet color has a recipe (flowers and counts) and a wrapper color.
	`
	ALTER TABLE variants ADD COLUMN recipe TEXT NOT NULL DEFAULT '[]';
	ALTER TABLE variants ADD COLUMN wrapper_color TEXT NOT NULL DEFAULT '';
	`,
	// v7: flower codes are girls' names. Renames the starter codes; anything
	// staff already changed is left alone.
	`
	UPDATE variants SET sku = CASE sku
		WHEN 'BQ-ROSE-18-RED' THEN 'Scarlett'
		WHEN 'BQ-ROSE-18-PNK' THEN 'Rosie'
		WHEN 'BQ-ROSE-18-CRM' THEN 'Bianca'
		WHEN 'BQ-ROSE-18-CRL' THEN 'Coral'
		WHEN 'ORA-POSY-BLUSH' THEN 'Bella'
		WHEN 'ORA-POSY-RUBY' THEN 'Ruby'
		WHEN 'ORA-BOX-IVORY' THEN 'Ivy'
		ELSE sku END;
	`,
	// v8: the "On the delivery bike" stage is gone. Orders that were in it go
	// back to "Being made" so staff can mark them done themselves.
	`
	UPDATE orders SET stage = 'making' WHERE stage = 'delivering';
	`,
	// v9: a size-reference photo per product (someone holding the bouquet) and
	// the holder's height, shown so shoppers can judge the size.
	`
	ALTER TABLE products ADD COLUMN size_reference_image TEXT NOT NULL DEFAULT '';
	ALTER TABLE products ADD COLUMN holder_height_cm INTEGER;
	UPDATE products SET size_reference_image = '/images/bouquets/size-reference.svg',
		holder_height_cm = 165 WHERE id = 'signature-rose-bouquet';
	`,
	// v10: shop-wide settings stored as JSON, starting with the bouquet builder.
	`
	CREATE TABLE settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	`,
	// v11: a size from the size guide (petite, classic, impressive, grand)
	// replaces the size-reference photo and holder height, which go unused.
	`
	ALTER TABLE products ADD COLUMN size TEXT NOT NULL DEFAULT '';
	UPDATE products SET size = 'classic' WHERE id = 'signature-rose-bouquet';
	`,
	// v12: two-color choices (a second swatch color) and why a shopper
	// cancelled their own order.
	`
	ALTER TABLE variants ADD COLUMN color_hex2 TEXT;
	ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
	`,
	// v13: what each bouquet photo shows (front, side, top, size reference),
	// tagged by staff. Empty means "by position", as before.
	`
	ALTER TABLE variants ADD COLUMN image_tags TEXT NOT NULL DEFAULT '[]';
	`,
	// v14: the size moves from the product to each color, which starts with
	// its product's size. products.size stays but is no longer used.
	`
	ALTER TABLE variants ADD COLUMN size TEXT NOT NULL DEFAULT '';
	UPDATE variants SET size = (SELECT size FROM products WHERE products.id = variants.product_id);
	`,
	// v15: every color has its own price; colors that used the product price
	// get it written in. products.base_price_cents becomes the cheapest color.
	`
	UPDATE variants SET price_cents = (SELECT base_price_cents FROM products WHERE products.id = variants.product_id)
	 WHERE price_cents IS NULL;
	UPDATE products SET base_price_cents = (SELECT MIN(price_cents) FROM variants WHERE variants.product_id = products.id)
	 WHERE EXISTS (SELECT 1 FROM variants WHERE variants.product_id = products.id);
	`,
	// v16: whether a color's photos have AI-enhanced backgrounds. Most do, so it
	// starts on; staff switch it off for colors with untouched photos.
	`
	ALTER TABLE variants ADD COLUMN ai_photos INTEGER NOT NULL DEFAULT 1;
	`,
];

declare global {
	// Survives Vite HMR so dev reloads don't open a new connection each time.
	var __oraiaDb: Database | undefined;
}

export function getDb(): Database {
	if (globalThis.__oraiaDb) return globalThis.__oraiaDb;
	mkdirSync(dirname(DB_PATH), { recursive: true });
	const db = new Database(DB_PATH, { create: true, strict: true });
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA busy_timeout = 5000");
	migrate(db);
	seedStarterData(db);
	globalThis.__oraiaDb = db;
	return db;
}

function migrate(db: Database) {
	const { user_version: version } = db.query("PRAGMA user_version").get() as {
		user_version: number;
	};
	for (let next = version; next < MIGRATIONS.length; next++) {
		db.transaction(() => {
			db.exec(MIGRATIONS[next] as string);
			db.exec(`PRAGMA user_version = ${next + 1}`);
		})();
	}
}

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;
export const nowIso = () => new Date().toISOString();

/** Starter catalog and payment accounts; only fills tables that are empty. */
export function seedStarterData(db: Database) {
	const count = (table: string) =>
		(db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

	if (count("products") === 0) {
		const insertProduct = db.query(
			`INSERT INTO products (id, title, description, base_price_cents, currency, is_visible, size, sort,
			   created_at, updated_at)
			 VALUES ($id, $title, $description, $price, $currency, $visible, $size, $sort, $now, $now)`,
		);
		const insertVariant = db.query(
			`INSERT INTO variants (product_id, id, sku, color_name, color_hex, price_cents, stock_quantity, is_available,
			   images, recipe, wrapper_color, size, sort)
			 VALUES ($productId, $id, $sku, $colorName, $colorHex, $price, $stock, $available, $images, $recipe,
			   $wrapperColor, $size, $sort)`,
		);
		db.transaction(() => {
			seedProducts.forEach((product, productIndex) => {
				insertProduct.run({
					id: product.id,
					title: product.title,
					description: product.description,
					price: toCents(product.basePrice),
					currency: product.currency,
					visible: product.isVisible ? 1 : 0,
					// Sizes are set per color now.
					size: "",
					sort: productIndex,
					now: nowIso(),
				});
				product.variants.forEach((variant, index) => {
					insertVariant.run({
						productId: product.id,
						id: variant.id,
						sku: variant.sku,
						colorName: variant.colorName,
						colorHex: variant.colorHex ?? null,
						price: toCents(variant.price ?? product.basePrice),
						stock: variant.stockQuantity,
						available: variant.isAvailable ? 1 : 0,
						images: JSON.stringify(variant.images),
						recipe: JSON.stringify(variant.recipe),
						wrapperColor: variant.wrapperColor,
						size: variant.size ?? "",
						sort: index,
					});
				});
			});
		})();
	}

	if (count("payment_accounts") === 0) {
		const insert = db.query(
			`INSERT INTO payment_accounts (method, enabled, label, account_name, account_number, bank_name, qr_image, steps, sort, updated_at)
			 VALUES ($method, $enabled, $label, $accountName, $accountNumber, $bankName, $qrImage, $steps, $sort, $now)`,
		);
		db.transaction(() => {
			seedPaymentAccounts.forEach((account, index) => {
				insert.run({
					method: account.method,
					enabled: account.enabled ? 1 : 0,
					label: account.label,
					accountName: account.accountName,
					accountNumber: account.accountNumber,
					bankName: account.bankName,
					qrImage: account.qrImage,
					steps: JSON.stringify(account.steps),
					sort: index,
					now: nowIso(),
				});
			});
		})();
	}
}
