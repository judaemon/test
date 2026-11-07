import type { RecipeItem } from "~/types/product";
import { getCustomSettings } from "./custom-repo";
import { asRecord, InputError, integer, text } from "./validate";

/** Checks a recipe against the flowers in Admin → Flowers; throws what to fix. */
export function parseRecipe(raw: unknown, label: string): RecipeItem[] {
	// The flowers staff keep in Admin → Flowers.
	const settings = getCustomSettings();
	const rows = Array.isArray(raw) ? raw : [];
	if (rows.length > 20)
		throw new InputError(`${label} recipe has too many flowers.`);
	return rows.map((row) => {
		const item = asRecord(row);
		const flower = text(item, "flower", { label: `${label} flower`, max: 40 });
		const option = settings.flowers.find((f) => f.name === flower);
		if (!option)
			throw new InputError(`${label}: “${flower}” isn’t in the flower list.`);
		const parsed: RecipeItem = { flower };
		// Flowers with one color name none; the rest pick one from Flowers.
		if (option.kind.colors) {
			const wanted = text(item, "color", {
				label: `${label} ${flower} color`,
				max: 30,
			}).toLowerCase();
			const color = option.colors.find((c) => c.name.toLowerCase() === wanted);
			if (!color)
				throw new InputError(
					`${label} ${flower} color must be one of ${option.colors.map((c) => c.name).join(", ")}.`,
				);
			parsed.color = color.name;
		}
		parsed.count = integer(item, "count", {
			label: `${label} ${flower} count`,
			min: 1,
			max: 500,
		});
		if (item.filler === true) parsed.filler = true;
		return parsed;
	});
}
