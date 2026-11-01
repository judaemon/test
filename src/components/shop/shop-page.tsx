import { Link, useNavigate, useSearch } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";

import { HowToOrder } from "~/components/shop/how-to-order";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { CONTACT, TAGLINE } from "~/lib/contact";
import {
	bouquetFlowers,
	filterKey,
	type ShopFilters,
} from "~/lib/shop-filters";
import { useCatalog, useSizes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/product";

/** The storefront: Battalion Hop launch header, the builder, then the catalog. */
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

	// Filters offer only what some bouquet has. Each count is how many
	// bouquets that choice would show, given the other filter.
	const hasFlower = (product: Product, flower?: string) =>
		!flower || bouquetFlowers(product).some((f) => filterKey(f) === flower);
	const hasSize = (product: Product, size?: string) =>
		!size || product.size === size;
	const flowerOptions = createMemo(() => {
		const counts = new Map<string, number>();
		for (const product of catalog())
			for (const flower of bouquetFlowers(product))
				counts.set(
					flower,
					(counts.get(flower) ?? 0) + (hasSize(product, search().size) ? 1 : 0),
				);
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([name, count]) => ({ key: filterKey(name), label: name, count }));
	});
	const sizeOptions = createMemo(() =>
		sizes().flatMap((size) => {
			const all = catalog().filter((p) => p.size === size.id);
			const count = all.filter((p) => hasFlower(p, search().flower)).length;
			return all.length ? [{ key: size.id, label: size.name, count }] : [];
		}),
	);
	const flowerLabel = () =>
		flowerOptions().find((o) => o.key === search().flower)?.label;
	const sizeLabel = () =>
		sizeOptions().find((o) => o.key === search().size)?.label;
	const filtering = () => !!(search().flower || search().size);

	// One card per signature bouquet; its themes are on the bouquet's page.
	// The card leads with an available theme, one with the chosen flower if
	// filtering by flower.
	const bouquets = () =>
		catalog().flatMap((product) => {
			const { flower, size } = search();
			if (size && product.size !== size) return [];
			const hasFlower = (variant: ProductVariant) =>
				!flower ||
				variant.recipe.some((item) => filterKey(item.flower) === flower);
			const themes = product.variants.filter(hasFlower);
			const variant = themes.find((theme) => theme.inStock) ?? themes[0];
			return variant ? [{ product, variant }] : [];
		});

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6 lg:max-w-7xl lg:px-8">
				<header class="flex flex-col items-center text-center">
					<div class="flex items-center gap-3">
						<FlowerMark class="size-14 sm:size-16" />
						<span class="font-display type-soft text-4xl font-semibold tracking-[0.25em] text-black sm:text-5xl">
							ORAIA
						</span>
					</div>
					<p class="mt-2 font-display text-lg italic text-petal-900/70 sm:text-xl">
						{TAGLINE}
					</p>
					<p class="mt-5 text-sm font-medium uppercase tracking-[0.3em] text-petal-900/60">
						Soft launch for
					</p>
					<h1 class="mt-1 font-display type-soft text-3xl font-semibold tracking-wide sm:text-5xl">
						BATTALION HOP 2027
					</h1>
				</header>

				<div class="mt-10 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
					<HowToOrder class="lg:sticky lg:top-24 lg:order-last lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" />
					<div class="min-w-0">
						<section
							aria-labelledby="custom-heading"
							class="flex flex-col items-start gap-4 rounded-3xl border border-petal-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
						>
							<div>
								<h2
									id="custom-heading"
									class="font-display type-soft text-2xl font-semibold"
								>
									Customize your bouquet
								</h2>
								<p class="mt-1 max-w-lg text-petal-900/70">
									Pick your own flowers, colors and wrapper, or add money for a
									money bouquet. See the price as you build. Something else in
									mind? Message us.
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<Link
									to="/custom"
									class="inline-flex h-11 items-center rounded-full bg-petal-700 px-5 font-medium text-white transition-colors hover:bg-petal-900"
								>
									Build your bouquet
								</Link>
								<a
									href={CONTACT.facebookUrl}
									target="_blank"
									rel="noreferrer"
									class="inline-flex h-11 items-center rounded-full border border-petal-200 px-5 font-medium transition-colors hover:bg-petal-50"
								>
									Message on Facebook
								</a>
								<a
									href={CONTACT.telegramUrl}
									target="_blank"
									rel="noreferrer"
									class="inline-flex h-11 items-center rounded-full border border-petal-200 px-5 font-medium transition-colors hover:bg-petal-50"
								>
									Message on Telegram
								</a>
							</div>
						</section>

						<h2 class="mt-14 font-display type-soft text-2xl font-semibold">
							Signature bouquets
						</h2>
						<Show when={catalog().length > 0}>
							<fieldset class="mt-4 flex min-w-0 flex-col gap-3">
								<legend class="sr-only">Filter bouquets</legend>
								<FilterRow
									label="Flower"
									options={flowerOptions()}
									selected={search().flower}
									onSelect={(flower) => setFilter({ flower })}
								/>
								<Show when={sizeOptions().length > 1}>
									<FilterRow
										label="Size"
										options={sizeOptions()}
										selected={search().size}
										onSelect={(size) => setFilter({ size })}
									/>
								</Show>
								<p class="text-sm text-petal-900/65" aria-live="polite">
									<Show
										when={filtering()}
										fallback={`${catalog().length} bouquets`}
									>
										{bouquets().length}{" "}
										{bouquets().length === 1 ? "bouquet" : "bouquets"}
										<Show when={flowerLabel()}>
											{(name) => <> with {name()}</>}
										</Show>
										<Show when={sizeLabel()}>
											{(name) => <> in {name()}</>}
										</Show>
										{" · "}
										<button
											type="button"
											class="font-medium text-petal-700 underline underline-offset-2 hover:text-petal-900"
											onClick={() =>
												setFilter({ flower: undefined, size: undefined })
											}
										>
											Clear filters
										</button>
									</Show>
								</p>
							</fieldset>
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
							<ul class="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-5 lg:grid-cols-4">
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
					</div>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}

/** One filter as a row of chips; tapping the chosen one again clears it. */
function FilterRow(props: {
	label: string;
	options: { key: string; label: string; count: number }[];
	selected?: string;
	onSelect: (key: string | undefined) => void;
}) {
	const chip =
		"inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500";
	return (
		<div class="flex items-center gap-3">
			<span class="w-12 shrink-0 text-xs font-medium uppercase tracking-wide text-petal-900/55">
				{props.label}
			</span>
			<div class="-my-1 flex min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:thin]">
				<button
					type="button"
					aria-pressed={!props.selected}
					onClick={() => props.onSelect(undefined)}
					class={cn(
						chip,
						!props.selected
							? "border-petal-700 bg-petal-700 text-white"
							: "border-petal-200 bg-white hover:border-petal-300",
					)}
				>
					All
				</button>
				<For each={props.options}>
					{(option) => {
						const on = () => props.selected === option.key;
						return (
							<button
								type="button"
								aria-pressed={on()}
								// Nothing to show with this choice and the other filter.
								disabled={!on() && option.count === 0}
								onClick={() => props.onSelect(on() ? undefined : option.key)}
								class={cn(
									chip,
									"disabled:cursor-not-allowed disabled:opacity-40",
									on()
										? "border-petal-700 bg-petal-700 text-white"
										: "border-petal-200 bg-white hover:border-petal-300",
								)}
							>
								{option.label}
								<span
									class={cn(
										"text-xs tabular-nums",
										on() ? "text-white/75" : "text-petal-900/45",
									)}
								>
									{option.count}
								</span>
							</button>
						);
					}}
				</For>
			</div>
		</div>
	);
}
