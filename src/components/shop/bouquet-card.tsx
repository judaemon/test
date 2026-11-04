import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { photoSrc } from "~/lib/photos";
import { formatPrice, startingPrice, stockLabel } from "~/lib/product";
import { cn } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/product";

/** A bouquet's photo, name and price, opening its page on the given theme. */
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
			class="group block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
		>
			<div class="relative aspect-square overflow-hidden rounded-2xl bg-petal-50 shadow-[0_12px_28px_-20px] shadow-petal-900/40 sm:rounded-3xl">
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
			<div class="mt-2.5 text-center sm:mt-3">
				<p class="font-display type-soft text-base font-semibold leading-tight sm:text-lg">
					{props.product.title}
				</p>
				<p
					class={cn(
						"mt-0.5 text-xs tabular-nums tracking-wide sm:mt-1 sm:text-sm",
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
			</div>
		</Link>
	);
}
