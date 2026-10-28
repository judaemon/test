import { createFileRoute } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { ProductCard } from "~/components/product/product-card";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { useCatalog } from "~/lib/use-catalog";

export const Route = createFileRoute("/shop")({
	head: () => ({
		meta: [
			{ title: "Shop all bouquets · ORAIA" },
			{
				name: "description",
				content: "Every ORAIA bouquet, hand-tied fresh and delivered same day.",
			},
		],
	}),
	component: ShopPage,
});

function ShopPage() {
	const catalog = useCatalog();

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6 lg:px-8">
				<p class="text-sm font-medium uppercase tracking-[0.2em] text-petal-700">
					Shop
				</p>
				<h1 class="mt-2 font-display type-soft text-4xl font-semibold tracking-tight sm:text-5xl">
					All bouquets
				</h1>
				<p class="mt-3 max-w-xl text-petal-900/70">
					Hand-tied fresh every morning and delivered free, same day.
				</p>
				<Show
					when={catalog().length > 0}
					fallback={
						<div class="mt-16 flex flex-col items-center gap-3 text-center">
							<FlowerMark class="size-12" />
							<p class="font-display type-soft text-xl font-semibold">
								New bouquets are on their way
							</p>
							<p class="text-sm text-petal-900/65">Check back soon.</p>
						</div>
					}
				>
					<ul class="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
						<For each={catalog()}>
							{(product) => (
								<li>
									<ProductCard product={product} />
								</li>
							)}
						</For>
					</ul>
				</Show>
			</main>
			<SiteFooter />
		</div>
	);
}
