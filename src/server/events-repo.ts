import { tidyDates } from "~/lib/delivery-dates";
import type { EventStatus, ShopEvent } from "~/lib/events";
import { isEventStatus } from "~/lib/events";
import { getDb, nowIso } from "./db";

export type EventInput = Omit<ShopEvent, "id">;

interface EventRow {
	id: string;
	name: string;
	orders_open_on: string;
	orders_close_on: string;
	delivery_dates: string;
	status: string;
	notes: string;
}

function parseDates(value: string): string[] {
	try {
		const dates = JSON.parse(value) as unknown;
		return Array.isArray(dates)
			? tidyDates(dates.filter((d): d is string => typeof d === "string"))
			: [];
	} catch {
		return [];
	}
}

const toEvent = (row: EventRow): ShopEvent => ({
	id: row.id,
	name: row.name,
	ordersOpenOn: row.orders_open_on,
	ordersCloseOn: row.orders_close_on,
	deliveryDates: parseDates(row.delivery_dates),
	status: isEventStatus(row.status) ? row.status : "upcoming",
	notes: row.notes,
});

export function listEvents(): ShopEvent[] {
	return (
		getDb()
			.query("SELECT * FROM events ORDER BY orders_open_on")
			.all() as EventRow[]
	).map(toEvent);
}

export function getEvent(id: string): ShopEvent | null {
	const row = getDb()
		.query("SELECT * FROM events WHERE id = $id")
		.get({ id }) as EventRow | null;
	return row ? toEvent(row) : null;
}

/** Another event already has this name (ignoring case). */
export function eventNameTaken(name: string, exceptId?: string) {
	return !!getDb()
		.query(
			"SELECT 1 FROM events WHERE lower(name) = lower($name) AND id != $id",
		)
		.get({ name, id: exceptId ?? "" });
}

/** Another event with this status, e.g. the one that's current now. */
export function otherEventWithStatus(status: EventStatus, exceptId?: string) {
	const row = getDb()
		.query("SELECT * FROM events WHERE status = $status AND id != $id LIMIT 1")
		.get({ status, id: exceptId ?? "" }) as EventRow | null;
	return row ? toEvent(row) : null;
}

/** Adds an event (`id` null) or updates one. Returns its id. */
export function saveEvent(id: string | null, input: EventInput) {
	const db = getDb();
	const params = {
		name: input.name,
		ordersOpenOn: input.ordersOpenOn,
		ordersCloseOn: input.ordersCloseOn,
		deliveryDates: JSON.stringify(tidyDates(input.deliveryDates)),
		status: input.status,
		notes: input.notes,
		now: nowIso(),
	};
	if (id) {
		const { changes } = db
			.query(
				`UPDATE events SET name = $name, orders_open_on = $ordersOpenOn,
				   orders_close_on = $ordersCloseOn, delivery_dates = $deliveryDates,
				   status = $status, notes = $notes, updated_at = $now
				 WHERE id = $id`,
			)
			.run({ id, ...params });
		if (changes === 0) throw new Error("Event not found");
		return id;
	}
	const newId = `evt-${crypto.randomUUID().slice(0, 8)}`;
	db.query(
		`INSERT INTO events (id, name, orders_open_on, orders_close_on, delivery_dates,
		   status, notes, created_at, updated_at)
		 VALUES ($id, $name, $ordersOpenOn, $ordersCloseOn, $deliveryDates,
		   $status, $notes, $now, $now)`,
	).run({ id: newId, ...params });
	return newId;
}

export function deleteEvent(id: string) {
	const { changes } = getDb()
		.query("DELETE FROM events WHERE id = $id")
		.run({ id });
	return changes > 0;
}
