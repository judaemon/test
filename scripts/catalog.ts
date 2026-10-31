/**
 * Copies the catalog in and out of `catalog-snapshot/`, which is committed to git
 * so a fresh install can start with the real shop. `.data/` itself stays out of
 * git: it also holds orders, accounts, login sessions and payment details.
 *
 *   bun run catalog:export           save products, stock and custom bouquet settings
 *   bun run catalog:import           restore them (refuses if the shop has orders)
 *   bun run catalog:import --force   restore anyway; replaces products and stock
 *
 * Orders, accounts and payment settings are never read or changed.
 * Safe to run while the dev server is running.
 */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { getDb } from "~/server/db";

const SNAPSHOT_DIR = "catalog-snapshot";
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, "catalog.json");
const SNAPSHOT_PHOTOS = join(SNAPSHOT_DIR, "photos");
const UPLOAD_PHOTOS = join(process.env.UPLOAD_DIR ?? ".data/uploads", "products");
const SETTINGS_KEY = "custom_bouquet";

type Row = Record<string, string | number | null>;

interface Snapshot {
	products: Row[];
	variants: Row[];
	settings: Row[];
}

function insertRow(table: string, row: Row) {
	const columns = Object.keys(row);
	getDb()
		.query(
			`INSERT INTO ${table} (${columns.join(", ")})
			 VALUES (${columns.map((column) => `$${column}`).join(", ")})`,
		)
		.run(row);
}

async function exportCatalog() {
	const db = getDb();
	const snapshot: Snapshot = {
		products: db.query("SELECT * FROM products ORDER BY sort, id").all() as Row[],
		variants: db
			.query("SELECT * FROM variants ORDER BY product_id, sort, id")
			.all() as Row[],
		settings: db
			.query("SELECT * FROM settings WHERE key = $key")
			.all({ key: SETTINGS_KEY }) as Row[],
	};
	const json = JSON.stringify(snapshot, null, "\t");

	// Only the photos in use; old uploads may still be sitting in the folder.
	const names = new Set(
		[...json.matchAll(/\/uploads\/products\/([a-z0-9-]+)/g)].map(
			(match) => match[1] as string,
		),
	);
	const uploaded = await readdir(UPLOAD_PHOTOS).catch(() => [] as string[]);
	const photos = uploaded.filter((file) => names.has(file.split(".")[0] ?? ""));
	if (photos.length < names.size)
		throw new Error(
			`${names.size - photos.length} photo(s) are missing from ${UPLOAD_PHOTOS}.`,
		);

	await rm(SNAPSHOT_DIR, { recursive: true, force: true });
	await mkdir(SNAPSHOT_PHOTOS, { recursive: true });
	await Bun.write(SNAPSHOT_FILE, `${json}\n`);
	for (const file of photos)
		await copyFile(join(UPLOAD_PHOTOS, file), join(SNAPSHOT_PHOTOS, file));

	console.log(
		`Saved ${snapshot.products.length} products, ${snapshot.variants.length} colors and ${photos.length} photos to ${SNAPSHOT_DIR}/.`,
	);
}

async function importCatalog() {
	const file = Bun.file(SNAPSHOT_FILE);
	if (!(await file.exists()))
		throw new Error(`${SNAPSHOT_FILE} not found. Run catalog:export first.`);
	const snapshot = (await file.json()) as Snapshot;

	const db = getDb();
	const { n: orders } = db.query("SELECT COUNT(*) AS n FROM orders").get() as {
		n: number;
	};
	if (orders > 0 && !process.argv.includes("--force"))
		throw new Error(
			`This shop has ${orders} order(s), so its stock may be newer than the snapshot. Use --force to replace it anyway.`,
		);

	await mkdir(UPLOAD_PHOTOS, { recursive: true });
	const photos = await readdir(SNAPSHOT_PHOTOS);
	for (const photo of photos)
		await copyFile(join(SNAPSHOT_PHOTOS, photo), join(UPLOAD_PHOTOS, photo));

	db.transaction(() => {
		// Variants go with their products (ON DELETE CASCADE).
		db.exec("DELETE FROM products");
		db.query("DELETE FROM settings WHERE key = $key").run({ key: SETTINGS_KEY });
		for (const row of snapshot.products) insertRow("products", row);
		for (const row of snapshot.variants) insertRow("variants", row);
		for (const row of snapshot.settings) insertRow("settings", row);
	})();

	console.log(
		`Restored ${snapshot.products.length} products, ${snapshot.variants.length} colors and ${photos.length} photos.`,
	);
}

const command = process.argv[2];
if (command === "export") await exportCatalog();
else if (command === "import") await importCatalog();
else {
	console.error("Usage: bun scripts/catalog.ts export | import [--force]");
	process.exit(1);
}
