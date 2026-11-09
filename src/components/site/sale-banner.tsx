import * as Dialog from "@kobalte/core/dialog";
import { Link, useLocation } from "@tanstack/solid-router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { orderPromoLabel } from "~/lib/order-promo";
import {
	methodsText,
	notForCashText,
	type PublicSale,
	saleEndsText,
	saleLabel,
} from "~/lib/sale";
import { useOrderPromos, useSales } from "~/lib/use-catalog";

/** When a sale's last Manila day is over. */
function saleEndsAt(endsOn: string) {
	const next = new Date(`${endsOn}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return new Date(`${next.toISOString().slice(0, 10)}T00:00:00+08:00`);
}

/** "2d 5h left", "5h 12m left" or "12m left". */
function timeLeft(ms: number) {
	const minutes = Math.max(0, Math.floor(ms / 60_000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	if (days > 0) return `${days}d ${hours}h left`;
	if (hours > 0) return `${hours}h ${minutes % 60}m left`;
	return `${minutes % 60}m left`;
}

/** The sale to tell everyone about: one on everything first, then the biggest. */
function headlineSale(sales: readonly PublicSale[]) {
	return [...sales].sort(
		(a, b) =>
			Number(b.scope === "all") - Number(a.scope === "all") ||
			Number(b.kind === "percent") - Number(a.kind === "percent") ||
			b.value - a.value,
	)[0];
}

/**
 * A strip above the header while a sale or order promo is live: the sale with
 * its countdown, and the order promo. It opens the Promos page.
 */
export function SaleBanner() {
	const sales = useSales();
	const orderPromos = useOrderPromos();
	const sale = () => headlineSale(sales());
	const promo = () => orderPromos()[0];
	// The countdown runs in the browser only; the page first shows the end date.
	const [now, setNow] = createSignal<number>();
	onMount(() => {
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		onCleanup(() => clearInterval(timer));
	});
	return (
		<Show when={sale() || promo()}>
			<div class="bg-sale px-4 py-2 text-center text-sm text-white">
				<Link
					to="/promos"
					class="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white"
				>
					<Show when={sale()}>
						{(live) => (
							<>
								<strong class="font-semibold">{live().name}</strong>
								<span>
									{saleLabel(live())}{" "}
									{live().scope === "all"
										? "everything"
										: "selected arrangements"}
									{live().paymentMethods.length
										? ` with ${methodsText(live().paymentMethods)}`
										: ""}
								</span>
								<Show when={notForCashText(live())}>
									<span class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-sale uppercase">
										Not for cash
									</span>
								</Show>
								<span class="tabular-nums">
									(
									{now() === undefined
										? saleEndsText(live().endsOn)
										: timeLeft(
												saleEndsAt(live().endsOn).getTime() - (now() ?? 0),
											)}
									)
								</span>
							</>
						)}
					</Show>
					<Show when={sale() && promo()}>
						<span aria-hidden="true">·</span>
					</Show>
					<Show when={promo()}>
						{(live) => (
							<span>
								<strong class="font-semibold">{live().name}</strong>:{" "}
								{orderPromoLabel(live())}
							</span>
						)}
					</Show>
					<span class="font-semibold underline underline-offset-2">
						See promos
					</span>
				</Link>
			</div>
		</Show>
	);
}

/** Pages where the shopper is already paying or checking an order. */
const NO_POPUP = /^\/(checkout|pay|order|active-orders|account)/;
const seenKey = (sale: PublicSale) => `oraia:sale-popup:${sale.id}`;

/**
 * A popup the first time a shopper visits during a sale, so nobody misses it.
 * When the sale is for some payment methods only, that's said in big letters:
 * shoppers paying cash otherwise only find out at checkout.
 */
export function SalePopup() {
	const sales = useSales();
	const location = useLocation();
	const sale = () => headlineSale(sales());
	const [open, setOpen] = createSignal(false);
	onMount(() => {
		const live = sale();
		if (!live || NO_POPUP.test(location().pathname)) return;
		try {
			if (localStorage.getItem(seenKey(live))) return;
		} catch {
			// Storage blocked: show it; it can't be remembered either way.
		}
		const timer = setTimeout(() => setOpen(true), 600);
		onCleanup(() => clearTimeout(timer));
	});
	const close = () => {
		setOpen(false);
		const live = sale();
		try {
			if (live) localStorage.setItem(seenKey(live), "1");
		} catch {
			// Nothing to remember it in; fine.
		}
	};
	return (
		<Show when={sale()}>
			{(live) => (
				<Dialog.Root open={open()} onOpenChange={(next) => !next && close()}>
					<Dialog.Portal>
						<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/50 backdrop-blur-sm" />
						<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
							<Dialog.Content class="relative w-full max-w-md overflow-hidden rounded-3xl bg-white text-center text-petal-900 shadow-2xl outline-none">
								<Dialog.CloseButton
									aria-label="Close"
									class="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-2xl text-white/80 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
								>
									<span aria-hidden="true">×</span>
								</Dialog.CloseButton>
								<div class="bg-sale px-6 pb-7 pt-8 text-white">
									<p class="text-sm font-semibold tracking-[0.2em] uppercase">
										{live().name} is on
									</p>
									<Dialog.Title class="font-display type-soft mt-2 text-5xl font-bold sm:text-6xl">
										{saleLabel(live()).toUpperCase()}
									</Dialog.Title>
									<p class="mt-1 text-lg font-medium">
										{live().scope === "all"
											? "every bouquet in the shop"
											: "selected arrangements"}
									</p>
									<p class="mt-3 inline-block rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
										{saleEndsText(live().endsOn)} — get yours before it’s gone
									</p>
								</div>
								<div class="flex flex-col gap-4 px-6 py-6">
									<Show when={live().paymentMethods.length}>
										<div class="rounded-2xl border-2 border-sale bg-sale/10 px-4 py-4">
											<p class="text-xl font-bold text-sale uppercase sm:text-2xl">
												{notForCashText(live())
													? "Non-cash payments only"
													: `${methodsText(live().paymentMethods)} only`}
											</p>
											<p class="mt-1 text-base font-medium">
												Pay with {methodsText(live().paymentMethods)} to get the
												discount.
											</p>
											<Show when={notForCashText(live())}>
												<p class="mt-1 text-sm font-semibold text-sale">
													Not available for cash payments.
												</p>
											</Show>
										</div>
									</Show>
									<Dialog.Description class="text-sm text-petal-900/70">
										Sale prices are already in the shop and come off at
										checkout. No code needed.
									</Dialog.Description>
									<div class="flex flex-col gap-2">
										<Link
											to="/shop"
											onClick={close}
											class="inline-flex h-12 w-full items-center justify-center rounded-full bg-petal-700 px-6 text-base font-semibold text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
										>
											Shop the sale
										</Link>
										<button
											type="button"
											onClick={close}
											class="h-11 rounded-full text-sm font-medium text-petal-900/60 outline-none hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500"
										>
											Maybe later
										</button>
									</div>
								</div>
							</Dialog.Content>
						</div>
					</Dialog.Portal>
				</Dialog.Root>
			)}
		</Show>
	);
}
