import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";

import type { Product, ProductVariant } from "~/types/product";

/** A bouquet's photo and name, opening its page on the given theme. */
export function BouquetCard(props: {
	product: Product;
	variant: ProductVariant;
}) {
	return (
		<Link
			to="/products/$productId"
			params={{ productId: props.product.id }}
			search={{ theme: props.variant.id }}
			class="group block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
		>
			<div class="relative aspect-square overflow-hidden rounded-2xl bg-petal-50 shadow-[0_12px_28px_-20px] shadow-petal-900/40 sm:rounded-3xl">
				<img
					src={props.variant.images[0]}
					alt={`${props.product.title}, ${props.variant.colorName}`}
					width={600}
					height={600}
					loading="lazy"
					class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
				/>
				<Show when={!props.variant.inStock}>
					<span class="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
						Not available
					</span>
				</Show>
			</div>
			<p class="mt-2 text-center font-display type-soft text-base font-semibold sm:text-lg">
				{props.product.title}
			</p>
		</Link>
	);
}
