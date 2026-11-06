/**
 * Loads a copy of the live shop into this computer, for testing with real
 * bouquets, flowers, orders and photos.
 *
 *   bun run data:import <file.zip>   load a zip downloaded from Admin → Staff → Download all data
 *   bun run data:pull                download it from the live site and load it (needs PROD_URL
 *                                    and DATA_EXPORT_TOKEN in .env; see .env.example)
 *
 * Stop the dev server first (or use Admin → Staff → Import data while it runs). What's in `.data/` now is moved to
 * `.data-backups/<date-time>/`, never deleted, so you can put it back by hand.
 * Login sessions aren't in the export: sign in again with your own password.
 *
 * Never run this on the live server.
 */
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

import {
	DataImportError,
	type ImportSummary,
	loadDataExport,
} from "~/server/data-import";
const DOWNLOAD_DIR = ".data-imports";

function fail(message: string): never {
	console.error(`\n✗ ${message}\n`);
	process.exit(1);
}

const exists = (path: string) =>
	stat(path).then(
		() => true,
		() => false,
	);

/** Local time, safe in a folder name: 2026-11-05_14-03-22. */
const stamp = () => {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

async function refuseUnsafe() {
	if (process.env.NODE_ENV === "production")
		fail("This replaces the database. It only runs on your own computer, not on the live server.");
	// A running server keeps the old database open and would keep writing to it.
	const port = process.env.PORT ?? "3000";
	const running = await fetch(`http://localhost:${port}/`, {
		signal: AbortSignal.timeout(1500),
	}).then(
		() => true,
		() => false,
	);
	if (running)
		fail(`Something is running on localhost:${port}. Stop the dev server first, then run this again.`);
}

async function importZip(zipPath: string) {
	await refuseUnsafe();
	if (!(await exists(zipPath))) fail(`There's no file at ${zipPath}.`);

	console.log(`Reading ${zipPath}…`);
	let summary: ImportSummary;
	try {
		summary = await loadDataExport(new Uint8Array(await Bun.file(zipPath).arrayBuffer()));
	} catch (error) {
		if (error instanceof DataImportError) fail(error.message);
		throw error;
	}

	const count = (table: string) => summary.rows[table] ?? 0;
	console.log(`
✓ Loaded the live shop as of ${new Date(summary.exportedAt).toLocaleString()}:
    ${count("orders")} orders · ${count("signature_bouquets")} signature bouquets · ${count("bouquet_styles")} styles
    ${count("flowers")} flowers · ${count("wrappers")} wrappers · ${count("user")} accounts · ${summary.uploads} photos and files
${summary.backup ? `  Your previous local data is in ${summary.backup}/.\n` : ""}
  Start the dev server and sign in to /admin with your live-site password.
  Careful: emails and payment proofs here are real customers' data.
`);
}

async function pull() {
	await refuseUnsafe();
	const base = process.env.PROD_URL?.replace(/\/+$/, "");
	const token = process.env.DATA_EXPORT_TOKEN;
	if (!base) fail("Set PROD_URL in .env to the live site, e.g. https://example.com.");
	if (!token || token.length < 32)
		fail("Set DATA_EXPORT_TOKEN in .env (32+ characters), the same one the live server has.");

	console.log(`Downloading from ${base}…`);
	const response = await fetch(`${base}/api/admin/data-export`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (response.status === 403)
		fail("The live site refused the token. Check DATA_EXPORT_TOKEN matches the server's, and that the server has been redeployed since it was set.");
	if (!response.ok) fail(`The live site answered ${response.status} ${response.statusText}.`);

	await mkdir(DOWNLOAD_DIR, { recursive: true });
	const zipPath = join(DOWNLOAD_DIR, `oraia-data-${stamp()}.zip`);
	await Bun.write(zipPath, response);
	console.log(`Saved ${zipPath}.`);
	await importZip(zipPath);
}

const [command, arg] = process.argv.slice(2);
if (command === "import" && arg) await importZip(arg);
else if (command === "pull") await pull();
else
	fail(
		"Usage:\n    bun run data:import <file.zip>\n    bun run data:pull",
	);
