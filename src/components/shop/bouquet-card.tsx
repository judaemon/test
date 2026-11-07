import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { SalePrice } from "~/components/shop/sale-price";
import { photoSrc } from "~/lib/photos";
import { startingPrice, stockLabel } from "~/lib/product";
import { cn } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/product";

/**
 * A bouquet's photo, name and price, opening its page on the given theme.
 * The arrow on the photo says it opens, for phones that can't hover.
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
			class="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream sm:rounded-3xl"
		>
			<div class="relative aspect-[4/5] overflow-hidden rounded-2xl bg-petal-50 shadow-[0_12px_28px_-20px] shadow-petal-900/40 transition-shadow duration-500 group-hover:shadow-[0_24px_44px_-22px] group-hover:shadow-petal-900/50 sm:rounded-3xl">
				<img
					src={photoSrc(props.variant.images[0], "thumb")}
					alt={`${props.product.title}, ${props.variant.colorName}`}
					width={600}
					height={750}
					loading="lazy"
					class={cn(
						"size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transform-none",
						soldOut() && "opacity-70 saturate-[0.6]",
					)}
				/>
				{/* A soft veil on hover, so the arrow stays legible on any photo. */}
				<div
					aria-hidden="true"
					class="absolute inset-0 bg-gradient-to-t from-petal-900/25 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
				/>
				<Show when={!props.variant.inStock || props.variant.preorder}>
					<span class="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
						{props.variant.inStock ? "Pre-order" : stockLabel(props.variant)}
					</span>
				</Show>
				<span
					aria-hidden="true"
					class="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-white/90 text-petal-900 shadow-sm backdrop-blur-sm transition-colors duration-500 group-hover:bg-petal-700 group-hover:text-white sm:bottom-3 sm:right-3 sm:size-10"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-3.5 transition-transform duration-500 group-hover:-rotate-45 sm:size-4"
					>
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
				</span>
			</div>
			<div class="mt-2.5 flex flex-col gap-0.5 px-0.5 sm:mt-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<p class="truncate font-display type-soft text-base font-semibold leading-tight transition-colors duration-300 group-hover:text-petal-700 sm:text-lg">
					{props.product.title}
				</p>
				<p
					class={cn(
						"shrink-0 text-xs tabular-nums sm:text-sm",
						soldOut() ? "text-petal-900/40" : "text-petal-900/70",
					)}
				>
					<Show when={price().varies}>
						<span class="text-[0.85em] text-petal-900/50">From </span>
					</Show>
					<SalePrice
						price={price().amount}
						currency={props.product.currency}
						item={{
							productId: props.product.id,
							arrangement: props.product.arrangement,
						}}
						class={cn("font-medium", !soldOut() && "text-petal-900")}
						compact
					/>
				</p>
			</div>
		</Link>
	);
}
