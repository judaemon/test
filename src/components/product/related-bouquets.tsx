import { Link } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";

import { BouquetCard } from "~/components/shop/bouquet-card";
import { relatedBouquets } from "~/lib/shop-filters";
import { useCatalog } from "~/lib/use-catalog";
import type { Product } from "~/types/product";

/** Other bouquets to look at, below a bouquet's details. */
export function RelatedBouquets(props: { product: Product }) {
	const catalog = useCatalog();
	const related = createMemo(() => relatedBouquets(props.product, catalog()));

	return (
		<Show when={related().length > 0}>
			<section
				aria-labelledby="related-heading"
				class="mt-14 border-t border-petal-100 pt-10"
			>
				<div class="flex items-baseline justify-between gap-4">
					<h2
						id="related-heading"
						class="font-display type-soft text-2xl font-semibold text-petal-900"
					>
						You may also like
					</h2>
					<Link
						to="/shop"
						hash="bouquets"
						class="shrink-0 rounded text-sm font-medium text-petal-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						View all <span aria-hidden="true">→</span>
					</Link>
				</div>
				{/* Swipes on smaller screens; the padding keeps focus rings and shadows in. */}
				<ul class="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-6 pt-3 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:gap-5 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
					<For each={related()}>
						{({ product, variant }) => (
							<li class="w-36 shrink-0 snap-start sm:w-44 lg:w-auto">
								<BouquetCard product={product} variant={variant} />
							</li>
						)}
					</For>
				</ul>
			</section>
		</Show>
	);
}
