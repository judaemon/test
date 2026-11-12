import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { For, type JSX, Show } from "solid-js";

import { FlowerMark, Sparkle, Wordmark } from "~/components/site/brand";
import { photoSrc } from "~/lib/photos";
import { centerMessage } from "~/lib/print-cards";
import { cn } from "~/lib/utils";
import { type BouquetView, getBouquetPageFn } from "~/server/bouquet-page";

/**
 * What the QR code on a dedication card opens: the bouquet and the card's
 * message, for whoever received them. Private: kept out of search results,
 * and the link isn't passed on to sites it links to.
 */
export const Route = createFileRoute("/b/$token")({
	loader: async ({ params }) => {
		const page = await getBouquetPageFn({ data: params.token });
		if (!page) throw notFound();
		return page;
	},
	head: () => ({
		meta: [
			{ title: "A bouquet for you · ORAIA" },
			{ name: "description", content: "Flowers from ORAIA, Baguio City." },
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	notFoundComponent: () => (
		<Shell>
			<Gone text="We couldn’t find this bouquet. Check the code, or say hello and we’ll help." />
		</Shell>
	),
	component: BouquetPage,
});

function BouquetPage() {
	const page = Route.useLoaderData();
	/** The card, unless its order was cancelled or the card removed. */
	const card = () => {
		const current = page();
		return current.state === "ok" ? current : undefined;
	};
	return (
		<Shell>
			<Show
				when={card()}
				fallback={
					<Gone text="This bouquet’s page isn’t available anymore. We hope you loved your flowers!" />
				}
			>
				{(card) => (
					<>
						<header class="text-center">
							<p class="text-xs font-medium uppercase tracking-[0.28em] text-petal-700">
								A bouquet for
							</p>
							<h1 class="mt-2 font-display type-soft text-4xl font-semibold leading-tight text-balance break-words">
								{card().to || "you"}
							</h1>
						</header>

						<For each={card().bouquets}>
							{(bouquet) => (
								<Show when={bouquet.image}>
									{(src) => (
										<figure class="mt-7 overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgb(92_31_49/0.08)]">
											<img
												src={photoSrc(src(), "full")}
												alt={`${bouquet.title}, ${bouquet.colorName}`}
												class="block max-h-[70vh] w-full object-contain"
											/>
										</figure>
									)}
								</Show>
							)}
						</For>

						{/* ----- The card's words ----- */}
						<section
							aria-label="The message"
							class="relative mt-7 rounded-3xl border border-petal-100 bg-white px-6 pb-8 pt-9"
						>
							<Sparkle class="absolute inset-x-0 top-4 mx-auto size-3.5 text-petal-500" />
							<p
								class={cn(
									"whitespace-pre-line break-words font-display text-[19px] italic leading-relaxed text-petal-900",
									centerMessage(card().message)
										? "text-center text-balance"
										: "text-pretty",
								)}
							>
								{card().message}
							</p>
						</section>

						{/* ----- What's in it ----- */}
						<For each={card().bouquets}>
							{(bouquet) => <Contents bouquet={bouquet} />}
						</For>

						<section class="mt-10 flex flex-col items-center text-center">
							<FlowerMark class="size-10" />
							<p class="mt-3 text-sm text-petal-900/65">
								Arranged by hand by ORAIA, Baguio City.
							</p>
							<div class="mt-5 flex w-full flex-col gap-2.5">
								<Link
									to="/hello"
									class="inline-flex h-12 items-center justify-center rounded-full bg-petal-700 px-6 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
								>
									Say hello to ORAIA
								</Link>
								<Link
									to="/shop"
									class="inline-flex h-12 items-center justify-center rounded-full border border-petal-200 bg-white px-6 font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									Send someone flowers
								</Link>
							</div>
						</section>
					</>
				)}
			</Show>
		</Shell>
	);
}

/** The bouquet's name and the flowers in it, as a short list. */
function Contents(props: { bouquet: BouquetView }) {
	const stems = () =>
		props.bouquet.flowers.filter((item) => !item.filler && item.count);
	const fillers = () => props.bouquet.flowers.filter((item) => item.filler);
	const total = () => stems().reduce((sum, item) => sum + (item.count ?? 0), 0);
	return (
		<section class="mt-7 rounded-3xl border border-petal-100 bg-white p-6">
			<p class="text-xs font-medium uppercase tracking-[0.2em] text-petal-900/55">
				In your bouquet
			</p>
			<h2 class="mt-2 font-display type-soft text-2xl font-semibold">
				{props.bouquet.title}
			</h2>
			<p class="text-sm text-petal-900/65">
				{[props.bouquet.colorName, props.bouquet.sizeName]
					.filter(Boolean)
					.join(" · ")}
				<Show when={total()}>{(n) => <> · {n()} flowers</>}</Show>
			</p>
			<Show when={props.bouquet.flowers.length}>
				<ul class="mt-4 divide-y divide-petal-100 border-t border-petal-100">
					<For each={props.bouquet.flowers.filter((item) => !item.filler)}>
						{(item) => (
							<li class="flex items-baseline justify-between gap-3 py-2.5">
								<span>
									{item.flower}
									<Show when={item.color}>
										<span class="text-petal-900/55"> · {item.color}</span>
									</Show>
								</span>
								<Show when={item.count}>
									<span class="shrink-0 tabular-nums text-sm text-petal-900/60">
										{item.count}
									</span>
								</Show>
							</li>
						)}
					</For>
				</ul>
			</Show>
			<Show when={fillers().length}>
				<p class="mt-3 text-sm text-petal-900/65">
					With{" "}
					{fillers()
						.map((item) =>
							item.color ? `${item.flower} (${item.color})` : item.flower,
						)
						.join(" and ")}
					.
				</p>
			</Show>
		</section>
	);
}

function Gone(props: { text: string }) {
	return (
		<div class="flex flex-col items-center py-16 text-center">
			<FlowerMark class="size-14" />
			<p class="mt-5 max-w-xs text-petal-900/70">{props.text}</p>
			<Link
				to="/hello"
				class="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-petal-700 px-6 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
			>
				Say hello to ORAIA
			</Link>
		</div>
	);
}

function Shell(props: { children: JSX.Element }) {
	return (
		<div class="min-h-screen bg-cream text-petal-900">
			<main class="mx-auto w-full max-w-md px-4 pb-12 pt-6">
				<Link
					to="/hello"
					class="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					<FlowerMark class="size-6" />
					<Wordmark class="text-base" />
				</Link>
				{props.children}
			</main>
		</div>
	);
}
