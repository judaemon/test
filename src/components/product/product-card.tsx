import { Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { formatPrice, getVariantPrice, swatchBackground } from "~/lib/product";
import type { Product } from "~/types/product";

const MAX_DOTS = 5;

export function ProductCard(props: { product: Product }) {
	const variants = () => props.product.variants;
	// Lead with a color that can actually be bought.
	const cover = () => variants().find((v) => v.inStock) ?? variants()[0];
	const prices = () =>
		variants().map((variant) => getVariantPrice(props.product, variant));
	const lowest = () => Math.min(...prices());
	const priceVaries = () => new Set(prices()).size > 1;
	const soldOut = () => variants().every((variant) => !variant.inStock);

	return (
		<Link
			to="/products/$productId"
			params={{ productId: props.product.id }}
			class="group block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
		>
			<div class="relative aspect-square overflow-hidden rounded-3xl bg-petal-50 shadow-[0_18px_40px_-24px] shadow-petal-900/40">
				<img
					src={cover()?.images[0]}
					alt=""
					width={600}
					height={600}
					loading="lazy"
					class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
				/>
				<Show when={soldOut()}>
					<span class="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-petal-900">
						Sold out
					</span>
				</Show>
			</div>
			<div class="mt-3 flex items-start justify-between gap-3 px-1">
				<div class="min-w-0">
					<p class="font-display type-soft text-lg font-semibold leading-snug text-petal-900">
						{props.product.title}
					</p>
					<p class="mt-1.5 flex items-center gap-1">
						<For each={variants().slice(0, MAX_DOTS)}>
							{(variant) => (
								<span
									aria-hidden="true"
									class="size-3.5 rounded-full border border-black/10"
									style={{
										background: swatchBackground(
											variant.colorHex,
											variant.colorHex2,
										),
									}}
								/>
							)}
						</For>
						<Show when={variants().length > MAX_DOTS}>
							<span aria-hidden="true" class="text-xs text-petal-900/55">
								+{variants().length - MAX_DOTS}
							</span>
						</Show>
						<span class="sr-only">
							{variants().length} {variants().length === 1 ? "color" : "colors"}
						</span>
					</p>
				</div>
				<p class="whitespace-nowrap text-sm font-medium text-petal-700">
					{priceVaries() ? "From " : ""}
					{formatPrice(lowest(), props.product.currency)}
				</p>
			</div>
		</Link>
	);
}
