import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
	type CustomWrapper,
	DEFAULT_CUSTOM_SETTINGS,
	flowersFromSettings,
	type LegacyFlowerOption,
} from "~/lib/custom-bouquet";
import {
	BOUQUET_FLOWERS_SQL,
	BOUQUET_TABLES_SQL,
	flowerColorIdFor,
	moveProductsToBouquets,
	moveRecipesToBouquets,
	moveWrappersToStyleList,
	STYLE_WRAPPERS_SQL,
	wrapperIdForName,
} from "./bouquet-tables";
import { seedBouquets, seedPaymentAccounts } from "./seed-data";

// Server-only. Requires the Bun runtime (`bun run dev`, `bun .output/server/index.mjs`).
const DB_PATH = process.env.DATABASE_PATH ?? ".data/oraia.sqlite";

/**
 * Append-only: each entry upgrades the schema by one version. Most are SQL;
 * a function is for steps that need to read JSON first.
 */
const MIGRATIONS: (string | ((db: Database) => void))[] = [
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
	// v17: flowers get their own tables (Admin → Flowers) instead of a list in
	// the builder settings, and each color has its own price and stock. The
	// saved list, or the sample one, moves across with every color at the
	// flower's old price and stock not counted.
	(db) => {
		db.exec(`
			CREATE TABLE flowers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE COLLATE NOCASE,
				counted INTEGER NOT NULL DEFAULT 1,
				hint TEXT NOT NULL DEFAULT '',
				is_enabled INTEGER NOT NULL DEFAULT 1,
				image TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE flower_colors (
				id TEXT PRIMARY KEY,
				flower_id TEXT NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
				name TEXT NOT NULL COLLATE NOCASE,
				price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
				-- NULL means stock isn't counted.
				stock_quantity INTEGER CHECK (stock_quantity >= 0),
				is_enabled INTEGER NOT NULL DEFAULT 1,
				image TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0,
				UNIQUE (flower_id, name)
			);
		`);
		const row = db
			.query("SELECT value FROM settings WHERE key = 'custom_bouquet'")
			.get() as { value: string } | null;
		const saved = row
			? (JSON.parse(row.value) as { flowers?: LegacyFlowerOption[] })
			: {};
		const insertFlower = db.query(
			`INSERT OR IGNORE INTO flowers (id, name, hint, is_enabled, image, sort, created_at, updated_at)
			 VALUES ($id, $name, $hint, $enabled, $image, $sort, $now, $now)`,
		);
		const insertColor = db.query(
			`INSERT OR IGNORE INTO flower_colors (id, flower_id, name, price_cents, is_enabled, image, sort)
			 VALUES ($id, $flowerId, $name, $price, 1, $image, $sort)`,
		);
		flowersFromSettings(saved).forEach((flower, index) => {
			const id = crypto.randomUUID();
			const { changes } = insertFlower.run({
				id,
				name: flower.name,
				hint: flower.kind.hint ?? "",
				enabled: flower.enabled ? 1 : 0,
				image: flower.image ?? "",
				sort: index,
				now: nowIso(),
			});
			if (changes === 0) return;
			flower.colors.forEach((color, sort) => {
				insertColor.run({
					id: crypto.randomUUID(),
					flowerId: id,
					name: color.name,
					price: toCents(color.price),
					image: color.image ?? "",
					sort,
				});
			});
		});
		if (row && "flowers" in saved) {
			delete saved.flowers;
			db.query(
				"UPDATE settings SET value = $value WHERE key = 'custom_bouquet'",
			).run({ value: JSON.stringify(saved) });
		}
	},
	// v18: wrappers get their own table too (Admin → Wrappers). They keep
	// their ids, which orders refer to.
	(db) => {
		db.exec(`
			CREATE TABLE wrappers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				color_hex TEXT NOT NULL,
				price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
				-- NULL means stock isn't counted.
				stock_quantity INTEGER CHECK (stock_quantity >= 0),
				is_enabled INTEGER NOT NULL DEFAULT 1,
				image TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
		const row = db
			.query("SELECT value FROM settings WHERE key = 'custom_bouquet'")
			.get() as { value: string } | null;
		const saved = row
			? (JSON.parse(row.value) as { wrappers?: CustomWrapper[] })
			: {};
		const insert = db.query(
			`INSERT OR IGNORE INTO wrappers (id, name, color_hex, price_cents, stock_quantity, is_enabled, image, sort,
			   created_at, updated_at)
			 VALUES ($id, $name, $colorHex, $price, $stock, $enabled, $image, $sort, $now, $now)`,
		);
		(saved.wrappers ?? DEFAULT_CUSTOM_SETTINGS.wrappers).forEach(
			(wrapper, sort) => {
				insert.run({
					id: wrapper.id,
					name: wrapper.name,
					colorHex: wrapper.colorHex,
					price: toCents(wrapper.price),
					stock: wrapper.stock ?? null,
					enabled: wrapper.enabled ? 1 : 0,
					image: wrapper.image ?? "",
					sort,
					now: nowIso(),
				});
			},
		);
		if (row && "wrappers" in saved) {
			delete saved.wrappers;
			db.query(
				"UPDATE settings SET value = $value WHERE key = 'custom_bouquet'",
			).run({ value: JSON.stringify(saved) });
		}
	},
	// v19: every flower is counted, fillers included; there's no more
	// "added as a cluster". Recipe items without a count get one.
	(db) => {
		db.exec("ALTER TABLE flowers DROP COLUMN counted");
		const rows = db
			.query("SELECT product_id, id, recipe FROM variants")
			.all() as { product_id: string; id: string; recipe: string }[];
		const update = db.query(
			"UPDATE variants SET recipe = $recipe WHERE product_id = $productId AND id = $id",
		);
		for (const row of rows) {
			const recipe = JSON.parse(row.recipe) as { count?: number }[];
			if (recipe.every((item) => item.count)) continue;
			update.run({
				productId: row.product_id,
				id: row.id,
				recipe: JSON.stringify(
					recipe.map((item) => ({ ...item, count: item.count || 1 })),
				),
			});
		}
	},
	// v20: signature bouquets get their own tables. Each style code (a girl's
	// name) becomes a bouquet, and each of its colors one of its styles, with
	// recipes and wrappers linked to the flower and wrapper tables.
	(db) => {
		db.exec(BOUQUET_TABLES_SQL);
		moveProductsToBouquets(db);
	},
	// v21: styles have no stock count, just an "available" switch. One that
	// was sold out becomes unavailable. (Databases that reached v20 after
	// this change never had the column.)
	(db) => {
		const columns = db.query("PRAGMA table_info(bouquet_styles)").all() as {
			name: string;
		}[];
		if (!columns.some((column) => column.name === "stock_quantity")) return;
		db.exec(`
			UPDATE bouquet_styles SET is_available = 0 WHERE stock_quantity <= 0;
			ALTER TABLE bouquet_styles DROP COLUMN stock_quantity;
		`);
	},
	// v22: sizes get their own table (Admin → Sizes), starting with the four
	// from the size guide, each with its figure from the guide picture. A
	// bouquet's size points at one.
	(db) => {
		db.exec(`
			CREATE TABLE sizes (
				-- Stored on bouquets; also the shop's ?size= filter value.
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE COLLATE NOCASE,
				description TEXT NOT NULL DEFAULT '',
				-- Someone holding a bouquet this size, for the size guide.
				image TEXT NOT NULL DEFAULT '',
				-- Smallest first.
				sort INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
		const insert = db.query(
			`INSERT INTO sizes (id, name, description, image, sort, created_at, updated_at)
			 VALUES ($id, $name, $description, $image, $sort, $now, $now)`,
		);
		[
			["petite", "Petite", "Small enough to hold in one hand"],
			["classic", "Classic", "Fits in one arm"],
			["impressive", "Impressive", "A bigger armful"],
			["grand", "Grand", "Covers the upper body"],
		].forEach(([id, name, description], sort) => {
			insert.run({
				id,
				name,
				description,
				image: `/images/sizes/${id}.jpg`,
				sort,
				now: nowIso(),
			});
		});
		db.exec(`
			ALTER TABLE signature_bouquets ADD COLUMN size_id TEXT REFERENCES sizes(id) ON DELETE RESTRICT;
			UPDATE signature_bouquets SET size_id = size WHERE size IN (SELECT id FROM sizes);
			ALTER TABLE signature_bouquets DROP COLUMN size;
		`);
	},
	// v23: cadets give their serial number at checkout (digits only).
	`
	ALTER TABLE orders ADD COLUMN serial_number TEXT NOT NULL DEFAULT '';
	`,
	// v24: staff can mark an order as a test, which leaves it out of reports.
	`
	ALTER TABLE orders ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
	`,
	// v25: wrappers get a stock code; Excel imports overwrite by it.
	`
	ALTER TABLE wrappers ADD COLUMN code TEXT;
	CREATE UNIQUE INDEX wrappers_by_code ON wrappers (code) WHERE code IS NOT NULL;
	`,
	// v26: wrappers keep the actual stock count beside what's on hand.
	`
	ALTER TABLE wrappers ADD COLUMN stock_actual INTEGER CHECK (stock_actual >= 0);
	`,
	// v27: a wrapper can have more than one color.
	`
	ALTER TABLE wrappers ADD COLUMN extra_colors TEXT NOT NULL DEFAULT '[]';
	`,
	// v28: sizes get a price for the bouquet builder. NULL leaves the size out
	// of the builder, so it stays as it was until staff set prices.
	`
	ALTER TABLE sizes ADD COLUMN price_cents INTEGER CHECK (price_cents >= 0);
	`,
	// v29: orders staff add from a chat record what the customer paid so far
	// (a deposit, say). NULL on shop orders, which are paid in full or not at all.
	`
	ALTER TABLE orders ADD COLUMN amount_paid_cents INTEGER CHECK (amount_paid_cents >= 0);
	`,
	// v30: a recipe line can be filler (gypsophila, misty), which isn't counted
	// in the bouquet's number of flowers.
	`
	ALTER TABLE style_flowers ADD COLUMN is_filler INTEGER NOT NULL DEFAULT 0;
	`,
	// v31: styles can have ready-made stock (NULL: made to order, no limit),
	// and take pre-orders once it runs out, with optional slots (NULL: no limit).
	`
	ALTER TABLE bouquet_styles ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity >= 0);
	ALTER TABLE bouquet_styles ADD COLUMN takes_preorders INTEGER NOT NULL DEFAULT 0;
	ALTER TABLE bouquet_styles ADD COLUMN preorder_slots INTEGER CHECK (preorder_slots >= 0);
	`,
	// v32: when a pre-order is ready: a number of days after it's placed, or a
	// set date (YYYY-MM-DD). Both NULL: not said.
	`
	ALTER TABLE bouquet_styles ADD COLUMN preorder_days INTEGER CHECK (preorder_days > 0);
	ALTER TABLE bouquet_styles ADD COLUMN preorder_date TEXT;
	`,
	// v33: a caption staff write for each photo, kept in step with images.
	// Empty means no caption.
	`
	ALTER TABLE bouquet_styles ADD COLUMN image_captions TEXT NOT NULL DEFAULT '[]';
	`,
	// v34: watermarked bouquet photos. Each records the watermark's version
	// (src/lib/watermark.ts); its clean original is kept under uploads/originals.
	// Stamping a photo already in use gives it a new id (photo addresses are
	// cached for good), and its old id redirects to the new one.
	`
	CREATE TABLE photo_watermarks (
		photo_id TEXT PRIMARY KEY,
		version INTEGER NOT NULL,
		created_at TEXT NOT NULL
	);
	CREATE TABLE photo_redirects (
		old_id TEXT PRIMARY KEY,
		new_id TEXT NOT NULL
	);
	`,
	// v35: staff give a reason when cancelling, and can attach a photo. An older
	// cancel_reason with no cancelled_by was written by the shopper.
	`
	ALTER TABLE orders ADD COLUMN cancelled_by TEXT;
	ALTER TABLE orders ADD COLUMN cancel_proof TEXT;
	`,
	// v36: when the shopper last edited their order, so staff can recheck it.
	`
	ALTER TABLE orders ADD COLUMN customer_edited_at TEXT;
	`,
	// v37: bouquets staff cancelled from an order that carries on without them.
	`
	ALTER TABLE orders ADD COLUMN cancelled_bouquets TEXT NOT NULL DEFAULT '[]';
	`,
	// v38: the recipe belongs to the bouquet. A style only keeps flowers of its
	// own when they differ from the bouquet's.
	(db) => {
		db.exec(BOUQUET_FLOWERS_SQL);
		moveRecipesToBouquets(db);
	},
	// v39: cadets can pay cash to 1st Class RICARDE of Foxtrot. A new database
	// gets it from the seed instead, which only runs on an empty table.
	`
	INSERT OR IGNORE INTO payment_accounts (method, enabled, label, sort, updated_at)
	SELECT 'cash', 1, 'Cash - 1st Class RICARDE Foxtrot',
		(SELECT COALESCE(MAX(sort), 0) + 1 FROM payment_accounts), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	WHERE EXISTS (SELECT 1 FROM payment_accounts);
	`,
	// v40: signature bouquets become floral arrangements, each of a type staff
	// manage in Admin → Arrangement types: bouquets, corsages and boutonnières
	// to start. Each size belongs to a type. Corsage and Boutonnière were
	// kept as sizes of bouquets until now: they become the sizes of their own
	// types (keeping their pictures), and what used them takes that type.
	`
	CREATE TABLE arrangement_types (
		-- Stored on arrangements; also the shop's ?type= value.
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL UNIQUE COLLATE NOCASE,
		-- For the shop's tabs, e.g. "Corsages".
		plural_name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		-- The shop's tabs, first one shown by default.
		sort INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	INSERT INTO arrangement_types (id, name, plural_name, description, sort, created_at, updated_at) VALUES
		('bouquet', 'Bouquet', 'Bouquets', 'Held in the hand, in a size from the size guide.', 0,
		 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		('corsage', 'Corsage', 'Corsages', 'A wearable floral piece worn on the wrist.', 1,
		 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		('boutonniere', 'Boutonnière', 'Boutonnières', 'A small lapel accent pinned to the jacket or shirt.', 2,
		 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
	ALTER TABLE signature_bouquets ADD COLUMN arrangement TEXT
		REFERENCES arrangement_types(id) ON DELETE RESTRICT;
	ALTER TABLE sizes ADD COLUMN arrangement TEXT
		REFERENCES arrangement_types(id) ON DELETE RESTRICT;
	UPDATE sizes SET arrangement = CASE
		WHEN id = 'corsage' OR name = 'Corsage' THEN 'corsage'
		WHEN id = 'boutonniere' OR name IN ('Boutonnière', 'Boutonniere') THEN 'boutonniere'
		ELSE 'bouquet' END;
	UPDATE signature_bouquets SET arrangement = COALESCE(
		(SELECT s.arrangement FROM sizes s WHERE s.id = signature_bouquets.size_id),
		'bouquet');
	`,
	// v41: staff can change how an order is paid, giving a reason and
	// optionally a photo. Each change is kept, oldest first.
	`
	ALTER TABLE orders ADD COLUMN payment_method_changes TEXT NOT NULL DEFAULT '[]';
	`,
	// v42: every change to an order, field by field: who made it, when, and
	// from which page. Staff read it on the order and in Admin → Order log.
	`
	CREATE TABLE order_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		order_id TEXT NOT NULL,
		at TEXT NOT NULL,
		-- staff, customer or system
		actor_type TEXT NOT NULL,
		actor_name TEXT NOT NULL,
		actor_id TEXT,
		-- The page's path the change was made from.
		source TEXT,
		action TEXT NOT NULL,
		field TEXT,
		from_value TEXT,
		to_value TEXT,
		-- Which bouquet, for a wrapper.
		about TEXT,
		reason TEXT
	);
	CREATE INDEX order_log_by_order ON order_log (order_id, id);
	CREATE INDEX order_log_by_at ON order_log (at);
	`,
	// v43: sales staff run from Admin → Sales: a percent or an amount off each
	// item, between two Manila days, on everything or on chosen arrangement
	// types, arrangements and custom bouquets. Starts with the owner's 5% off
	// everything until November 9, 2026.
	`
	CREATE TABLE sales (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		-- percent or amount
		kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
		-- Percent off (1-90), or whole pesos off each item.
		value INTEGER NOT NULL CHECK (value > 0),
		-- Manila days, YYYY-MM-DD, both included.
		starts_on TEXT NOT NULL,
		ends_on TEXT NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1,
		-- all or selected
		scope TEXT NOT NULL CHECK (scope IN ('all', 'selected')),
		arrangement_types TEXT NOT NULL DEFAULT '[]',
		products TEXT NOT NULL DEFAULT '[]',
		include_custom INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	INSERT INTO sales (id, name, kind, value, starts_on, ends_on, enabled, scope, created_at, updated_at)
	VALUES ('november-sale-2026', 'November Sale', 'percent', 5, '2026-11-07', '2026-11-09', 1, 'all',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
	`,
	// v44: each payment method can carry a warning shoppers see when they choose
	// it, which staff edit in Admin → Payments; each order keeps the one it was
	// placed with. Cash starts with the owner's "pay before November 10".
	`
	ALTER TABLE payment_accounts ADD COLUMN notice TEXT NOT NULL DEFAULT '';
	UPDATE payment_accounts
	SET notice = 'You are paying in cash. Please pay 1st Class RICARDE (Foxtrot) before November 10.'
	WHERE method = 'cash';
	ALTER TABLE orders ADD COLUMN payment_notice TEXT;
	`,
	// v45: a sale can keep the price and show a higher "before" price instead
	// of lowering it (markup), as marketplace sellers do.
	`
	ALTER TABLE sales ADD COLUMN pricing TEXT NOT NULL DEFAULT 'discount'
		CHECK (pricing IN ('discount', 'markup'));
	`,
	// v46: order promos, counted by serial number: e.g. ₱500 off every 10th
	// order. Set up in Admin → Sales; each order keeps the promo it got.
	// Starts with the owner's 10th Flower Promo.
	`
	CREATE TABLE order_promos (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		-- The reward order: every Nth (repeat) or just the Nth.
		every INTEGER NOT NULL CHECK (every >= 2),
		-- Whole pesos off that order.
		amount INTEGER NOT NULL CHECK (amount > 0),
		repeat INTEGER NOT NULL DEFAULT 1,
		-- Manila days, YYYY-MM-DD; an empty end means it doesn't end.
		starts_on TEXT NOT NULL,
		ends_on TEXT NOT NULL DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 1,
		terms TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	INSERT INTO order_promos (id, name, every, amount, repeat, starts_on, ends_on, enabled, terms, created_at, updated_at)
	VALUES ('tenth-flower-promo', '10th Flower Promo', 10, 500, 1, '2026-11-07', '', 1, '',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
	ALTER TABLE orders ADD COLUMN promo TEXT;
	ALTER TABLE orders ADD COLUMN promo_discount_cents INTEGER NOT NULL DEFAULT 0
		CHECK (promo_discount_cents >= 0);
	CREATE INDEX orders_by_serial ON orders (serial_number);
	`,
	// v47: an order promo can need a minimum order: the reward order's
	// bouquets, after sale prices, must come to more than it. The 10th Flower
	// Promo needs more than ₱500.
	`
	ALTER TABLE order_promos ADD COLUMN min_spend INTEGER NOT NULL DEFAULT 0
		CHECK (min_spend >= 0);
	UPDATE order_promos SET min_spend = 500 WHERE id = 'tenth-flower-promo';
	`,
	// v48: like a sale, an order promo can be on everything or on chosen
	// arrangement types, arrangements and custom bouquets.
	`
	ALTER TABLE order_promos ADD COLUMN scope TEXT NOT NULL DEFAULT 'all'
		CHECK (scope IN ('all', 'selected'));
	ALTER TABLE order_promos ADD COLUMN arrangement_types TEXT NOT NULL DEFAULT '[]';
	ALTER TABLE order_promos ADD COLUMN products TEXT NOT NULL DEFAULT '[]';
	ALTER TABLE order_promos ADD COLUMN include_custom INTEGER NOT NULL DEFAULT 0;
	`,
	// v49: a sale or order promo can be for chosen payment methods only, e.g.
	// GCash. Empty means any method.
	`
	ALTER TABLE sales ADD COLUMN payment_methods TEXT NOT NULL DEFAULT '[]';
	ALTER TABLE order_promos ADD COLUMN payment_methods TEXT NOT NULL DEFAULT '[]';
	`,
	// v50: staff notes on an order, never shown to the customer: who wrote
	// each one, and when.
	`
	CREATE TABLE order_notes (
		id TEXT PRIMARY KEY,
		order_id TEXT NOT NULL,
		body TEXT NOT NULL,
		author_id TEXT NOT NULL,
		author_name TEXT NOT NULL,
		created_at TEXT NOT NULL,
		-- Set when the author changed it.
		edited_at TEXT
	);
	CREATE INDEX order_notes_by_order ON order_notes (order_id, created_at);
	`,
	// v51: a signature bouquet's style can be wrapped in several wrappers at
	// once, e.g. a red sheet over a gold one. Each style's one wrapper becomes
	// the first on its list.
	(db) => {
		db.exec(STYLE_WRAPPERS_SQL);
		moveWrappersToStyleList(db);
	},
];

declare global {
	// Survives Vite HMR so dev reloads don't open a new connection each time.
	var __oraiaDb: Database | undefined;
}

/** Whether this copy of the module has checked the database is up to date. */
let migrated = false;

export function getDb(): Database {
	if (globalThis.__oraiaDb) {
		// HMR keeps the connection, but this file may have brought a new migration.
		if (!migrated) migrate(globalThis.__oraiaDb);
		migrated = true;
		return globalThis.__oraiaDb;
	}
	mkdirSync(dirname(DB_PATH), { recursive: true });
	const db = new Database(DB_PATH, { create: true, strict: true });
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA busy_timeout = 5000");
	migrate(db);
	migrated = true;
	seedStarterData(db);
	globalThis.__oraiaDb = db;
	return db;
}

/**
 * Closes the database so its files can be replaced (Admin → Staff → Import
 * data). The next `getDb()` opens whatever is at DATABASE_PATH by then.
 */
export function closeDb() {
	globalThis.__oraiaDb?.close();
	globalThis.__oraiaDb = undefined;
	migrated = false;
}

/**
 * The database for code that keeps hold of it, like better-auth: always the
 * connection that's open now, even after an import replaced it.
 */
export function liveDb(): Database {
	return new Proxy(getDb(), {
		get(_target, prop) {
			const db = getDb();
			const value = Reflect.get(db, prop, db);
			return typeof value === "function" ? value.bind(db) : value;
		},
	});
}

/** The schema version this code migrates databases up to. */
export const SCHEMA_VERSION = MIGRATIONS.length;

function migrate(db: Database) {
	const { user_version: version } = db.query("PRAGMA user_version").get() as {
		user_version: number;
	};
	for (let next = version; next < MIGRATIONS.length; next++) {
		db.transaction(() => {
			const step = MIGRATIONS[next];
			if (typeof step === "function") step(db);
			else db.exec(step as string);
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

	if (count("signature_bouquets") === 0) {
		const insertBouquet = db.query(
			`INSERT INTO signature_bouquets (id, name, description, size_id, is_visible, sort, created_at, updated_at)
			 VALUES ($id, $name, $description, $size, $visible, $sort, $now, $now)`,
		);
		const insertStyle = db.query(
			`INSERT INTO bouquet_styles (id, bouquet_id, slug, name, color_hex, price_cents, is_available,
			   images, wrapper_id, sort)
			 VALUES ($id, $bouquetId, $slug, $name, $colorHex, $price, $available, $images, $wrapperId, $sort)`,
		);
		const insertWrapper = db.query(
			`INSERT INTO style_wrappers (style_id, wrapper_id, sort)
			 VALUES ($styleId, $wrapperId, 0)`,
		);
		const insertFlower = db.query(
			`INSERT INTO style_flowers (style_id, flower_color_id, count, sort)
			 VALUES ($styleId, $colorId, $count, $sort)`,
		);
		db.transaction(() => {
			seedBouquets.forEach((bouquet, bouquetIndex) => {
				insertBouquet.run({
					id: bouquet.id,
					name: bouquet.name,
					description: bouquet.description,
					size: bouquet.size || null,
					visible: bouquet.isVisible ? 1 : 0,
					sort: bouquetIndex,
					now: nowIso(),
				});
				bouquet.styles.forEach((style, index) => {
					const styleId = crypto.randomUUID();
					const wrapperId = wrapperIdForName(db, style.wrapper);
					insertStyle.run({
						id: styleId,
						bouquetId: bouquet.id,
						slug: style.slug,
						name: style.name,
						colorHex: style.colorHex,
						price: toCents(style.price),
						available: style.isAvailable ? 1 : 0,
						images: JSON.stringify(style.images),
						wrapperId,
						sort: index,
					});
					if (wrapperId) insertWrapper.run({ styleId, wrapperId });
					style.recipe.forEach((item, sort) => {
						insertFlower.run({
							styleId,
							colorId: flowerColorIdFor(db, item.flower, item.color),
							count: item.count ?? 1,
							sort,
						});
					});
				});
			});
			moveRecipesToBouquets(db);
		})();
	}

	if (count("payment_accounts") === 0) {
		const insert = db.query(
			`INSERT INTO payment_accounts (method, enabled, label, account_name, account_number, bank_name, qr_image, steps, notice, sort, updated_at)
			 VALUES ($method, $enabled, $label, $accountName, $accountNumber, $bankName, $qrImage, $steps, $notice, $sort, $now)`,
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
					notice: account.notice,
					sort: index,
					now: nowIso(),
				});
			});
		})();
	}

	// Starter bouquets and sizes, and catalogs restored from older snapshots,
	// come without a type: they're bouquets.
	db.exec(`
		UPDATE sizes SET arrangement = 'bouquet' WHERE arrangement IS NULL;
		UPDATE signature_bouquets SET arrangement = 'bouquet' WHERE arrangement IS NULL;
	`);
}
