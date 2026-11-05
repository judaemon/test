import { Database } from "bun:sqlite";
import { timingSafeEqual } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Zip, ZipPassThrough } from "fflate";

import { getDb } from "./db";

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? ".data/uploads";

/**
 * Tables left out of the copy: login sessions and one-time codes. They'd let
 * whoever holds the file act as a signed-in shopper or staff member on the
 * live site. Accounts stay, so you can sign in locally with your own password.
 */
const STRIPPED_TABLES = ["session", "verification"];

/** Where each part lives inside the zip; `scripts/data.ts` reads the same. */
export const EXPORT_LAYOUT = {
	database: "oraia.sqlite",
	uploads: "uploads/",
	manifest: "manifest.json",
} as const;

export interface ExportManifest {
	exportedAt: string;
	/** `PRAGMA user_version`: how far the database's migrations have run. */
	schemaVersion: number;
	rows: Record<string, number>;
	uploads: number;
	stripped: string[];
}

/**
 * Whether the request carries the export token (`DATA_EXPORT_TOKEN`), for
 * `bun run data:pull`. Off unless the server has a token of 32+ characters.
 */
export function hasExportToken(request: Request) {
	const token = process.env.DATA_EXPORT_TOKEN ?? "";
	if (token.length < 32) return false;
	const sent = request.headers.get("authorization")?.replace(/^Bearer /, "");
	if (!sent) return false;
	const a = Buffer.from(sent);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** A consistent copy of the live database, without sessions. */
async function snapshotDatabase() {
	const path = join(tmpdir(), `oraia-export-${crypto.randomUUID()}.sqlite`);
	try {
		// One transaction-consistent copy, even while orders keep coming in.
		getDb().query("VACUUM INTO $path").run({ path });
		const copy = new Database(path, { strict: true });
		let rows: Record<string, number>;
		let schemaVersion: number;
		try {
			for (const table of STRIPPED_TABLES) {
				const exists = copy
					.query(
						"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $table",
					)
					.get({ table });
				if (exists) copy.exec(`DELETE FROM "${table}"`);
			}
			const tables = copy
				.query(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
				)
				.all() as { name: string }[];
			rows = Object.fromEntries(
				tables.map(({ name }) => [
					name,
					(
						copy.query(`SELECT COUNT(*) AS n FROM "${name}"`).get() as {
							n: number;
						}
					).n,
				]),
			);
			schemaVersion = (
				copy.query("PRAGMA user_version").get() as { user_version: number }
			).user_version;
			// Reclaims the space the removed sessions took.
			copy.exec("VACUUM");
		} finally {
			copy.close();
		}
		return { bytes: new Uint8Array(await readFile(path)), rows, schemaVersion };
	} finally {
		await rm(path, { force: true });
	}
}

async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return listFiles(path);
			return entry.isFile() ? [path] : [];
		}),
	);
	return files.flat();
}

/**
 * Everything the shop holds, as a zip streamed out a file at a time: the
 * database, every upload (bouquet and flower photos, payment proofs, delivery
 * photos, originals and backups) and a manifest of what's inside.
 */
export async function streamDataExport(): Promise<ReadableStream<Uint8Array>> {
	const database = await snapshotDatabase();
	const uploads = await listFiles(UPLOAD_ROOT);
	const manifest: ExportManifest = {
		exportedAt: new Date().toISOString(),
		schemaVersion: database.schemaVersion,
		rows: database.rows,
		uploads: uploads.length,
		stripped: STRIPPED_TABLES,
	};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			const zip = new Zip((error, chunk, final) => {
				if (error) return controller.error(error);
				controller.enqueue(chunk);
				if (final) controller.close();
			});
			// Photos are already compressed; storing them is as small and far faster.
			const add = (name: string, bytes: Uint8Array) => {
				const entry = new ZipPassThrough(name);
				zip.add(entry);
				entry.push(bytes, true);
			};
			(async () => {
				add(
					EXPORT_LAYOUT.manifest,
					new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
				);
				add(EXPORT_LAYOUT.database, database.bytes);
				for (const path of uploads) {
					const name = relative(UPLOAD_ROOT, path).split("\\").join("/");
					add(`${EXPORT_LAYOUT.uploads}${name}`, await readFile(path));
				}
				zip.end();
			})().catch((error) => controller.error(error));
		},
	});
}
