import { CIVILIAN } from "~/lib/cadets";
import {
	DEFAULT_SHOP_STATUS,
	SHOP_MODES,
	type ShopMode,
	type ShopStatus,
	shopModeForEvent,
	WISH_DATES,
	type WishDetails,
} from "~/lib/shop-status";
import { getDb, nowIso } from "./db";
import { currentEvent, eventOrderCount } from "./events-repo";

const KEY = "shop_status";

/**
 * How the shop runs now, which follows the events (see `shopModeForEvent`),
 * with the fully booked message as saved and the current event's days.
 */
export function getShopStatus(): ShopStatus {
	const saved = getSavedShopStatus();
	const event = currentEvent();
	return {
		...saved,
		mode: shopModeForEvent(event, event ? eventOrderCount(event.id) : 0),
		days: event?.deliveryDates.length ? event.deliveryDates : [...WISH_DATES],
	};
}

/**
 * What's saved: the fully booked message, and the mode the owner last
 * picked by hand (from before the shop followed the events).
 */
export function getSavedShopStatus(): ShopStatus {
	const row = getDb()
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	if (!row) return { ...DEFAULT_SHOP_STATUS };
	const saved = JSON.parse(row.value) as Partial<ShopStatus> & {
		/** Before view only, the shop was only ever open or closed. */
		closed?: boolean;
	};
	const mode: ShopMode = (SHOP_MODES as readonly unknown[]).includes(saved.mode)
		? (saved.mode as ShopMode)
		: saved.closed === true
			? "closed"
			: "open";
	return {
		mode,
		heading:
			typeof saved.heading === "string" && saved.heading
				? saved.heading
				: DEFAULT_SHOP_STATUS.heading,
		message:
			typeof saved.message === "string" && saved.message
				? saved.message
				: DEFAULT_SHOP_STATUS.message,
	};
}

export function saveShopStatus(status: ShopStatus) {
	getDb()
		.query(
			`INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		)
		.run({
			key: KEY,
			value: JSON.stringify({
				mode: status.mode,
				heading: status.heading,
				message: status.message,
			}),
			now: nowIso(),
		});
	return getShopStatus();
}

/** Someone who'd like a bouquet at the event. Older entries have only a name. */
export interface ShopWish extends WishDetails {
	id: string;
	createdAt: string;
	/** The event it was left for; empty if none was current then. */
	eventId: string;
	eventName: string;
}

/** Newest first. */
export function listShopWishes(): ShopWish[] {
	return (
		getDb()
			.query(
				`SELECT w.*, e.name AS event_name FROM shop_wishes w
				   LEFT JOIN events e ON e.id = w.event_id
				  ORDER BY w.created_at DESC`,
			)
			.all() as {
			event_id: string | null;
			event_name: string | null;
			id: string;
			name: string;
			class_name: string;
			company: string;
			serial_number: string;
			date: string;
			created_at: string;
		}[]
	).map((row) => ({
		id: row.id,
		name: row.name,
		// A few early entries kept "Civilian" as their class instead.
		company: row.company || (row.class_name === CIVILIAN ? CIVILIAN : ""),
		serialNumber: row.serial_number,
		date: row.date,
		createdAt: row.created_at,
		eventId: row.event_id ?? "",
		eventName: row.event_name ?? "",
	}));
}

/**
 * Adds someone, unless the same name was left in the last ten minutes (a
 * double tap, or the form sent twice). Says whether it was added.
 */
export function addShopWish(wish: WishDetails) {
	const db = getDb();
	const since = new Date(Date.now() - 10 * 60_000).toISOString();
	const repeat = db
		.query(
			"SELECT 1 FROM shop_wishes WHERE lower(name) = lower($name) AND created_at > $since",
		)
		.get({ name: wish.name, since });
	if (repeat) return false;
	db.query(
		`INSERT INTO shop_wishes (id, name, company, serial_number, date, created_at, event_id)
		 VALUES ($id, $name, $company, $serialNumber, $date, $now,
		   (SELECT id FROM events WHERE status = 'current'))`,
	).run({
		id: crypto.randomUUID(),
		name: wish.name,
		company: wish.company,
		serialNumber: wish.serialNumber,
		date: wish.date,
		now: nowIso(),
	});
	return true;
}

export function deleteShopWish(id: string) {
	getDb().query("DELETE FROM shop_wishes WHERE id = $id").run({ id });
}
