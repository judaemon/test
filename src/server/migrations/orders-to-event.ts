import type { Database } from "bun:sqlite";

import { fixedHopDay, HOP_2026_DAYS_TO_FIX } from "~/lib/event-day-fix";

/** The event the live shop set up for Battalion Hop 2026. */
const HOP_2026_EVENT_ID = "evt-9998c65b";

const nowIso = () => new Date().toISOString();

/**
 * Orders belong to an event. Every order so far is the one event's: the
 * Battalion Hop 2026 event when it's there, else the current event, else
 * the latest. That event becomes current if none is, and its delivery days
 * become the ones checkout offers.
 *
 * Its orders on Friday, Nov 13 or with no day move to their battalion's
 * day (1/2 Saturday, 3/4 Sunday), and those with no company become
 * civilians, on Saturday. Each change is on the order's history.
 *
 * Runs once, inside the migration's transaction, so it uses `db` directly.
 */
export function ordersToEvent(db: Database) {
	db.exec(`
		ALTER TABLE orders ADD COLUMN event_id TEXT;
		CREATE INDEX orders_by_event ON orders (event_id);
	`);

	const event =
		(db
			.query("SELECT id, status, delivery_dates FROM events WHERE id = $id")
			.get({ id: HOP_2026_EVENT_ID }) as EventRow | null) ??
		(db
			.query(
				"SELECT id, status, delivery_dates FROM events WHERE status = 'current'",
			)
			.get() as EventRow | null) ??
		(db
			.query(
				"SELECT id, status, delivery_dates FROM events ORDER BY orders_open_on DESC LIMIT 1",
			)
			.get() as EventRow | null);
	// No event yet (a fresh shop): nothing to connect.
	if (!event) return;

	const now = nowIso();
	const hasCurrent = db
		.query("SELECT 1 FROM events WHERE status = 'current'")
		.get();
	if (!hasCurrent)
		db.query(
			"UPDATE events SET status = 'current', updated_at = $now WHERE id = $id",
		).run({ id: event.id, now });

	// Checkout's days until now: keep them if the event has none of its own.
	if (parseDates(event.delivery_dates).length === 0) {
		const setting = db
			.query("SELECT value FROM settings WHERE key = 'delivery_dates'")
			.get() as { value: string } | null;
		const dates = setting
			? parseDates(JSON.stringify(JSON.parse(setting.value).dates ?? []))
			: [];
		if (dates.length)
			db.query(
				"UPDATE events SET delivery_dates = $dates, updated_at = $now WHERE id = $id",
			).run({ id: event.id, dates: JSON.stringify(dates), now });
	}

	db.query("UPDATE orders SET event_id = $id WHERE event_id IS NULL").run({
		id: event.id,
	});

	// Cancelled orders aren't delivered, so their day stays as it was.
	const toFix = db
		.query(
			`SELECT id, delivery_date, company, class_name FROM orders
			  WHERE event_id = $id AND stage != 'cancelled'
			    AND coalesce(delivery_date, '') IN ($friday, $none)`,
		)
		.all({
			id: event.id,
			friday: HOP_2026_DAYS_TO_FIX[0],
			none: HOP_2026_DAYS_TO_FIX[1],
		}) as {
		id: string;
		delivery_date: string | null;
		company: string | null;
		class_name: string | null;
	}[];

	const update = db.query(
		"UPDATE orders SET delivery_date = $date, class_name = $className WHERE id = $id",
	);
	const log = db.query(
		`INSERT INTO order_log (order_id, at, actor_type, actor_name, actor_id, source,
		   action, field, from_value, to_value, about, reason)
		 VALUES ($orderId, $at, 'system', 'System', NULL, NULL,
		   'delivery_date', $field, $from, $to, NULL, $reason)`,
	);
	for (const order of toFix) {
		const before = {
			date: order.delivery_date ?? "",
			className: order.class_name ?? "",
		};
		const after = fixedHopDay({
			company: order.company ?? "",
			className: before.className,
		});
		update.run({ id: order.id, date: after.date, className: after.className });
		const reason = order.company
			? "Battalion Hop 2026: delivered on their battalion’s day."
			: "Battalion Hop 2026: no company, so a civilian, delivered Saturday.";
		if (before.date !== after.date)
			log.run({
				orderId: order.id,
				at: now,
				field: "delivery_date",
				from: before.date || null,
				to: after.date,
				reason,
			});
		if (before.className !== after.className)
			log.run({
				orderId: order.id,
				at: now,
				field: "class",
				from: before.className || null,
				to: after.className,
				reason,
			});
	}
}

interface EventRow {
	id: string;
	status: string;
	delivery_dates: string;
}

function parseDates(value: string): string[] {
	try {
		const dates = JSON.parse(value) as unknown;
		return Array.isArray(dates)
			? [
					...new Set(dates.filter((d): d is string => typeof d === "string")),
				].sort()
			: [];
	} catch {
		return [];
	}
}
