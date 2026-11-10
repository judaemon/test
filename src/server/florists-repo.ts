import type { FloristOption } from "~/lib/florists";
import { getDb, nowIso } from "./db";

export interface Florist {
	id: string;
	name: string;
	phone: string;
	email: string;
	notes: string;
	active: boolean;
	/** The private link's secret; null while the link is off. */
	shareToken: string | null;
}

export type FloristInput = Omit<Florist, "id" | "shareToken">;

interface FloristRow {
	id: string;
	name: string;
	phone: string;
	email: string;
	notes: string;
	is_active: number;
	share_token: string | null;
}

const toFlorist = (row: FloristRow): Florist => ({
	id: row.id,
	name: row.name,
	phone: row.phone,
	email: row.email,
	notes: row.notes,
	active: row.is_active === 1,
	shareToken: row.share_token,
});

/** Every florist, A–Z. */
export function listFlorists(): Florist[] {
	return (
		getDb()
			.query("SELECT * FROM florists ORDER BY name COLLATE NOCASE")
			.all() as FloristRow[]
	).map(toFlorist);
}

/** For pickers and labels: no contact details or link. */
export function listFloristOptions(): FloristOption[] {
	return listFlorists().map(({ id, name, active }) => ({ id, name, active }));
}

/** Names by id, for the order log. */
export function floristNames() {
	return new Map(listFlorists().map((florist) => [florist.id, florist.name]));
}

export function getFlorist(id: string): Florist | null {
	const row = getDb()
		.query("SELECT * FROM florists WHERE id = $id")
		.get({ id }) as FloristRow | null;
	return row ? toFlorist(row) : null;
}

/** The florist whose private link this is, while it's on. */
export function getFloristByToken(token: string): Florist | null {
	if (!token) return null;
	const row = getDb()
		.query("SELECT * FROM florists WHERE share_token = $token")
		.get({ token }) as FloristRow | null;
	return row ? toFlorist(row) : null;
}

/** Another florist already has this name (ignoring case). */
export function floristNameTaken(name: string, exceptId?: string) {
	return !!getDb()
		.query(
			"SELECT 1 FROM florists WHERE lower(name) = lower($name) AND id != $id",
		)
		.get({ name, id: exceptId ?? "" });
}

/** Adds a florist (`id` null) or updates one. Returns its id. */
export function saveFlorist(id: string | null, input: FloristInput) {
	const db = getDb();
	const params = {
		name: input.name,
		phone: input.phone,
		email: input.email,
		notes: input.notes,
		active: input.active ? 1 : 0,
		now: nowIso(),
	};
	if (id) {
		const { changes } = db
			.query(
				`UPDATE florists SET name = $name, phone = $phone, email = $email,
				   notes = $notes, is_active = $active, updated_at = $now
				 WHERE id = $id`,
			)
			.run({ id, ...params });
		if (changes === 0) throw new Error("Florist not found");
		return id;
	}
	const newId = `flo-${crypto.randomUUID().slice(0, 8)}`;
	db.query(
		`INSERT INTO florists (id, name, phone, email, notes, is_active, created_at, updated_at)
		 VALUES ($id, $name, $phone, $email, $notes, $active, $now, $now)`,
	).run({ id: newId, ...params });
	return newId;
}

/**
 * Turns the private link on with a new secret (an old link stops working),
 * or off with null.
 */
export function setFloristLink(id: string, on: boolean) {
	const token = on
		? Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString(
				"base64url",
			)
		: null;
	getDb()
		.query(
			"UPDATE florists SET share_token = $token, updated_at = $now WHERE id = $id",
		)
		.run({ id, token, now: nowIso() });
	return token;
}

export function deleteFlorist(id: string) {
	const { changes } = getDb()
		.query("DELETE FROM florists WHERE id = $id")
		.run({ id });
	return changes > 0;
}
