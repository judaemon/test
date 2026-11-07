import { For, Index, Show } from "solid-js";

import { FlowerSelect } from "~/components/admin/flower-select";
import { adminButton, adminInput } from "~/components/admin/ui";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { findFlowerKind, flowerKinds } from "~/lib/custom-bouquet";
import { useCustomSettings, useFlowerPhotos } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import type { RecipeItem } from "~/types/product";

/** A recipe row as typed: the count stays text until it's saved. */
export interface RecipeDraft {
	key: string;
	flower: string;
	count: string;
	color: string;
	filler: boolean;
}

export const newRecipeRow = (): RecipeDraft => ({
	key: crypto.randomUUID(),
	flower: "",
	count: "1",
	color: "",
	filler: false,
});

export const toRecipeDraft = (recipe: RecipeItem[]): RecipeDraft[] =>
	recipe.map((item) => ({
		key: crypto.randomUUID(),
		flower: item.flower,
		count: String(item.count ?? 1),
		color: item.color ?? "",
		filler: item.filler ?? false,
	}));

/** Live total while editing; filler isn't counted. */
export const draftStems = (recipe: RecipeDraft[]) =>
	recipe.reduce(
		(sum, item) =>
			sum +
			(item.flower && !item.filler ? Math.max(0, Number(item.count) || 0) : 0),
		0,
	);

/** What a recipe costs at the prices in Admin → Flowers. */
export function useRecipeCost() {
	const custom = useCustomSettings();
	return (rows: RecipeDraft[]) =>
		rows.reduce((sum, item) => {
			const colors =
				custom().flowers.find((f) => f.name === item.flower)?.colors ?? [];
			const color =
				colors.length === 1
					? colors[0]
					: colors.find((c) => c.name === item.color);
			return sum + (color?.price ?? 0) * Math.max(0, Number(item.count) || 0);
		}, 0);
}

/**
 * A recipe's rows: each a flower from Admin → Flowers, its color, how many,
 * and whether it's filler. Used for signature bouquets and custom orders.
 */
export function RecipeRows(props: {
	rows: RecipeDraft[];
	onPatch: (row: number, patch: Partial<RecipeDraft>) => void;
	onChange: (rows: RecipeDraft[]) => void;
	/** The add button's text. */
	addLabel?: string;
}) {
	const custom = useCustomSettings();
	const flowerPhoto = useFlowerPhotos();
	const flowerKind = (name: string) => findFlowerKind(name, custom());
	/** For the picker, where no color is chosen yet: any photo of the flower. */
	const listPhoto = (name: string) =>
		flowerPhoto(name) ??
		custom()
			.flowers.find((f) => f.name === name)
			?.colors.find((c) => c.image)?.image;
	const flowerGroups = () => [
		{ label: "Flowers", kinds: flowerKinds(custom()) },
	];
	/** A flower's colors, from Admin → Flowers. */
	const flowerColors = (flower: string) =>
		custom().flowers.find((f) => f.name === flower)?.colors ?? [];

	return (
		<>
			<ul class="flex flex-col gap-2">
				<Index each={props.rows}>
					{(item, row) => (
						<li class="flex flex-wrap items-center gap-2 border-b border-petal-50 pb-2 sm:flex-nowrap sm:border-0 sm:pb-0">
							<Show
								when={flowerPhoto(item().flower, item().color)}
								fallback={
									<span
										title="No photo yet. Add one in Flowers."
										class="size-10 shrink-0 rounded-lg border-2 border-dashed border-petal-200"
									/>
								}
							>
								{(src) => (
									<ZoomableImage
										src={src()}
										alt={item().flower}
										caption={item().flower}
										hoverPreview
										class="size-10 shrink-0 rounded-lg border border-black/10 object-cover"
									/>
								)}
							</Show>
							<FlowerSelect
								label={`Kind of flower ${row + 1}`}
								groups={flowerGroups()}
								value={item().flower}
								photo={listPhoto}
								onChange={(flower) =>
									props.onPatch(row, {
										flower,
										// Start with its first color; a single color isn't picked.
										color: flowerKind(flower)?.colors
											? (flowerColors(flower)[0]?.name ?? "")
											: "",
									})
								}
							/>
							<Show when={flowerKind(item().flower)?.colors}>
								<select
									value={item().color}
									onChange={(e) =>
										props.onPatch(row, { color: e.currentTarget.value })
									}
									aria-label={`${item().flower} color`}
									class={cn(adminInput, "min-w-0 flex-1 sm:w-36 sm:flex-none")}
								>
									<Show
										when={
											!flowerColors(item().flower).some(
												(c) => c.name === item().color,
											)
										}
									>
										<option value={item().color} disabled>
											{item().color || "Pick a color"}
										</option>
									</Show>
									<For each={flowerColors(item().flower)}>
										{(color) => (
											<option
												value={color.name}
												selected={color.name === item().color}
											>
												{color.name}
												{color.enabled ? "" : " (not in custom bouquets)"}
											</option>
										)}
									</For>
								</select>
							</Show>
							<Show
								when={item().flower}
								fallback={<span class="flex-1 sm:w-24 sm:flex-none" />}
							>
								<span aria-hidden="true" class="text-petal-900/50">
									×
								</span>
								<input
									type="number"
									min="1"
									max="500"
									step="1"
									inputMode="numeric"
									value={item().count}
									onInput={(e) =>
										props.onPatch(row, { count: e.currentTarget.value })
									}
									aria-label={`How many ${item().flower}`}
									class={cn(adminInput, "w-20 tabular-nums")}
								/>
								<label
									title="Filler isn’t counted in the number of flowers"
									class="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-petal-900/70"
								>
									<input
										type="checkbox"
										checked={item().filler}
										onChange={(e) =>
											props.onPatch(row, { filler: e.currentTarget.checked })
										}
										class="size-4 accent-petal-700"
									/>
									Filler
								</label>
							</Show>
							<button
								type="button"
								class={cn(adminButton.ghost, "text-error-foreground")}
								onClick={() =>
									props.onChange(props.rows.filter((_, i) => i !== row))
								}
								aria-label={`Remove flower ${row + 1}`}
							>
								✕
							</button>
						</li>
					)}
				</Index>
			</ul>
			<button
				type="button"
				class={cn(adminButton.ghost, "mt-1")}
				onClick={() => props.onChange([...props.rows, newRecipeRow()])}
			>
				{props.addLabel ?? "+ Add flower"}
			</button>
		</>
	);
}
