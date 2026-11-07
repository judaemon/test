import { Link } from "@tanstack/solid-router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { type PublicSale, saleEndsText, saleLabel } from "~/lib/sale";
import { useSales } from "~/lib/use-catalog";

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

/** A strip above the header while a sale is live, counting down to its end. */
export function SaleBanner() {
	const sales = useSales();
	const sale = () => headlineSale(sales());
	// The countdown runs in the browser only; the page first shows the end date.
	const [now, setNow] = createSignal<number>();
	onMount(() => {
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		onCleanup(() => clearInterval(timer));
	});
	return (
		<Show when={sale()}>
			{(live) => (
				<div class="bg-sale px-4 py-2 text-center text-sm text-white">
					<Link
						to="/shop"
						class="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white"
					>
						<strong class="font-semibold">{live().name}</strong>
						<span>
							{saleLabel(live())}{" "}
							{live().scope === "all" ? "everything" : "selected arrangements"}
						</span>
						<span aria-hidden="true">·</span>
						<span class="tabular-nums">
							{now() === undefined
								? saleEndsText(live().endsOn)
								: timeLeft(saleEndsAt(live().endsOn).getTime() - (now() ?? 0))}
						</span>
					</Link>
				</div>
			)}
		</Show>
	);
}
