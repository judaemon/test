import { productPhotoId } from "~/lib/photos";
import { getDb, nowIso } from "./db";
import { readUpload } from "./uploads";

/**
 * Which uploaded bouquet photos carry the watermark (and which version), and
 * where photos that were re-stamped under a new id went.
 */

/** Notes that a photo was uploaded or re-stamped with this watermark version. */
export function recordWatermark(photoId: string, version: number) {
	getDb()
		.query(
			`INSERT INTO photo_watermarks (photo_id, version, created_at) VALUES ($id, $version, $now)
			 ON CONFLICT (photo_id) DO UPDATE SET version = excluded.version`,
		)
		.run({ id: photoId, version, now: nowIso() });
}

/** The watermark version a photo carries; undefined if it has none. */
export function watermarkVersion(photoId: string) {
	const row = getDb()
		.query("SELECT version FROM photo_watermarks WHERE photo_id = $id")
		.get({ id: photoId }) as { version: number } | null;
	return row?.version;
}

/** Where a re-stamped photo's old id points now, if it was re-stamped. */
export function photoRedirect(oldId: string) {
	const row = getDb()
		.query("SELECT new_id FROM photo_redirects WHERE old_id = $id")
		.get({ id: oldId }) as { new_id: string } | null;
	return row?.new_id;
}

/** A photo address with any re-stamped photo swapped for its current one. */
export function currentPhotoUrl(url: string) {
	const id = productPhotoId(url);
	const next = id && photoRedirect(id);
	return next ? `/uploads/products/${next}` : url;
}

/** Every uploaded photo used by a signature bouquet style, once each. */
function bouquetPhotoUrls() {
	const rows = getDb().query("SELECT images FROM bouquet_styles").all() as {
		images: string;
	}[];
	const urls = new Set<string>();
	for (const row of rows)
		for (const url of JSON.parse(row.images) as string[])
			if (productPhotoId(url)) urls.add(url);
	return [...urls];
}

/** Bouquet photos without the watermark, or with an older version of it. */
export function photosNeedingWatermark(version: number) {
	const urls: string[] = [];
	let outdated = 0;
	for (const url of bouquetPhotoUrls()) {
		const current = watermarkVersion(productPhotoId(url) as string);
		if (current !== undefined && current >= version) continue;
		urls.push(url);
		if (current !== undefined) outdated++;
	}
	/** `outdated`: how many of them carry an older watermark (the rest have none). */
	return { urls, outdated };
}

/**
 * Swaps a bouquet photo for its re-stamped copy everywhere bouquets use it,
 * and has the old id redirect to the new one (orders keep old addresses).
 * Earlier redirects to the old id now go straight to the new one.
 */
export function replacePhoto(oldId: string, newId: string, version: number) {
	const db = getDb();
	db.transaction(() => {
		const oldUrl = `/uploads/products/${oldId}`;
		const newUrl = `/uploads/products/${newId}`;
		const styles = db
			.query("SELECT id, images FROM bouquet_styles WHERE images LIKE $pattern")
			.all({ pattern: `%${oldUrl}%` }) as { id: string; images: string }[];
		const update = db.query(
			"UPDATE bouquet_styles SET images = $images WHERE id = $id",
		);
		for (const style of styles) {
			const images = (JSON.parse(style.images) as string[]).map((url) =>
				url === oldUrl ? newUrl : url,
			);
			update.run({ id: style.id, images: JSON.stringify(images) });
		}
		db.query(
			"INSERT OR REPLACE INTO photo_redirects (old_id, new_id) VALUES ($old, $new)",
		).run({ old: oldId, new: newId });
		db.query(
			"UPDATE photo_redirects SET new_id = $new WHERE new_id = $old",
		).run({ old: oldId, new: newId });
		db.query("DELETE FROM photo_watermarks WHERE photo_id = $old").run({
			old: oldId,
		});
		recordWatermark(newId, version);
	})();
}

/**
 * A photo's clean, unwatermarked version: its kept original, or, for a photo
 * uploaded before watermarks (which has no record), the photo itself. None
 * for a watermarked photo whose original is missing, so it's never stamped
 * twice.
 */
export async function cleanOriginal(photoId: string) {
	const original = await readUpload("originals", photoId);
	if (original) return { ...original, kind: "originals" as const };
	if (watermarkVersion(photoId) !== undefined) return null;
	const photo = await readUpload("products", photoId);
	return photo && { ...photo, kind: "products" as const };
}
