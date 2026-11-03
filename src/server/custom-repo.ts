import {
	type CustomBouquetSettings,
	DEFAULT_CUSTOM_SETTINGS,
	withDefaults,
} from "~/lib/custom-bouquet";
import { getDb, nowIso } from "./db";
import { listShopFlowers } from "./flowers-repo";
import { listSizes } from "./sizes-repo";
import { InputError } from "./validate";
import { listWrappers } from "./wrappers-repo";

const KEY = "custom_bouquet";

/** The builder's fees, flowers, wrappers and sizes; sample fees until saved. */
export function getCustomSettings(): CustomBouquetSettings {
	const row = getDb()
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	const flowers = listShopFlowers();
	const wrappers = listWrappers();
	const sizes = listSizes().map(({ usedIn: _usedIn, ...size }) => size);
	if (!row) return { ...DEFAULT_CUSTOM_SETTINGS, flowers, wrappers, sizes };
	return withDefaults(
		{
			...(JSON.parse(row.value) as Partial<CustomBouquetSettings>),
			saved: true,
		},
		flowers,
		wrappers,
		sizes,
	);
}

/** Saves the fees and money settings; flowers, wrappers and sizes have their own tables. */
export function saveCustomSettings(
	settings: Omit<
		CustomBouquetSettings,
		"saved" | "flowers" | "wrappers" | "sizes"
	>,
) {
	getDb()
		.query(
			`INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		)
		.run({ key: KEY, value: JSON.stringify(settings), now: nowIso() });
	return getCustomSettings();
}

/** The builder needs a flower and a wrapper to offer while it's switched on. */
export function checkBuilderCanSell(settings: CustomBouquetSettings) {
	if (!settings.enabled) return;
	if (!settings.flowers.some((f) => f.enabled))
		throw new InputError(
			"Keep at least one flower marked for custom bouquets, or switch the builder off in Custom bouquets.",
		);
	if (!settings.wrappers.some((w) => w.enabled))
		throw new InputError(
			"Keep at least one wrapper offered, or switch the builder off in Custom bouquets.",
		);
}
