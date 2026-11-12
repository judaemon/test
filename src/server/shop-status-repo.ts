import { DEFAULT_SHOP_STATUS, type ShopStatus } from "~/lib/shop-status";
import { getDb, nowIso } from "./db";

const KEY = "shop_status";

/** Open until staff close it; the closed notice's words, or the defaults. */
export function getShopStatus(): ShopStatus {
	const row = getDb()
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	if (!row) return { ...DEFAULT_SHOP_STATUS };
	const saved = JSON.parse(row.value) as Partial<ShopStatus>;
	return {
		closed: saved.closed === true,
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
		.run({ key: KEY, value: JSON.stringify(status), now: nowIso() });
	return getShopStatus();
}

/** Someone who'd like a bouquet at the event. */
export interface ShopWish {
	id: string;
	name: string;
	createdAt: string;
}

/** Newest first. */
export function listShopWishes(): ShopWish[] {
	return (
		getDb()
			.query("SELECT * FROM shop_wishes ORDER BY created_at DESC")
			.all() as { id: string; name: string; created_at: string }[]
	).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

/**
 * Adds a name, unless the same name was left in the last ten minutes (a
 * double tap, or the form sent twice). Says whether it was added.
 */
export function addShopWish(name: string) {
	const db = getDb();
	const since = new Date(Date.now() - 10 * 60_000).toISOString();
	const repeat = db
		.query(
			"SELECT 1 FROM shop_wishes WHERE lower(name) = lower($name) AND created_at > $since",
		)
		.get({ name, since });
	if (repeat) return false;
	db.query(
		"INSERT INTO shop_wishes (id, name, created_at) VALUES ($id, $name, $now)",
	).run({ id: crypto.randomUUID(), name, now: nowIso() });
	return true;
}

export function deleteShopWish(id: string) {
	getDb().query("DELETE FROM shop_wishes WHERE id = $id").run({ id });
}
