import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { SaleTag } from "~/components/shop/sale-price";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import {
	orderPromoLabel,
	orderPromoMechanics,
	type PublicOrderPromo,
} from "~/lib/order-promo";
import { formatPrice } from "~/lib/product";
import {
	type ItemScope,
	markupPrice,
	type PublicSale,
	saleEndsText,
	saleLabel,
	salePrice,
} from "~/lib/sale";
import { pageHead } from "~/lib/site";
import {
	useArrangementTypes,
	useCatalog,
	useOrderPromos,
	useSales,
} from "~/lib/use-catalog";

export const Route = createFileRoute("/promos")({
	head: () =>
		pageHead({
			title: "Promos · ORAIA",
			description:
				"ORAIA's sales and promos running now, and how each one works.",
			path: "/promos",
		}),
	component: PromosPage,
});

const day = (value: string) =>
	new Date(`${value}T00:00:00Z`).toLocaleDateString("en-PH", {
		timeZone: "UTC",
		month: "long",
		day: "numeric",
		year: "numeric",
	});

function PromosPage() {
	const sales = useSales();
	const orderPromos = useOrderPromos();
	const nothing = () => !sales().length && !orderPromos().length;
	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8 sm:px-6">
				<h1 class="font-display type-soft text-3xl font-semibold tracking-tight sm:text-4xl">
					Promos
				</h1>
				<p class="mt-2 text-petal-900/70">
					What’s on now, and how each one works. Checkout applies them for you.
				</p>
				<Show when={nothing()}>
					<p class="mt-10 rounded-3xl border border-petal-100 bg-white p-8 text-center text-petal-900/65">
						No promos right now. Check back soon!
					</p>
				</Show>
				<div class="mt-8 flex flex-col gap-5">
					<For each={sales()}>{(sale) => <SaleCard sale={sale} />}</For>
					<For each={orderPromos()}>
						{(promo) => <OrderPromoCard promo={promo} />}
					</For>
				</div>
				<Show when={!nothing()}>
					<Link
						to="/shop"
						class="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-petal-700 px-8 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
					>
						Shop now
					</Link>
				</Show>
			</main>
			<SiteFooter />
		</div>
	);
}

/** What a sale or promo is on: everything, or its chosen items, by name. */
function useScopeItems(scope: () => ItemScope) {
	const types = useArrangementTypes();
	const products = useCatalog();
	return () => {
		const chosen = scope();
		if (chosen.scope === "all")
			return ["Everything in the shop, custom bouquets included"];
		return [
			...chosen.arrangementTypes.map(
				(id) =>
					`All ${
						types()
							.find((type) => type.id === id)
							?.pluralName.toLowerCase() ?? id
					}`,
			),
			...chosen.products.flatMap((id) => {
				const product = products().find((p) => p.id === id);
				return product ? [product.title] : [];
			}),
			...(chosen.includeCustom ? ["Custom bouquets you build"] : []),
		];
	};
}

function SaleCard(props: { sale: PublicSale }) {
	const on = useScopeItems(() => props.sale);
	const example = () =>
		props.sale.pricing === "markup"
			? `For example, a ${formatPrice(1000, "PHP")} bouquet shows as ${formatPrice(markupPrice(1000, props.sale), "PHP")}, ${saleLabel(props.sale)}: you pay ${formatPrice(1000, "PHP")}.`
			: `For example, a ${formatPrice(1000, "PHP")} bouquet is ${formatPrice(salePrice(1000, props.sale), "PHP")}.`;
	return (
		<article class="overflow-hidden rounded-3xl border border-petal-100 bg-white">
			<div class="flex flex-wrap items-center justify-between gap-3 bg-sale px-6 py-4 text-white">
				<h2 class="font-display type-soft text-2xl font-semibold">
					{props.sale.name}
				</h2>
				<span class="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
					{saleEndsText(props.sale.endsOn)}
				</span>
			</div>
			<div class="flex flex-col gap-4 p-6">
				<p class="flex flex-wrap items-center gap-2 text-xl font-semibold">
					{saleLabel(props.sale)} each item
					<SaleTag sale={props.sale} />
				</p>
				<div>
					<h3 class="text-sm font-semibold">On</h3>
					<ul class="mt-1 list-disc pl-5 text-sm text-petal-900/75">
						<For each={on()}>{(item) => <li>{item}</li>}</For>
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold">How it works</h3>
					<ul class="mt-1 list-disc pl-5 text-sm text-petal-900/75">
						<li>
							From {day(props.sale.startsOn)} to the end of{" "}
							{day(props.sale.endsOn)}, Manila time.
						</li>
						<li>
							Sale prices show in the shop and come off at checkout, no code
							needed.
						</li>
						<li>{example()}</li>
						<li>
							Prices are rounded down to whole pesos. Sales don’t add up: you
							get the best one.
						</li>
						<li>Orders keep the price they were placed at.</li>
					</ul>
				</div>
			</div>
		</article>
	);
}

function OrderPromoCard(props: { promo: PublicOrderPromo }) {
	const on = useScopeItems(() => props.promo);
	return (
		<article class="overflow-hidden rounded-3xl border border-petal-100 bg-white">
			<div class="flex flex-wrap items-center justify-between gap-3 bg-petal-700 px-6 py-4 text-white">
				<h2 class="font-display type-soft text-2xl font-semibold">
					{props.promo.name}
				</h2>
				<span class="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
					Cadets
				</span>
			</div>
			<div class="flex flex-col gap-4 p-6">
				<p class="text-xl font-semibold">{orderPromoLabel(props.promo)}</p>
				<div>
					<h3 class="text-sm font-semibold">On</h3>
					<ul class="mt-1 list-disc pl-5 text-sm text-petal-900/75">
						<For each={on()}>{(item) => <li>{item}</li>}</For>
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold">How it works</h3>
					<ul class="mt-1 list-disc pl-5 text-sm text-petal-900/75">
						<For each={orderPromoMechanics(props.promo)}>
							{(line) => <li>{line}</li>}
						</For>
						<li>
							From {day(props.promo.startsOn)}
							{props.promo.endsOn
								? ` to the end of ${day(props.promo.endsOn)}`
								: " until further notice"}
							, Manila time.
						</li>
					</ul>
				</div>
				<Show when={props.promo.terms}>
					<div>
						<h3 class="text-sm font-semibold">Terms</h3>
						<p class="mt-1 whitespace-pre-line text-sm text-petal-900/75">
							{props.promo.terms}
						</p>
					</div>
				</Show>
			</div>
		</article>
	);
}
