import { getDb, nowIso } from "./db";

/** A staff note on an order; customers never see these. */
export interface OrderNote {
	id: string;
	orderId: string;
	body: string;
	authorId: string;
	authorName: string;
	createdAt: string;
	editedAt?: string;
}

/** Longest note staff can write. */
export const ORDER_NOTE_MAX = 2000;

interface NoteRow {
	id: string;
	order_id: string;
	body: string;
	author_id: string;
	author_name: string;
	created_at: string;
	edited_at: string | null;
}

const toNote = (row: NoteRow): OrderNote => ({
	id: row.id,
	orderId: row.order_id,
	body: row.body,
	authorId: row.author_id,
	authorName: row.author_name,
	createdAt: row.created_at,
	...(row.edited_at ? { editedAt: row.edited_at } : {}),
});

/** An order's notes, oldest first, so they read like a conversation. */
export function listOrderNotes(orderId: string): OrderNote[] {
	return (
		getDb()
			.query(
				"SELECT * FROM order_notes WHERE order_id = $orderId ORDER BY created_at, rowid",
			)
			.all({ orderId }) as NoteRow[]
	).map(toNote);
}

/** How many notes each of these orders has; orders without notes are left out. */
export function countOrderNotes(orderIds: string[]): Record<string, number> {
	if (!orderIds.length) return {};
	const params = Object.fromEntries(orderIds.map((id, i) => [`id${i}`, id]));
	const rows = getDb()
		.query(
			`SELECT order_id, COUNT(*) AS n FROM order_notes
			 WHERE order_id IN (${orderIds.map((_, i) => `$id${i}`).join(", ")})
			 GROUP BY order_id`,
		)
		.all(params) as { order_id: string; n: number }[];
	return Object.fromEntries(rows.map((row) => [row.order_id, row.n]));
}

export function getOrderNote(id: string): OrderNote | undefined {
	const row = getDb()
		.query("SELECT * FROM order_notes WHERE id = $id")
		.get({ id }) as NoteRow | null;
	return row ? toNote(row) : undefined;
}

export function addOrderNote(
	orderId: string,
	body: string,
	author: { id: string; name: string },
): OrderNote {
	const id = crypto.randomUUID();
	getDb()
		.query(
			`INSERT INTO order_notes (id, order_id, body, author_id, author_name, created_at)
			 VALUES ($id, $orderId, $body, $authorId, $authorName, $now)`,
		)
		.run({
			id,
			orderId,
			body,
			authorId: author.id,
			authorName: author.name,
			now: nowIso(),
		});
	return getOrderNote(id) as OrderNote;
}

export function editOrderNote(id: string, body: string) {
	getDb()
		.query(
			"UPDATE order_notes SET body = $body, edited_at = $now WHERE id = $id",
		)
		.run({ id, body, now: nowIso() });
	return getOrderNote(id);
}

export function deleteOrderNote(id: string) {
	getDb().query("DELETE FROM order_notes WHERE id = $id").run({ id });
}
