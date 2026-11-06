import type { ArrangementTypeInfo } from "~/lib/arrangements";
import { slugify, uniqueSlug } from "./bouquet-tables";
import { getDb, nowIso } from "./db";
import { InputError } from "./validate";

export interface ArrangementTypeRecord extends ArrangementTypeInfo {
	/** Floral arrangements of this type. */
	usedIn: number;
	/** Sizes for this type (Admin → Sizes). */
	sizeCount: number;
}

/** Every type, in the shop's tab order. */
export function listArrangementTypes(): ArrangementTypeRecord[] {
	const rows = getDb()
		.query(
			`SELECT t.id, t.name, t.plural_name, t.description,
			   (SELECT COUNT(*) FROM signature_bouquets b WHERE b.arrangement = t.id) AS usedIn,
			   (SELECT COUNT(*) FROM sizes s WHERE s.arrangement = t.id) AS sizeCount
			 FROM arrangement_types t ORDER BY t.sort, t.name`,
		)
		.all() as {
		id: string;
		name: string;
		plural_name: string;
		description: string;
		usedIn: number;
		sizeCount: number;
	}[];
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		pluralName: row.plural_name,
		description: row.description,
		usedIn: row.usedIn,
		sizeCount: row.sizeCount,
	}));
}

export function getArrangementType(id: string) {
	return listArrangementTypes().find((type) => type.id === id) ?? null;
}

export type ArrangementTypeInput = Omit<ArrangementTypeInfo, "id">;

/** Another type already has this name (ignoring case). */
export function arrangementTypeNameTaken(name: string, exceptId?: string) {
	return !!getDb()
		.query("SELECT 1 FROM arrangement_types WHERE name = $name AND id != $id")
		.get({ name, id: exceptId ?? "" });
}

/**
 * Adds a type (`id` null), last, or updates one. Its id comes from its first
 * name and stays the same, so arrangements and shop links keep it.
 */
export function saveArrangementType(
	id: string | null,
	input: ArrangementTypeInput,
) {
	const db = getDb();
	const params = {
		name: input.name,
		pluralName: input.pluralName,
		description: input.description,
		now: nowIso(),
	};
	if (id) {
		const { changes } = db
			.query(
				`UPDATE arrangement_types SET name = $name, plural_name = $pluralName,
				   description = $description, updated_at = $now WHERE id = $id`,
			)
			.run({ id, ...params });
		if (changes === 0) throw new Error("Arrangement type not found");
		return id;
	}
	const taken = new Set(
		(
			db.query("SELECT id FROM arrangement_types").all() as { id: string }[]
		).map((r) => r.id),
	);
	const newId = uniqueSlug(slugify(input.name), taken);
	db.query(
		`INSERT INTO arrangement_types (id, name, plural_name, description, sort, created_at, updated_at)
		 VALUES ($id, $name, $pluralName, $description,
		   (SELECT COALESCE(MAX(sort), -1) + 1 FROM arrangement_types), $now, $now)`,
	).run({ id: newId, ...params });
	return newId;
}

/** Moves a type one tab earlier (-1) or later (+1) in the shop. */
export function moveArrangementType(id: string, direction: -1 | 1) {
	const db = getDb();
	const ids = listArrangementTypes().map((type) => type.id);
	const from = ids.indexOf(id);
	const to = from + direction;
	if (from === -1 || to < 0 || to >= ids.length) return;
	[ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
	const update = db.query(
		"UPDATE arrangement_types SET sort = $sort WHERE id = $id",
	);
	db.transaction(() => {
		ids.forEach((typeId, sort) => {
			update.run({ id: typeId, sort });
		});
	})();
}

/** Deletes a type, unless arrangements or sizes still have it, or it's the last one. */
export function deleteArrangementType(id: string) {
	const db = getDb();
	const using = db
		.query(
			"SELECT name FROM signature_bouquets WHERE arrangement = $id ORDER BY sort",
		)
		.all({ id }) as { name: string }[];
	if (using.length) {
		const names = using.slice(0, 3).map((b) => b.name);
		const more = using.length > 3 ? ` and ${using.length - 3} more` : "";
		throw new InputError(
			`${names.join(", ")}${more} ${using.length === 1 ? "is" : "are"} this type. Give ${using.length === 1 ? "it" : "them"} another type first.`,
		);
	}
	const sizes = db
		.query("SELECT name FROM sizes WHERE arrangement = $id ORDER BY sort")
		.all({ id }) as { name: string }[];
	if (sizes.length)
		throw new InputError(
			`${sizes.map((size) => size.name).join(", ")} ${sizes.length === 1 ? "is a size" : "are sizes"} for this type. Delete ${sizes.length === 1 ? "it" : "them"} or give ${sizes.length === 1 ? "it" : "them"} another type in Sizes first.`,
		);
	if (listArrangementTypes().length <= 1)
		throw new InputError("Keep at least one arrangement type.");
	const { changes } = db
		.query("DELETE FROM arrangement_types WHERE id = $id")
		.run({ id });
	return changes > 0;
}
