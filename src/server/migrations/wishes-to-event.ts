import type { Database } from "bun:sqlite";

/** The event the live shop set up for Battalion Hop 2026. */
const HOP_2026_EVENT_ID = "evt-9998c65b";

/**
 * Events get a most-orders limit, and names left on the fully booked page
 * belong to an event. Every name so far is from Battalion Hop 2026: that
 * event when it's there, else the latest event that's done, else the
 * current one.
 */
export function wishesToEvent(db: Database) {
	db.exec(`
		ALTER TABLE events ADD COLUMN max_orders INTEGER;
		ALTER TABLE shop_wishes ADD COLUMN event_id TEXT;
		CREATE INDEX shop_wishes_by_event ON shop_wishes (event_id, created_at);
	`);
	const event =
		(db.query("SELECT id FROM events WHERE id = $id").get({
			id: HOP_2026_EVENT_ID,
		}) as { id: string } | null) ??
		(db
			.query(
				"SELECT id FROM events WHERE status = 'done' ORDER BY orders_close_on DESC LIMIT 1",
			)
			.get() as { id: string } | null) ??
		(db
			.query("SELECT id FROM events WHERE status = 'current' LIMIT 1")
			.get() as { id: string } | null);
	if (!event) return;
	db.query("UPDATE shop_wishes SET event_id = $id WHERE event_id IS NULL").run({
		id: event.id,
	});
}
