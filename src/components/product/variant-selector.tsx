import { createSignal, createUniqueId, For, Show } from "solid-js";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { swatchBackground } from "~/lib/product";
import { cn } from "~/lib/utils";
import type { ProductVariant } from "~/types/product";

interface VariantSelectorProps {
	variants: ProductVariant[];
	selectedId: string;
	onSelect: (variant: ProductVariant) => void;
	/** Fired on hover/focus so the parent can warm that variant's images. */
	onPreview?: (variant: ProductVariant) => void;
	class?: string;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export function VariantSelector(props: VariantSelectorProps) {
	const labelId = createUniqueId();
	const swatchRefs: HTMLButtonElement[] = [];
	const [hoveredId, setHoveredId] = createSignal<string | null>(null);

	const selected = () =>
		props.variants.find((variant) => variant.id === props.selectedId);
	// Mirror Shein: the label previews whichever swatch is under the pointer.
	const displayed = () =>
		props.variants.find((variant) => variant.id === hoveredId()) ?? selected();

	const selectAt = (index: number) => {
		const variant = props.variants[index];
		if (!variant) return;
		props.onSelect(variant);
		swatchRefs[index]?.focus();
	};

	const handleKeyDown = (event: KeyboardEvent, index: number) => {
		const last = props.variants.length - 1;
		let target: number | null = null;
		if (NEXT_KEYS.has(event.key)) target = index === last ? 0 : index + 1;
		else if (PREV_KEYS.has(event.key)) target = index === 0 ? last : index - 1;
		else if (event.key === "Home") target = 0;
		else if (event.key === "End") target = last;
		if (target === null) return;
		event.preventDefault();
		selectAt(target);
	};

	return (
		<div class={cn("flex flex-col gap-3", props.class)}>
			<p id={labelId} class="text-sm">
				<span class="text-muted-foreground">Color: </span>
				<span class="font-semibold">{displayed()?.colorName}</span>
				<Show when={displayed() && !displayed()?.inStock}>
					<span class="text-muted-foreground"> (sold out)</span>
				</Show>
			</p>

			<div
				role="radiogroup"
				aria-labelledby={labelId}
				class="flex flex-wrap gap-3"
				onPointerLeave={() => setHoveredId(null)}
			>
				<For each={props.variants}>
					{(variant, index) => {
						const isSelected = () => variant.id === props.selectedId;
						return (
							<Tooltip openDelay={150} closeDelay={0} placement="bottom">
								<TooltipTrigger
									as="button"
									type="button"
									ref={(el: HTMLButtonElement) => {
										swatchRefs[index()] = el;
									}}
									role="radio"
									aria-checked={isSelected()}
									aria-label={
										variant.inStock
											? variant.colorName
											: `${variant.colorName}, sold out`
									}
									tabindex={isSelected() ? 0 : -1}
									data-variant-id={variant.id}
									onClick={() => props.onSelect(variant)}
									onKeyDown={(event: KeyboardEvent) =>
										handleKeyDown(event, index())
									}
									onPointerEnter={() => {
										setHoveredId(variant.id);
										props.onPreview?.(variant);
									}}
									onFocus={() => props.onPreview?.(variant)}
									class={cn(
										"relative size-10 shrink-0 cursor-pointer rounded-full p-0.5 ring-offset-2 ring-offset-background transition-shadow outline-none",
										"focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
										isSelected()
											? "ring-2 ring-foreground"
											: "ring-1 ring-transparent hover:ring-muted-foreground/50",
									)}
								>
									<Show
										when={variant.swatchImage}
										fallback={
											<span
												aria-hidden="true"
												class={cn(
													"block size-full rounded-full border border-black/10",
													!variant.inStock && "opacity-50",
												)}
												style={{
													background: swatchBackground(
														variant.colorHex,
														variant.colorHex2,
													),
												}}
											/>
										}
									>
										{(src) => (
											<img
												src={src()}
												alt=""
												class={cn(
													"size-full rounded-full border border-black/10 object-cover",
													!variant.inStock && "opacity-50",
												)}
											/>
										)}
									</Show>
									<Show when={!variant.inStock}>
										<span
											aria-hidden="true"
											class="pointer-events-none absolute inset-0.5 flex overflow-hidden rounded-full items-center justify-center"
										>
											<span class="h-0.5 w-full shrink-0 -rotate-45 bg-foreground/60" />
										</span>
									</Show>
								</TooltipTrigger>
								<TooltipContent class="px-2.5 py-1 text-xs">
									{variant.colorName}
									<Show when={!variant.inStock}>
										<span class="text-muted-foreground"> · Sold out</span>
									</Show>
								</TooltipContent>
							</Tooltip>
						);
					}}
				</For>
			</div>
		</div>
	);
}
