import type { BouquetSizeInfo } from "~/lib/sizes";
import { slugify, uniqueSlug } from "./bouquet-tables";
import { fromCents, getDb, nowIso, toCents } from "./db";
import { InputError } from "./validate";

export interface SizeRecord extends BouquetSizeInfo {
	/** Floral arrangements with this size. */
	usedIn: number;
}

/** Every size, smallest first. */
export function listSizes(): SizeRecord[] {
	const rows = getDb()
		.query(
			`SELECT s.id, s.name, s.description, s.image, s.price_cents,
			   COALESCE(s.arrangement, 'bouquet') AS arrangement,
			   (SELECT COUNT(*) FROM signature_bouquets b WHERE b.size_id = s.id) AS usedIn
			 FROM sizes s ORDER BY s.sort, s.name`,
		)
		.all() as (Omit<SizeRecord, "price"> & { price_cents: number | null })[];
	return rows.map(({ price_cents: priceCents, ...size }) => ({
		...size,
		...(priceCents === null ? {} : { price: fromCents(priceCents) }),
	}));
}

export function getSize(id: string) {
	return listSizes().find((size) => size.id === id) ?? null;
}

export type SizeInput = Omit<BouquetSizeInfo, "id" | "price"> & {
	/** Null leaves the size out of the bouquet builder. */
	price: number | null;
};

/** Another size already has this name (ignoring case). */
export function sizeNameTaken(name: string, exceptId?: string) {
	return !!getDb()
		.query("SELECT 1 FROM sizes WHERE name = $name AND id != $id")
		.get({ name, id: exceptId ?? "" });
}

/**
 * Adds a size (`id` null), largest last, or updates one. Its id comes from
 * its first name and stays the same, so bouquets and shop links keep it.
 */
export function saveSize(id: string | null, input: SizeInput) {
	const db = getDb();
	const now = nowIso();
	const { price, ...fields } = input;
	const params = {
		...fields,
		priceCents: price === null ? null : toCents(price),
		now,
	};
	if (id) {
		const { changes } = db
			.query(
				`UPDATE sizes SET name = $name, description = $description, image = $image,
				   arrangement = $arrangement, price_cents = $priceCents, updated_at = $now
				 WHERE id = $id`,
			)
			.run({ id, ...params });
		if (changes === 0) throw new Error("Size not found");
		// Arrangements of another type can't keep a size that isn't theirs.
		db.query(
			"UPDATE signature_bouquets SET size_id = NULL WHERE size_id = $id AND arrangement != $arrangement",
		).run({ id, arrangement: input.arrangement });
		return id;
	}
	const taken = new Set(
		(db.query("SELECT id FROM sizes").all() as { id: string }[]).map(
			(r) => r.id,
		),
	);
	const newId = uniqueSlug(slugify(input.name), taken);
	db.query(
		`INSERT INTO sizes (id, name, description, image, arrangement, price_cents, sort, created_at, updated_at)
		 VALUES ($id, $name, $description, $image, $arrangement, $priceCents,
		   (SELECT COALESCE(MAX(sort), -1) + 1 FROM sizes), $now, $now)`,
	).run({ id: newId, ...params });
	return newId;
}

/**
 * Moves a size one place smaller (-1) or larger (+1) in its type's size
 * guide, past the next size of the same type.
 */
export function moveSize(id: string, direction: -1 | 1) {
	const db = getDb();
	const sizes = listSizes();
	const ids = sizes.map((size) => size.id);
	const from = ids.indexOf(id);
	const type = sizes[from]?.arrangement;
	const siblings = sizes.flatMap((size, index) =>
		size.arrangement === type ? [index] : [],
	);
	const to = siblings[siblings.indexOf(from) + direction];
	if (from === -1 || to === undefined) return;
	[ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
	const update = db.query("UPDATE sizes SET sort = $sort WHERE id = $id");
	db.transaction(() => {
		ids.forEach((sizeId, sort) => {
			update.run({ id: sizeId, sort });
		});
	})();
}

/** Deletes a size, unless a signature bouquet still has it. */
export function deleteSize(id: string) {
	const db = getDb();
	const using = db
		.query(
			"SELECT name FROM signature_bouquets WHERE size_id = $id ORDER BY sort",
		)
		.all({ id }) as { name: string }[];
	if (using.length) {
		const names = using.slice(0, 3).map((b) => b.name);
		const more = using.length > 3 ? ` and ${using.length - 3} more` : "";
		throw new InputError(
			`${names.join(", ")}${more} ${using.length === 1 ? "has" : "have"} this size. Give ${using.length === 1 ? "it" : "them"} another size first.`,
		);
	}
	const { changes } = db.query("DELETE FROM sizes WHERE id = $id").run({ id });
	return changes > 0;
}
