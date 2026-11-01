import { Link, useNavigate, useSearch } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import { FacetFilter } from "~/components/shop/facet-filter";
import { HowToOrder } from "~/components/shop/how-to-order";
import { FlowerMark, Petal, Sparkle } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { CONTACT, TAGLINE } from "~/lib/contact";
import { CUSTOM_IMAGE } from "~/lib/custom-bouquet";
import { formatPrice } from "~/lib/product";
import {
	bouquetFlowers,
	filterKey,
	joinList,
	parseList,
	type ShopFilters,
} from "~/lib/shop-filters";
import { useCatalog, useCustomSettings, useSizes } from "~/lib/use-catalog";
import type { Product, ProductVariant } from "~/types/product";

/** Smooth-scrolls to a section, or jumps there if the viewer prefers less motion. */
function scrollToId(id: string) {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	document
		.getElementById(id)
		?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** The storefront: Battalion Hop hero, the builder, the catalog, then how to order. */
export function ShopPage() {
	const catalog = useCatalog();
	const sizes = useSizes();
	const search = useSearch({ strict: false }) as () => ShopFilters;
	const navigate = useNavigate();
	const setFilter = (patch: ShopFilters) =>
		navigate({
			to: ".",
			search: (prev: ShopFilters) => ({ ...prev, ...patch }),
			replace: true,
			resetScroll: false,
		});
	// The cheapest custom bouquet: base fee, one stem and a wrapper on offer.
	const custom = useCustomSettings();
	const startingPrice = () => {
		const settings = custom();
		const stems = settings.flowers
			.filter((f) => f.enabled)
			.flatMap((f) => f.colors.filter((c) => c.enabled).map((c) => c.price));
		const wrappers = settings.wrappers
			.filter((w) => w.enabled)
			.map((w) => w.price);
		if (!stems.length || !wrappers.length) return undefined;
		return settings.baseFee + Math.min(...stems) + Math.min(...wrappers);
	};
	const chosenFlowers = () => parseList(search().flower);
	const chosenSizes = () => parseList(search().size);
	const filtering = () => chosenFlowers().length + chosenSizes().length > 0;
	const [stepsOpen, setStepsOpen] = createSignal(false);

	// A bouquet matches a filter if it has any of the ticked choices.
	const hasFlower = (product: Product, flowers: string[]) =>
		!flowers.length ||
		bouquetFlowers(product).some((f) => flowers.includes(filterKey(f)));
	const hasSize = (product: Product, sizes: string[]) =>
		!sizes.length || sizes.includes(product.size);

	// Filters offer only what some bouquet has. Each count is how many
	// bouquets that choice shows, given the other filter.
	const flowerOptions = createMemo(() => {
		const counts = new Map<string, number>();
		for (const product of catalog())
			for (const flower of bouquetFlowers(product))
				counts.set(
					flower,
					(counts.get(flower) ?? 0) + (hasSize(product, chosenSizes()) ? 1 : 0),
				);
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([name, count]) => ({ key: filterKey(name), label: name, count }));
	});
	const sizeOptions = createMemo(() =>
		sizes().flatMap((size) => {
			const all = catalog().filter((p) => p.size === size.id);
			const count = all.filter((p) => hasFlower(p, chosenFlowers())).length;
			return all.length ? [{ key: size.id, label: size.name, count }] : [];
		}),
	);

	// One card per signature bouquet; its themes are on the bouquet's page.
	// The card leads with an available theme, one with a chosen flower if
	// filtering by flower.
	const bouquets = () =>
		catalog().flatMap((product) => {
			if (!hasSize(product, chosenSizes())) return [];
			const flowers = chosenFlowers();
			const themes = product.variants.filter(
				(variant: ProductVariant) =>
					!flowers.length ||
					variant.recipe.some((item) =>
						flowers.includes(filterKey(item.flower)),
					),
			);
			const variant = themes.find((theme) => theme.inStock) ?? themes[0];
			return variant ? [{ product, variant }] : [];
		});

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="flex-1">
				{/* Apple-style hero: most of a screen tall, big centered type, two pill buttons. */}
				<header class="relative flex min-h-[calc(80svh-4rem)] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-petal-100),transparent_65%)] px-4 py-14 text-center">
					<Petal class="pointer-events-none absolute left-[8%] top-[18%] w-8 rotate-[-30deg] text-petal-200 motion-safe:animate-float-slow sm:w-10" />
					<Petal class="pointer-events-none absolute bottom-[16%] right-[10%] w-10 rotate-[140deg] text-petal-200 motion-safe:animate-float sm:w-12" />
					<Sparkle class="pointer-events-none absolute right-[18%] top-[14%] w-5 text-butter motion-safe:animate-float" />
					<Sparkle class="pointer-events-none absolute bottom-[22%] left-[16%] w-4 text-petal-300 motion-safe:animate-float-slow" />

					<div class="flex items-center gap-3 sm:gap-4">
						<FlowerMark class="size-16 sm:size-24" />
						<span class="font-display type-soft text-5xl font-semibold tracking-[0.25em] text-black sm:text-7xl">
							ORAIA
						</span>
					</div>
					<p class="mt-4 font-display text-xl italic text-petal-900/70 sm:text-3xl">
						{TAGLINE}
					</p>
					<p class="mt-10 text-sm font-medium uppercase tracking-[0.3em] text-petal-900/60 sm:mt-14 sm:text-base">
						Soft launch for
					</p>
					<h1 class="mt-3 font-display type-soft text-5xl font-semibold leading-[0.95] tracking-tight text-balance sm:text-7xl lg:text-8xl">
						BATTALION HOP 2027
					</h1>
					<div class="mt-10 flex flex-col items-center gap-3 sm:flex-row">
						<button
							type="button"
							onClick={() => {
								scrollToId("bouquets");
							}}
							class="inline-flex h-12 items-center justify-center rounded-full bg-petal-700 px-8 text-base font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
						>
							Shop bouquets
						</button>
						<button
							type="button"
							onClick={() => {
								setStepsOpen(true);
								scrollToId("how-to-order");
							}}
							class="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-petal-200 bg-white/70 px-8 text-base font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
						>
							How to order
							<span aria-hidden="true">↓</span>
						</button>
					</div>
				</header>

				<div class="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:max-w-7xl lg:px-8">
					<div class="min-w-0">
						<section
							aria-labelledby="custom-heading"
							class="grid overflow-hidden rounded-3xl border border-petal-200 bg-white md:grid-cols-[minmax(0,1fr)_17rem]"
						>
							<div class="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-8">
								<img
									src={CUSTOM_IMAGE}
									alt=""
									width={128}
									height={128}
									class="size-24 shrink-0 rounded-2xl sm:size-32"
								/>
								<div class="min-w-0">
									<p class="text-xs font-semibold uppercase tracking-[0.2em] text-petal-700">
										Made your way
									</p>
									<h2
										id="custom-heading"
										class="mt-1 font-display type-soft text-2xl font-semibold sm:text-3xl"
									>
										Customize your bouquet
									</h2>
									<Show
										when={custom().enabled}
										fallback={
											<p class="mt-2 max-w-xl text-petal-900/70">
												Custom bouquets are paused for now. Message us and we’ll
												make one for you.
											</p>
										}
									>
										<p class="mt-2 max-w-xl text-petal-900/70">
											Pick your flowers, colors and wrapper
											{custom().money.enabled
												? ", or add cash for a money bouquet"
												: ""}
											. The price updates as you build.
										</p>
										<ol class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-petal-900/80">
											<For
												each={[
													"Flowers & colors",
													...(custom().money.enabled
														? ["Money (optional)"]
														: []),
													"Wrapper",
												]}
											>
												{(step, index) => (
													<li class="flex items-center gap-2">
														<span
															aria-hidden="true"
															class="flex size-6 items-center justify-center rounded-full bg-petal-100 text-xs font-semibold text-petal-700"
														>
															{index() + 1}
														</span>
														{step}
													</li>
												)}
											</For>
										</ol>
										<div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
											<Link
												to="/custom"
												class="inline-flex h-11 items-center gap-2 rounded-full bg-petal-700 px-6 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
											>
												Build your bouquet
												<span aria-hidden="true">→</span>
											</Link>
											<Show when={startingPrice()}>
												{(price) => (
													<p class="text-sm text-petal-900/65">
														From{" "}
														<span class="font-semibold text-petal-900">
															{formatPrice(price(), "PHP")}
														</span>
													</p>
												)}
											</Show>
										</div>
									</Show>
								</div>
							</div>
							<div class="flex flex-col justify-center gap-3 border-t border-petal-100 bg-petal-50/60 p-6 sm:p-8 md:border-l md:border-t-0">
								<p class="font-semibold">
									{custom().enabled
										? "Something else in mind?"
										: "Order by message"}
								</p>
								<p class="-mt-2 text-sm text-petal-900/65">
									Send us a photo or an idea and we’ll quote it.
								</p>
								<a
									href={CONTACT.facebookUrl}
									target="_blank"
									rel="noreferrer"
									class="inline-flex h-10 items-center gap-2.5 rounded-full border border-petal-200 bg-white px-4 text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-4 shrink-0 fill-[#1877f2]"
									>
										<path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
									</svg>
									Message on Facebook
								</a>
								<a
									href={CONTACT.telegramUrl}
									target="_blank"
									rel="noreferrer"
									class="inline-flex h-10 items-center gap-2.5 rounded-full border border-petal-200 bg-white px-4 text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 24 24"
										class="size-4 shrink-0 fill-[#229ed9]"
									>
										<path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.6 8.2-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9l11.3-4.4c.5-.2 1 .1.7 1Z" />
									</svg>
									Message on Telegram
								</a>
							</div>
						</section>

						<h2
							id="bouquets"
							class="mt-14 scroll-mt-24 font-display type-soft text-2xl font-semibold"
						>
							Signature bouquets
						</h2>
						<Show when={catalog().length > 0}>
							<div class="mt-4 flex flex-wrap items-center gap-2">
								<FacetFilter
									label="Flower"
									options={flowerOptions()}
									selected={chosenFlowers()}
									onChange={(flowers) =>
										setFilter({ flower: joinList(flowers) })
									}
								/>
								<Show when={sizeOptions().length > 1}>
									<FacetFilter
										label="Size"
										options={sizeOptions()}
										selected={chosenSizes()}
										onChange={(chosen) => setFilter({ size: joinList(chosen) })}
									/>
								</Show>
								<Show when={filtering()}>
									<button
										type="button"
										onClick={() =>
											setFilter({ flower: undefined, size: undefined })
										}
										class="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-petal-900/70 transition-colors outline-none hover:bg-petal-100 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500"
									>
										Reset
										<span aria-hidden="true">✕</span>
									</button>
								</Show>
								<p class="ml-auto text-sm text-petal-900/60" aria-live="polite">
									<Show
										when={filtering()}
										fallback={`${catalog().length} bouquets`}
									>
										{bouquets().length} of {catalog().length} bouquets
									</Show>
								</p>
							</div>
						</Show>
						<Show
							when={bouquets().length > 0}
							fallback={
								<div class="mt-10 flex flex-col items-center gap-3 text-center">
									<FlowerMark class="size-12" />
									<Show
										when={filtering()}
										fallback={
											<>
												<p class="font-display type-soft text-xl font-semibold">
													New bouquets are on their way
												</p>
												<p class="text-sm text-petal-900/65">
													Check back soon.
												</p>
											</>
										}
									>
										<p class="font-display type-soft text-xl font-semibold">
											No bouquets match
										</p>
										<p class="text-sm text-petal-900/65">
											Try another flower or size, or{" "}
											<Link
												to="/custom"
												class="font-medium text-petal-700 underline"
											>
												build your own
											</Link>
											.
										</p>
									</Show>
								</div>
							}
						>
							<ul class="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-5 lg:grid-cols-5">
								<For each={bouquets()}>
									{({ product, variant }) => (
										<li>
											<Link
												to="/products/$productId"
												params={{ productId: product.id }}
												search={{ theme: variant.id }}
												class="group block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
											>
												<div class="relative aspect-square overflow-hidden rounded-2xl bg-petal-50 shadow-[0_12px_28px_-20px] shadow-petal-900/40 sm:rounded-3xl">
													<img
														src={variant.images[0]}
														alt={`${product.title}, ${variant.colorName}`}
														width={600}
														height={600}
														loading="lazy"
														class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
													/>
													<Show when={!variant.inStock}>
														<span class="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
															Not available
														</span>
													</Show>
												</div>
												<p class="mt-2 text-center font-display type-soft text-base font-semibold sm:text-lg">
													{product.title}
												</p>
											</Link>
										</li>
									)}
								</For>
							</ul>
						</Show>

						<HowToOrder
							class="mt-16"
							open={stepsOpen()}
							onOpenChange={setStepsOpen}
						/>
					</div>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
