/**
 * A bouquet's shop link, /products/<slug>, follows its name: renaming Adeline
 * to Fiona moves it to /products/fiona. The bouquet's id never changes (orders,
 * carts and versions point at it), so the link is its own column. Every link a
 * bouquet has had still works and redirects to the current one.
 *
 * Takes the database as an argument so migrations and transactions can use it.
 */
import type { Database } from "bun:sqlite";

import { slugify, uniqueSlug } from "./bouquet-tables";

export const BOUQUET_SLUGS_SQL = `
	ALTER TABLE signature_bouquets ADD COLUMN slug TEXT;
	CREATE UNIQUE INDEX signature_bouquets_slug ON signature_bouquets (slug);
	-- Links a bouquet used to have, so old links and search results still land.
	CREATE TABLE bouquet_old_slugs (
		slug TEXT PRIMARY KEY,
		bouquet_id TEXT NOT NULL REFERENCES signature_bouquets(id) ON DELETE CASCADE ON UPDATE CASCADE,
		replaced_at TEXT NOT NULL
	);
`;

const currentSlugs = (db: Database, exceptId?: string) =>
	new Set(
		(
			db
				.query(
					"SELECT slug FROM signature_bouquets WHERE slug IS NOT NULL AND id IS NOT $id",
				)
				.all({ id: exceptId ?? null }) as { slug: string }[]
		).map((row) => row.slug),
	);

/** Remembers a link a bouquet no longer uses; a current link always wins. */
function rememberOldSlug(db: Database, bouquetId: string, slug: string) {
	db.query(
		`INSERT INTO bouquet_old_slugs (slug, bouquet_id, replaced_at) VALUES ($slug, $bouquetId, $now)
		 ON CONFLICT (slug) DO UPDATE SET bouquet_id = excluded.bouquet_id, replaced_at = excluded.replaced_at`,
	).run({ slug, bouquetId, now: new Date().toISOString() });
}

/**
 * Points the bouquet's link at its name, if the name now reads differently.
 * Its old link redirects to the new one. Returns the bouquet's link.
 */
export function updateBouquetSlug(
	db: Database,
	bouquetId: string,
	name: string,
): string {
	const row = db
		.query("SELECT slug FROM signature_bouquets WHERE id = $id")
		.get({ id: bouquetId }) as { slug: string | null } | null;
	if (!row) throw new Error("Bouquet not found");
	const base = slugify(name);
	const current = row.slug;
	// Still the same name as far as a link goes (e.g. only its case changed),
	// or a numbered copy of it ("fiona-2" when another Fiona has "fiona").
	if (
		current &&
		(current === base ||
			(current.startsWith(`${base}-`) &&
				/^\d+$/.test(current.slice(base.length + 1))))
	)
		return current;
	const slug = uniqueSlug(base, currentSlugs(db, bouquetId));
	db.query("UPDATE signature_bouquets SET slug = $slug WHERE id = $id").run({
		slug,
		id: bouquetId,
	});
	// The link is in use again: it's no longer an old link of another bouquet.
	db.query("DELETE FROM bouquet_old_slugs WHERE slug = $slug").run({ slug });
	if (current && current !== slug) rememberOldSlug(db, bouquetId, current);
	return slug;
}

/**
 * Gives every bouquet without a link one from its name. A bouquet whose id
 * differs (it was renamed before links followed names) keeps its id as an
 * old link, so links already shared or found on Google still land.
 */
export function assignMissingSlugs(db: Database) {
	const rows = db
		.query(
			"SELECT id, name FROM signature_bouquets WHERE slug IS NULL ORDER BY sort, created_at",
		)
		.all() as { id: string; name: string }[];
	if (!rows.length) return;
	const taken = currentSlugs(db);
	// Bouquets whose name still matches their id keep it, before any other
	// bouquet can be given that link.
	const ordered = [
		...rows.filter((row) => slugify(row.name) === row.id),
		...rows.filter((row) => slugify(row.name) !== row.id),
	];
	for (const { id, name } of ordered) {
		const slug = uniqueSlug(slugify(name), taken);
		db.query("UPDATE signature_bouquets SET slug = $slug WHERE id = $id").run({
			slug,
			id,
		});
	}
	for (const { id } of ordered) {
		const { slug } = db
			.query("SELECT slug FROM signature_bouquets WHERE id = $id")
			.get({ id }) as { slug: string };
		if (slug !== id && !taken.has(id)) rememberOldSlug(db, id, id);
	}
}

/**
 * Which bouquet a /products/<link> is: one whose current link it is, or one
 * that used to have it (`moved`: redirect to its current link). Ids work too,
 * for links built from one, such as the bag's.
 */
export function findBouquetBySlug(
	db: Database,
	link: string,
): { id: string; slug: string; moved: boolean } | null {
	const current = db
		.query(
			"SELECT id, COALESCE(slug, id) AS slug FROM signature_bouquets WHERE slug = $link",
		)
		.get({ link }) as { id: string; slug: string } | null;
	if (current) return { ...current, moved: false };
	const old = db
		.query(
			`SELECT b.id, COALESCE(b.slug, b.id) AS slug FROM bouquet_old_slugs o
			 JOIN signature_bouquets b ON b.id = o.bouquet_id WHERE o.slug = $link`,
		)
		.get({ link }) as { id: string; slug: string } | null;
	const byId =
		old ??
		(db
			.query(
				"SELECT id, COALESCE(slug, id) AS slug FROM signature_bouquets WHERE id = $link",
			)
			.get({ link }) as { id: string; slug: string } | null);
	if (!byId) return null;
	return { ...byId, moved: byId.slug !== link };
}
