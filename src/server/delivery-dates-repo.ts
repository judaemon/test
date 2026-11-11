import { DEFAULT_DELIVERY_DATES, tidyDates } from "~/lib/delivery-dates";
import { getDb, nowIso } from "./db";

const KEY = "delivery_dates";

/** Every delivery date staff set, past ones too, earliest first. */
export function getDeliveryDates(): string[] {
	const row = getDb()
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	if (!row) return [...DEFAULT_DELIVERY_DATES];
	const saved = JSON.parse(row.value) as { dates?: unknown };
	return tidyDates(
		Array.isArray(saved.dates)
			? saved.dates.filter((d): d is string => typeof d === "string")
			: [],
	);
}

export function saveDeliveryDates(dates: readonly string[]) {
	getDb()
		.query(
			`INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		)
		.run({
			key: KEY,
			value: JSON.stringify({ dates: tidyDates(dates) }),
			now: nowIso(),
		});
	return getDeliveryDates();
}
