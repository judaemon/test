import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { photoSrc } from "~/lib/photos";
import { formatPrice, startingPrice, stockLabel } from "~/lib/product";
import { cn } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/product";

/**
 * A bouquet's photo, name and price, opening its page on the given theme.
 * Drawn as a card with a "View" button so it reads as something to tap.
 */
export function BouquetCard(props: {
	product: Product;
	variant: ProductVariant;
}) {
	const price = () => startingPrice(props.product);
	const soldOut = () => !props.product.variants.some((v) => v.inStock);
	return (
		<Link
			to="/products/$productId"
			params={{ productId: props.product.id }}
			search={{ theme: props.variant.id }}
			class="group flex h-full flex-col rounded-2xl border border-petal-100 bg-white p-1.5 shadow-[0_8px_24px_-18px] shadow-petal-900/30 transition-all duration-300 outline-none hover:-translate-y-1 hover:border-petal-200 hover:shadow-[0_20px_40px_-20px] hover:shadow-petal-900/40 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream active:scale-[0.97] motion-reduce:transform-none sm:rounded-3xl sm:p-2.5"
		>
			<div class="relative aspect-square overflow-hidden rounded-xl bg-petal-50 sm:rounded-2xl">
				<img
					src={photoSrc(props.variant.images[0], "thumb")}
					alt={`${props.product.title}, ${props.variant.colorName}`}
					width={600}
					height={600}
					loading="lazy"
					class={cn(
						"size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]",
						soldOut() && "opacity-70 saturate-[0.6]",
					)}
				/>
				<Show when={!props.variant.inStock || props.variant.preorder}>
					<span class="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
						{props.variant.inStock ? "Pre-order" : stockLabel(props.variant)}
					</span>
				</Show>
			</div>
			<div class="flex flex-1 flex-col items-center px-1 pt-2 pb-1 text-center sm:pt-3">
				<p class="font-display type-soft text-base font-semibold leading-tight sm:text-lg">
					{props.product.title}
				</p>
				<p
					class={cn(
						"mt-0.5 mb-2 text-xs tabular-nums tracking-wide sm:mt-1 sm:mb-3 sm:text-sm",
						soldOut() ? "text-petal-900/40" : "text-petal-900/70",
					)}
				>
					<Show when={price().varies}>
						<span class="text-[0.85em] text-petal-900/50">From </span>
					</Show>
					<span class={cn("font-medium", !soldOut() && "text-petal-900")}>
						{formatPrice(price().amount, props.product.currency)}
					</span>
				</p>
				<span
					aria-hidden="true"
					class="mt-auto inline-flex items-center gap-1 rounded-full bg-petal-50 px-3 py-1 text-xs font-medium text-petal-700 transition-colors duration-300 group-hover:bg-petal-700 group-hover:text-white sm:px-4 sm:py-1.5 sm:text-sm"
				>
					View
					<span class="transition-transform duration-300 group-hover:translate-x-0.5">
						→
					</span>
				</span>
			</div>
		</Link>
	);
}
