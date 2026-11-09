/**
 * Versions of each bouquet's flowers, for the florist's reference list: v1 is
 * the recipe as it was when versions began (or when the bouquet was added),
 * and every save that changes the flowers adds the next one. Only the flowers
 * count: a bouquet's own recipe and each style's own recipe, compared by
 * flower color, stems and filler. Photos, prices, names and the order of the
 * lines don't make a new version.
 *
 * Takes the database as an argument so migrations and transactions can use it.
 */
import type { Database } from "bun:sqlite";

export const RECIPE_VERSIONS_SQL = `
	CREATE TABLE recipe_versions (
		bouquet_id TEXT NOT NULL,
		version INTEGER NOT NULL CHECK (version > 0),
		-- What's compared: flower color ids, stems and filler, sorted.
		signature TEXT NOT NULL,
		-- The flowers by name at the time, for reading the history later.
		recipe TEXT NOT NULL,
		created_at TEXT NOT NULL,
		created_by TEXT NOT NULL,
		PRIMARY KEY (bouquet_id, version)
	);
`;

interface Line {
	owner: string;
	colorId: string;
	flower: string;
	color: string;
	count: number;
	filler: number;
}

/** A bouquet's flowers now: its own, and each style's that has its own. */
function currentRecipe(db: Database, bouquetId: string) {
	const lines = (table: string, owner: string, where: string) =>
		db
			.query(
				`SELECT r.${owner} AS owner, r.flower_color_id AS colorId, f.name AS flower,
				   c.name AS color, r.count, r.is_filler AS filler
				 FROM ${table} r
				 JOIN flower_colors c ON c.id = r.flower_color_id
				 JOIN flowers f ON f.id = c.flower_id
				 WHERE ${where}
				 ORDER BY r.sort`,
			)
			.all({ bouquetId }) as Line[];
	const own = lines(
		"bouquet_flowers",
		"bouquet_id",
		"r.bouquet_id = $bouquetId",
	);
	const styleLines = lines(
		"style_flowers",
		"style_id",
		"r.style_id IN (SELECT id FROM bouquet_styles WHERE bouquet_id = $bouquetId)",
	);
	const styles = db
		.query(
			"SELECT id, name FROM bouquet_styles WHERE bouquet_id = $bouquetId ORDER BY sort",
		)
		.all({ bouquetId }) as { id: string; name: string }[];

	const key = (line: Line) => `${line.colorId}:${line.count}:${line.filler}`;
	const sortedKeys = (list: Line[]) => list.map(key).sort();
	const withOwn = styles
		.map((style) => ({
			...style,
			lines: styleLines.filter((line) => line.owner === style.id),
		}))
		.filter((style) => style.lines.length > 0);
	const signature = JSON.stringify({
		bouquet: sortedKeys(own),
		styles: withOwn
			.map((style) => [style.id, sortedKeys(style.lines)] as const)
			.sort(([a], [b]) => a.localeCompare(b)),
	});
	const readable = (list: Line[]) =>
		list.map((line) => ({
			flower: line.flower,
			color: line.color,
			count: line.count,
			...(line.filler ? { filler: true } : {}),
		}));
	const recipe = JSON.stringify({
		bouquet: readable(own),
		styles: withOwn.map((style) => ({
			name: style.name,
			recipe: readable(style.lines),
		})),
	});
	return { signature, recipe };
}

/**
 * Adds the bouquet's next version if its flowers differ from the last one
 * (or it has none yet). Returns the version it's on now.
 */
export function recordRecipeVersion(
	db: Database,
	bouquetId: string,
	by: string,
): number {
	const { signature, recipe } = currentRecipe(db, bouquetId);
	const last = db
		.query(
			`SELECT version, signature FROM recipe_versions
			 WHERE bouquet_id = $bouquetId ORDER BY version DESC LIMIT 1`,
		)
		.get({ bouquetId }) as { version: number; signature: string } | null;
	if (last && last.signature === signature) return last.version;
	const version = (last?.version ?? 0) + 1;
	db.query(
		`INSERT INTO recipe_versions (bouquet_id, version, signature, recipe, created_at, created_by)
		 VALUES ($bouquetId, $version, $signature, $recipe, $now, $by)`,
	).run({
		bouquetId,
		version,
		signature,
		recipe,
		now: new Date().toISOString(),
		by,
	});
	return version;
}

/** Starts every bouquet without a version on v1, with its flowers as they are. */
export function backfillRecipeVersions(db: Database) {
	const ids = db
		.query(
			`SELECT id FROM signature_bouquets
			 WHERE id NOT IN (SELECT bouquet_id FROM recipe_versions)`,
		)
		.all() as { id: string }[];
	for (const { id } of ids) recordRecipeVersion(db, id, "First version");
}

export interface RecipeVersionInfo {
	version: number;
	/** When this version's flowers were saved. */
	createdAt: string;
	createdBy: string;
}

/** Each bouquet's current version, by bouquet id. */
export function latestRecipeVersions(
	db: Database,
): Record<string, RecipeVersionInfo> {
	const rows = db
		.query(
			`SELECT v.bouquet_id, v.version, v.created_at, v.created_by
			 FROM recipe_versions v
			 JOIN (SELECT bouquet_id, MAX(version) AS version FROM recipe_versions GROUP BY bouquet_id) m
			   ON m.bouquet_id = v.bouquet_id AND m.version = v.version`,
		)
		.all() as {
		bouquet_id: string;
		version: number;
		created_at: string;
		created_by: string;
	}[];
	return Object.fromEntries(
		rows.map((row) => [
			row.bouquet_id,
			{
				version: row.version,
				createdAt: row.created_at,
				createdBy: row.created_by,
			},
		]),
	);
}

/** A deleted bouquet's history goes with it, so a new one by that name starts at v1. */
export function deleteRecipeVersions(db: Database, bouquetId: string) {
	db.query("DELETE FROM recipe_versions WHERE bouquet_id = $bouquetId").run({
		bouquetId,
	});
}
