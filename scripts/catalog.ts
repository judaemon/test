/**
 * Copies the catalog in and out of `catalog-snapshot/`, which is committed to git
 * so a fresh install can start with the real shop. `.data/` itself stays out of
 * git: it also holds orders, accounts, login sessions and payment details.
 *
 *   bun run catalog:export           save signature bouquets, flowers, wrappers and custom bouquet settings
 *   bun run catalog:import           restore them (refuses if the shop has orders)
 *   bun run catalog:import --force   restore anyway; replaces bouquets and stock
 *
 * `catalog.json` is what the import reads. `products.json` and
 * `custom-bouquets.json` are the same data laid out to read (bouquet, then
 * style), with each photo pointing at its file in `photos/`. Snapshots taken
 * before bouquets, flowers and wrappers had their own tables still import.
 *
 * Orders, accounts and payment settings are never read or changed.
 * Safe to run while the dev server is running.
 */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { flowersFromSettings } from "~/lib/custom-bouquet";
import {
	LEGACY_CATALOG_SQL,
	moveProductsToBouquets,
} from "~/server/bouquet-tables";
import { getDb } from "~/server/db";
import { replaceFlowers } from "~/server/flowers-repo";
import { replaceWrappers } from "~/server/wrappers-repo";

const SNAPSHOT_DIR = "catalog-snapshot";
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, "catalog.json");
const SNAPSHOT_PHOTOS = join(SNAPSHOT_DIR, "photos");
const UPLOAD_PHOTOS = join(process.env.UPLOAD_DIR ?? ".data/uploads", "products");
const SETTINGS_KEY = "custom_bouquet";

type Row = Record<string, string | number | null>;

interface Snapshot {
	settings: Row[];
	signature_bouquets?: Row[];
	bouquet_styles?: Row[];
	style_flowers?: Row[];
	bouquet_redirects?: Row[];
	/** Snapshots from before signature bouquets had their own tables. */
	products?: Row[];
	variants?: Row[];
	/** Missing from snapshots taken before flowers and wrappers had tables. */
	flowers?: Row[];
	flower_colors?: Row[];
	wrappers?: Row[];
}

/** Tables the export saves, in an order that inserts cleanly. */
const TABLES = [
	"flowers",
	"flower_colors",
	"wrappers",
	"signature_bouquets",
	"bouquet_styles",
	"style_flowers",
	"bouquet_redirects",
] as const;

function insertRow(table: string, row: Row) {
	const columns = Object.keys(row);
	getDb()
		.query(
			`INSERT INTO ${table} (${columns.join(", ")})
			 VALUES (${columns.map((column) => `$${column}`).join(", ")})`,
		)
		.run(row);
}

/** The same catalog laid out for people, not for the import. */
async function writeReadableFiles(snapshot: Snapshot, photos: string[]) {
	const photoPath = (url: unknown) => {
		const name = /\/uploads\/products\/([a-z0-9-]+)/.exec(String(url))?.[1];
		const file = photos.find((photo) => photo.split(".")[0] === name);
		return file ? `photos/${file}` : url ? String(url) : null;
	};

	const byId = (rows: Row[] | undefined) =>
		new Map((rows ?? []).map((row) => [row.id, row]));
	const flowerColors = byId(snapshot.flower_colors);
	const flowers = byId(snapshot.flowers);
	const wrappers = byId(snapshot.wrappers);
	const products = (snapshot.signature_bouquets ?? []).map((bouquet) => ({
		bouquet: bouquet.name,
		link: `/products/${bouquet.id}`,
		description: bouquet.description,
		size: bouquet.size || null,
		shownInShop: bouquet.is_visible === 1,
		styles: (snapshot.bouquet_styles ?? [])
			.filter((style) => style.bouquet_id === bouquet.id)
			.map((style) => ({
				style: style.name,
				swatches: [style.color_hex, style.color_hex2].filter(Boolean),
				price: Number(style.price_cents) / 100,
				available: style.is_available === 1,
				recipe: (snapshot.style_flowers ?? [])
					.filter((item) => item.style_id === style.id)
					.map((item) => {
						const color = flowerColors.get(item.flower_color_id);
						return {
							flower: flowers.get(color?.flower_id ?? null)?.name ?? null,
							color: color?.name ?? null,
							count: item.count,
						};
					}),
				wrapper: wrappers.get(style.wrapper_id)?.name ?? null,
				aiPhotoNote: style.ai_photos === 1,
				photos: (JSON.parse(String(style.images)) as string[]).map(photoPath),
			})),
	}));
	await Bun.write(
		join(SNAPSHOT_DIR, "products.json"),
		`${JSON.stringify(products, null, "\t")}\n`,
	);

	const value = snapshot.settings[0]?.value;
	if (!value) return;
	const custom = JSON.parse(String(value));
	await Bun.write(
		join(SNAPSHOT_DIR, "custom-bouquets.json"),
		`${JSON.stringify(
			{
				builderShownInShop: custom.enabled,
				baseFee: custom.baseFee,
				flowers: (snapshot.flowers ?? []).map((flower) => ({
					flower: flower.name,
					offered: flower.is_enabled === 1,
					note: flower.hint || null,
					photo: flower.image ? photoPath(flower.image) : null,
					colors: (snapshot.flower_colors ?? [])
						.filter((color) => color.flower_id === flower.id)
						.map((color) => ({
							color: color.name,
							price: Number(color.price_cents) / 100,
							stock: color.stock_quantity,
							offered: color.is_enabled === 1,
							photo: color.image ? photoPath(color.image) : null,
						})),
				})),
				wrappers: (snapshot.wrappers ?? []).map((wrapper) => ({
					wrapper: wrapper.name,
					color: wrapper.color_hex,
					offered: wrapper.is_enabled === 1,
					price: Number(wrapper.price_cents) / 100,
					stock: wrapper.stock_quantity,
					photo: wrapper.image ? photoPath(wrapper.image) : null,
				})),
				moneyBouquets: custom.money,
			},
			null,
			"\t",
		)}\n`,
	);
}

async function exportCatalog() {
	const db = getDb();
	const snapshot: Snapshot = {
		settings: db
			.query("SELECT * FROM settings WHERE key = $key")
			.all({ key: SETTINGS_KEY }) as Row[],
	};
	for (const table of TABLES)
		snapshot[table] = db
			.query(`SELECT * FROM ${table} ORDER BY rowid`)
			.all() as Row[];
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
	await writeReadableFiles(snapshot, photos);

	console.log(
		`Saved ${snapshot.signature_bouquets?.length} bouquets, ${snapshot.bouquet_styles?.length} styles and ${photos.length} photos to ${SNAPSHOT_DIR}/.`,
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
		// Styles, recipes and redirects go with their bouquets (ON DELETE
		// CASCADE); then nothing uses the flowers and wrappers any more.
		db.exec("DELETE FROM signature_bouquets");
		db.query("DELETE FROM settings WHERE key = $key").run({ key: SETTINGS_KEY });
		for (const row of snapshot.settings) insertRow("settings", row);
		const saved = JSON.parse(String(snapshot.settings[0]?.value ?? "{}"));

		if (snapshot.flowers) {
			db.exec("DELETE FROM flowers");
			db.exec("DELETE FROM wrappers");
			// Snapshots from before every flower was counted have this column.
			for (const { counted: _counted, ...row } of snapshot.flowers)
				insertRow("flowers", row);
			for (const row of snapshot.flower_colors ?? [])
				insertRow("flower_colors", row);
			for (const row of snapshot.wrappers ?? []) insertRow("wrappers", row);
		} else {
			// An older snapshot keeps flowers and wrappers in the settings.
			replaceFlowers(flowersFromSettings(saved));
			if (saved.wrappers) replaceWrappers(saved.wrappers);
		}
		if (saved.flowers || saved.wrappers) {
			delete saved.flowers;
			delete saved.wrappers;
			db.query("UPDATE settings SET value = $value WHERE key = $key").run({
				key: SETTINGS_KEY,
				value: JSON.stringify(saved),
			});
		}

		if (snapshot.signature_bouquets) {
			for (const table of TABLES.slice(3))
				for (const row of snapshot[table] ?? []) insertRow(table, row);
		} else {
			// An older snapshot has products and their colors: load them into
			// the old tables and move them across, as the migration does.
			db.exec(LEGACY_CATALOG_SQL);
			for (const row of snapshot.products ?? []) insertRow("products", row);
			for (const row of snapshot.variants ?? []) insertRow("variants", row);
			moveProductsToBouquets(db);
		}
	})();

	const count = (table: string) =>
		(db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
	console.log(
		`Restored ${count("signature_bouquets")} bouquets, ${count("bouquet_styles")} styles, ${count("flowers")} flowers and ${photos.length} photos.`,
	);
}

const command = process.argv[2];
if (command === "export") await exportCatalog();
else if (command === "import") await importCatalog();
else {
	console.error("Usage: bun scripts/catalog.ts export | import [--force]");
	process.exit(1);
}
