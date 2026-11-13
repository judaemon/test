import {
	DEFAULT_SHOP_STATUS,
	type ShopStatus,
	type WishDetails,
} from "~/lib/shop-status";
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

/** Someone who'd like a bouquet at the event. Older entries have only a name. */
export interface ShopWish extends WishDetails {
	id: string;
	createdAt: string;
}

/** Newest first. */
export function listShopWishes(): ShopWish[] {
	return (
		getDb()
			.query("SELECT * FROM shop_wishes ORDER BY created_at DESC")
			.all() as {
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
		className: row.class_name,
		company: row.company,
		serialNumber: row.serial_number,
		date: row.date,
		createdAt: row.created_at,
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
		`INSERT INTO shop_wishes (id, name, class_name, company, serial_number, date, created_at)
		 VALUES ($id, $name, $className, $company, $serialNumber, $date, $now)`,
	).run({
		id: crypto.randomUUID(),
		name: wish.name,
		className: wish.className,
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
