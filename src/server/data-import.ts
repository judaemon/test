import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";

import { EXPORT_LAYOUT, type ExportManifest } from "./data-export";
import { SCHEMA_VERSION } from "./db";

const DB_PATH = process.env.DATABASE_PATH ?? ".data/oraia.sqlite";
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? ".data/uploads";
const BACKUP_ROOT = ".data-backups";

/** A zip that can't be loaded; the message is safe to show. */
export class DataImportError extends Error {}

/** Never on the live server: an import replaces the whole shop. */
export const dataImportAllowed = () => process.env.NODE_ENV !== "production";

export interface ImportSummary {
	exportedAt: string;
	rows: Record<string, number>;
	uploads: number;
	/** Where the data that was here before went, if there was any. */
	backup?: string;
}

/** Local time, safe in a folder name: 2026-11-05_14-03-22. */
const stamp = () => {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

const exists = (path: string) =>
	stat(path).then(
		() => true,
		() => false,
	);

/**
 * Loads a zip from Admin → Staff → Download all data in place of this
 * computer's shop. What's in `.data/` now moves to `.data-backups/<date-time>/`,
 * never deleted. Close the database in `beforeReplace` if it's open.
 */
export async function loadDataExport(
	zip: Uint8Array,
	/** Runs once the zip checks out, just before the files are replaced. */
	beforeReplace?: () => void,
): Promise<ImportSummary> {
	if (!dataImportAllowed())
		throw new DataImportError(
			"Importing replaces the whole shop, so it only works on your own computer.",
		);
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(zip);
	} catch {
		throw new DataImportError("That file isn't a zip.");
	}
	const database = files[EXPORT_LAYOUT.database];
	const manifestBytes = files[EXPORT_LAYOUT.manifest];
	if (!database || !manifestBytes)
		throw new DataImportError(
			"That zip isn't a shop data export (no database or manifest inside).",
		);
	const manifest = JSON.parse(
		new TextDecoder().decode(manifestBytes),
	) as ExportManifest;
	if (manifest.schemaVersion > SCHEMA_VERSION)
		throw new DataImportError(
			`The live database is newer than this code (schema ${manifest.schemaVersion}, code knows ${SCHEMA_VERSION}). Pull the latest code first.`,
		);

	beforeReplace?.();
	// Keep what's here now, in case it's wanted back.
	const backup = join(BACKUP_ROOT, stamp());
	let backedUp = false;
	const moves: [string, string][] = [
		[DB_PATH, basename(DB_PATH)],
		[`${DB_PATH}-wal`, `${basename(DB_PATH)}-wal`],
		[`${DB_PATH}-shm`, `${basename(DB_PATH)}-shm`],
		[UPLOAD_ROOT, "uploads"],
	];
	for (const [path, name] of moves) {
		if (!(await exists(path))) continue;
		await mkdir(backup, { recursive: true });
		await rename(path, join(backup, name));
		backedUp = true;
	}

	await mkdir(dirname(DB_PATH), { recursive: true });
	await writeFile(DB_PATH, database);

	const uploadRoot = resolve(UPLOAD_ROOT);
	let uploads = 0;
	for (const [name, bytes] of Object.entries(files)) {
		if (!name.startsWith(EXPORT_LAYOUT.uploads) || name.endsWith("/")) continue;
		const target = resolve(
			uploadRoot,
			name.slice(EXPORT_LAYOUT.uploads.length),
		);
		// Never write outside the uploads folder, whatever the zip says.
		if (!target.startsWith(uploadRoot + sep)) continue;
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, bytes);
		uploads++;
	}
	await mkdir(uploadRoot, { recursive: true });

	return {
		exportedAt: manifest.exportedAt,
		rows: manifest.rows,
		uploads,
		...(backedUp ? { backup } : {}),
	};
}
