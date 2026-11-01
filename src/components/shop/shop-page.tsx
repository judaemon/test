import { Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { HowToOrder } from "~/components/shop/how-to-order";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { CONTACT, TAGLINE } from "~/lib/contact";
import { useCatalog } from "~/lib/use-catalog";

/** The storefront: Battalion Hop launch header, the builder, then the catalog. */
export function ShopPage() {
	const catalog = useCatalog();
	// One card per signature bouquet; its themes are on the bouquet's page.
	// The card leads with a theme that's available.
	const bouquets = () =>
		catalog().flatMap((product) => {
			const variant =
				product.variants.find((theme) => theme.inStock) ?? product.variants[0];
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
						<Show
							when={bouquets().length > 0}
							fallback={
								<div class="mt-10 flex flex-col items-center gap-3 text-center">
									<FlowerMark class="size-12" />
									<p class="font-display type-soft text-xl font-semibold">
										New bouquets are on their way
									</p>
									<p class="text-sm text-petal-900/65">Check back soon.</p>
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
