import { DEFAULT_DELIVERY_DATES, tidyDates } from "~/lib/delivery-dates";
import type { ShopEvent } from "~/lib/events";
import { getDb, nowIso } from "./db";
import { currentEvent, setEventDeliveryDates } from "./events-repo";

const KEY = "delivery_dates";

/**
 * The days checkout offers: the current event's delivery days, past ones
 * too, earliest first. With no current event, the shop's own list.
 */
export function getDeliveryDates(): string[] {
	return currentEvent()?.deliveryDates ?? getShopDeliveryDates();
}

/** Where the delivery days come from now: the current event, if there is one. */
export function deliveryDatesEvent(): Pick<ShopEvent, "id" | "name"> | null {
	const event = currentEvent();
	return event ? { id: event.id, name: event.name } : null;
}

/** The list used when there's no current event. */
function getShopDeliveryDates(): string[] {
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

/** Saves the days checkout offers: onto the current event, if there is one. */
export function saveDeliveryDates(dates: readonly string[]) {
	const event = currentEvent();
	if (event) {
		setEventDeliveryDates(event.id, tidyDates(dates));
		return getDeliveryDates();
	}
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
