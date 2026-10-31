import {
	type CustomBouquetSettings,
	DEFAULT_CUSTOM_SETTINGS,
	withAllFlowers,
} from "~/lib/custom-bouquet";
import { getDb, nowIso } from "./db";

const KEY = "custom_bouquet";

/** The builder's prices, colors and wrappers; sample values until saved. */
export function getCustomSettings(): CustomBouquetSettings {
	const row = getDb()
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	if (!row) return DEFAULT_CUSTOM_SETTINGS;
	return withAllFlowers({
		...(JSON.parse(row.value) as Partial<CustomBouquetSettings>),
		saved: true,
	});
}

export function saveCustomSettings(
	settings: Omit<CustomBouquetSettings, "saved">,
) {
	getDb()
		.query(
			`INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		)
		.run({ key: KEY, value: JSON.stringify(settings), now: nowIso() });
	return getCustomSettings();
}

/**
 * Moves wrappers in or out of stock for built bouquets: `-1` when an order is
 * placed, `+1` when it's cancelled. Run inside the order's transaction.
 * Returns the wrapper that ran out, if taking failed.
 */
export function adjustWrapperStock(
	lines: { custom?: { wrapperId: string }; quantity: number }[],
	direction: 1 | -1,
): string | null {
	const db = getDb();
	const row = db
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	// Unsaved sample settings don't count wrappers.
	if (!row) return null;
	const settings = JSON.parse(row.value) as Partial<CustomBouquetSettings>;
	let changed = false;
	for (const line of lines) {
		const wrapper = settings.wrappers?.find(
			(w) => w.id === line.custom?.wrapperId,
		);
		if (wrapper?.stock === undefined) continue;
		const stock = wrapper.stock + direction * line.quantity;
		if (stock < 0) return wrapper.name;
		wrapper.stock = stock;
		changed = true;
	}
	if (changed)
		db.query(
			"UPDATE settings SET value = $value, updated_at = $now WHERE key = $key",
		).run({ key: KEY, value: JSON.stringify(settings), now: nowIso() });
	return null;
}
