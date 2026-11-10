import { getDb, nowIso } from "./db";

export interface Supplier {
	id: string;
	name: string;
	contactName: string;
	phone: string;
	email: string;
	notes: string;
}

export interface SupplierRecord extends Supplier {
	/** Wrappers this supplier supplies. */
	wrapperCount: number;
}

export type SupplierInput = Omit<Supplier, "id">;

interface SupplierRow {
	id: string;
	name: string;
	contact_name: string;
	phone: string;
	email: string;
	notes: string;
	wrapper_count: number;
}

const toSupplier = (row: SupplierRow): SupplierRecord => ({
	id: row.id,
	name: row.name,
	contactName: row.contact_name,
	phone: row.phone,
	email: row.email,
	notes: row.notes,
	wrapperCount: row.wrapper_count,
});

const SELECT = `SELECT s.*,
	(SELECT COUNT(*) FROM wrapper_suppliers ws WHERE ws.supplier_id = s.id) AS wrapper_count
	FROM suppliers s`;

/** Every supplier, A–Z. */
export function listSuppliers(): SupplierRecord[] {
	return (
		getDb()
			.query(`${SELECT} ORDER BY s.name COLLATE NOCASE`)
			.all() as SupplierRow[]
	).map(toSupplier);
}

export function getSupplier(id: string): SupplierRecord | null {
	const row = getDb()
		.query(`${SELECT} WHERE s.id = $id`)
		.get({ id }) as SupplierRow | null;
	return row ? toSupplier(row) : null;
}

/** Another supplier already has this name (ignoring case). */
export function supplierNameTaken(name: string, exceptId?: string) {
	return !!getDb()
		.query(
			"SELECT 1 FROM suppliers WHERE lower(name) = lower($name) AND id != $id",
		)
		.get({ name, id: exceptId ?? "" });
}

/** Adds a supplier (`id` null) or updates one. Returns its id. */
export function saveSupplier(id: string | null, input: SupplierInput) {
	const db = getDb();
	const params = {
		name: input.name,
		contactName: input.contactName,
		phone: input.phone,
		email: input.email,
		notes: input.notes,
		now: nowIso(),
	};
	if (id) {
		const { changes } = db
			.query(
				`UPDATE suppliers SET name = $name, contact_name = $contactName, phone = $phone,
				   email = $email, notes = $notes, updated_at = $now
				 WHERE id = $id`,
			)
			.run({ id, ...params });
		if (changes === 0) throw new Error("Supplier not found");
		return id;
	}
	const newId = `sup-${crypto.randomUUID().slice(0, 8)}`;
	db.query(
		`INSERT INTO suppliers (id, name, contact_name, phone, email, notes, created_at, updated_at)
		 VALUES ($id, $name, $contactName, $phone, $email, $notes, $now, $now)`,
	).run({ id: newId, ...params });
	return newId;
}

/** Deletes a supplier. Its wrappers stay; it's just taken off them. */
export function deleteSupplier(id: string) {
	const { changes } = getDb()
		.query("DELETE FROM suppliers WHERE id = $id")
		.run({ id });
	return changes > 0;
}
