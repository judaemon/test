import { Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";

import { formatDeliveryDate, formatSerialNumber } from "~/lib/checkout";
import { orderFlowers } from "~/lib/flower-tally";
import { photoSrc } from "~/lib/photos";
import { cn } from "~/lib/utils";
import type {
	FloristBouquet,
	FloristCard,
	FloristPayment,
	FloristWork,
} from "~/server/florist-work";
import type { RecipeItem } from "~/types/product";

type SortBy = "order" | "style";

/** How many bouquets go on each A4 page. */
const PER_PAGE = [1, 2, 4, 6] as const;
type PerPage = (typeof PER_PAGE)[number];

/**
 * What each bouquet shows: everything the florist needs, or a shorter card
 * that fits 4 or 6 to a page.
 */
const LAYOUTS = {
	full: "Everything",
	flowers: "Photo, flowers & wrapper",
	basic: "Photo & who ordered",
} as const;
type Layout = keyof typeof LAYOUTS;

/** The full card doesn't fit more than 2 to a page. */
const fitsFull = (n: PerPage) => n <= 2;

/** Which way the A4 sheet is turned. */
const ORIENTATIONS = { portrait: "Portrait", landscape: "Landscape" } as const;
type Orientation = keyof typeof ORIENTATIONS;

/**
 * Each page's grid: columns and rows, so every card on it is the same size,
 * and its height: a whole A4 sheet (the page has no margin, see `@page`),
 * less a hair so rounding never pushes a card onto a page of its own.
 */
const PAGE_GRID: Record<Orientation, Record<PerPage, string>> = {
	portrait: {
		1: "print:h-[296mm] print:grid-cols-1 print:grid-rows-1",
		2: "print:h-[296mm] print:grid-cols-1 print:grid-rows-2",
		4: "print:h-[296mm] print:grid-cols-2 print:grid-rows-2",
		6: "print:h-[296mm] print:grid-cols-2 print:grid-rows-3",
	},
	landscape: {
		1: "print:h-[209mm] print:grid-cols-1 print:grid-rows-1",
		2: "print:h-[209mm] print:grid-cols-2 print:grid-rows-1",
		4: "print:h-[209mm] print:grid-cols-2 print:grid-rows-2",
		6: "print:h-[209mm] print:grid-cols-3 print:grid-rows-2",
	},
};

/**
 * Cards where the photo gets most room below the details: tall ones, and the
 * small 6-to-a-page ones. Wide cards put the photo beside the details.
 */
const TALL_CARD: Record<Orientation, Record<PerPage, boolean>> = {
	portrait: { 1: true, 2: false, 4: true, 6: true },
	landscape: { 1: false, 2: true, 4: false, 6: true },
};

/** The full card's photo and details: side by side, or photo on top. */
const FULL_CARD_GRID: Record<Orientation, Record<1 | 2, string>> = {
	portrait: {
		1: "print:grid-cols-1 print:grid-rows-[minmax(0,1fr)_auto]",
		2: "print:grid-cols-[95mm_minmax(0,1fr)]",
	},
	landscape: {
		1: "print:grid-cols-[150mm_minmax(0,1fr)]",
		2: "print:grid-cols-1 print:grid-rows-[minmax(0,1fr)_auto]",
	},
};

const PAYMENT: Record<FloristPayment, { label: string; paid: boolean }> = {
	paid: { label: "Paid", paid: true },
	deposit: { label: "Deposit paid", paid: true },
	verifying: { label: "Checking payment", paid: false },
	unpaid: { label: "Not paid", paid: false },
	rejected: { label: "Payment rejected", paid: false },
};

const chunk = <T,>(list: T[], size: number) =>
	Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
		list.slice(i * size, i * size + size),
	);

const pill = (on: boolean) =>
	cn(
		"rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
		on
			? "border-petal-700 bg-petal-700 font-medium text-white"
			: "border-petal-200 bg-white hover:bg-petal-50",
	);

const dateTime = (iso: string) =>
	new Date(iso).toLocaleString("en-PH", {
		timeZone: "Asia/Manila",
		dateStyle: "medium",
		timeStyle: "short",
	});

const stems = (recipe: RecipeItem[]) =>
	recipe.reduce((sum, item) => sum + (item.filler ? 0 : (item.count ?? 0)), 0);

const cardText = (card: FloristCard) =>
	[card.to ? `To ${card.to}` : "", card.message ? `“${card.message}”` : ""]
		.filter(Boolean)
		.join(": ");

/**
 * A florist's bouquets, to read on a phone or print on A4: first the flowers
 * to get and a checklist, then each bouquet with its photo, flowers, card,
 * notes and who ordered it. Shared by the admin page and the florist's link.
 */
export function FloristSheet(props: {
	work: FloristWork;
	includeDone: boolean;
	onIncludeDone: (on: boolean) => void;
	/** Staff see order links and test orders. */
	staff?: boolean;
	/** Above the title: a back link, say. */
	top?: JSX.Element;
	/** Next to the print button. */
	actions?: JSX.Element;
}) {
	const [sortBy, setSortBy] = createSignal<SortBy>("order");
	const [perPage, setPerPage] = createSignal<PerPage>(2);
	const [layout, setLayout] = createSignal<Layout>("full");
	const [orientation, setOrientation] = createSignal<Orientation>("portrait");
	const pickPerPage = (n: PerPage) => {
		setPerPage(n);
		if (!fitsFull(n) && layout() === "full") setLayout("flowers");
	};
	const pickLayout = (next: Layout) => {
		setLayout(next);
		if (next === "full" && !fitsFull(perPage())) setPerPage(2);
	};
	const [withSummary, setWithSummary] = createSignal(true);
	const [printing, setPrinting] = createSignal(false);

	const bouquets = createMemo(() => {
		const list = [...props.work.bouquets];
		if (sortBy() === "style")
			list.sort(
				(a, b) =>
					a.code.localeCompare(b.code) ||
					a.colorName.localeCompare(b.colorName) ||
					Number(a.orderNumber) - Number(b.orderNumber),
			);
		return list;
	});
	const toMake = () =>
		props.work.bouquets.filter((b) => b.stage !== "done").length;
	const flowers = createMemo(() => {
		const { flowers, missing } = orderFlowers(
			props.work.bouquets
				.filter((b) => b.stage !== "done")
				.map((b) => ({ quantity: 1, recipe: b.recipe })),
		);
		return {
			missing,
			rows: flowers.sort(
				(a, b) =>
					Number(a.filler) - Number(b.filler) ||
					b.stems - a.stems ||
					a.flower.localeCompare(b.flower) ||
					a.color.localeCompare(b.color),
			),
		};
	});
	const totalStems = () =>
		flowers()
			.rows.filter((row) => !row.filler)
			.reduce((sum, row) => sum + row.stems, 0);
	const photoFor = (flower: string, color = "") =>
		props.work.flowerPhotos[`${flower}|${color}`] ??
		props.work.flowerPhotos[`${flower}|`];

	/** Waits for the photos, so none prints blank, then opens the print dialog. */
	const print = async () => {
		setPrinting(true);
		const images = [
			...document.querySelectorAll<HTMLImageElement>(
				"[data-florist-sheet] img",
			),
		];
		await Promise.all(
			images.map((img) =>
				img.complete
					? Promise.resolve()
					: new Promise((done) => {
							img.addEventListener("load", done, { once: true });
							img.addEventListener("error", done, { once: true });
						}),
			),
		);
		setPrinting(false);
		window.print();
	};
	const printedOn = new Date().toLocaleDateString("en-PH", {
		timeZone: "Asia/Manila",
		dateStyle: "long",
	});

	return (
		<div data-florist-sheet class="text-petal-900">
			{/*
			 * No page margin: that's where browsers print the date, title and web
			 * address. Each page pads itself instead, so nothing runs to the edge.
			 */}
			<style>{`@page { size: A4 ${orientation()}; margin: 0; }`}</style>

			<div class="print:hidden">
				{props.top}
				<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
					<div>
						<p class="text-xs font-medium uppercase tracking-widest text-petal-900/55">
							Bouquets to make
						</p>
						<h1 class="font-display text-3xl font-semibold leading-tight">
							{props.work.florist.name}
						</h1>
						<p class="mt-1 text-sm text-petal-900/65 tabular-nums">
							<strong class="font-semibold text-petal-900">{toMake()}</strong>{" "}
							{toMake() === 1 ? "bouquet" : "bouquets"} to make
							<Show when={totalStems()}>
								{" · "}
								<strong class="font-semibold text-petal-900">
									{totalStems()}
								</strong>{" "}
								flowers
							</Show>
							<Show when={props.work.doneCount}>
								{" · "}
								{props.work.doneCount} done
							</Show>
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						{props.actions}
						<button
							type="button"
							onClick={() => void print()}
							disabled={!props.work.bouquets.length || printing()}
							class="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-petal-700 px-5 text-sm font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
						>
							{printing() ? "Loading photos…" : "Print or save PDF"}
						</button>
					</div>
				</div>

				<div class="mb-6 flex flex-col gap-3 rounded-2xl border border-petal-100 bg-white p-4">
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">Order by</span>
						<button
							type="button"
							aria-pressed={sortBy() === "order"}
							onClick={() => setSortBy("order")}
							class={pill(sortBy() === "order")}
						>
							Order number
						</button>
						<button
							type="button"
							aria-pressed={sortBy() === "style"}
							onClick={() => setSortBy("style")}
							class={pill(sortBy() === "style")}
						>
							Same style together
						</button>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">On each bouquet</span>
						<For each={Object.keys(LAYOUTS) as Layout[]}>
							{(key) => (
								<button
									type="button"
									aria-pressed={layout() === key}
									onClick={() => pickLayout(key)}
									class={pill(layout() === key)}
								>
									{LAYOUTS[key]}
								</button>
							)}
						</For>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">A4 paper</span>
						<For each={Object.keys(ORIENTATIONS) as Orientation[]}>
							{(key) => (
								<button
									type="button"
									aria-pressed={orientation() === key}
									onClick={() => setOrientation(key)}
									class={pill(orientation() === key)}
								>
									{ORIENTATIONS[key]}
								</button>
							)}
						</For>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">On paper</span>
						<For each={PER_PAGE}>
							{(n) => (
								<button
									type="button"
									aria-pressed={perPage() === n}
									onClick={() => pickPerPage(n)}
									class={pill(perPage() === n)}
								>
									{n} per page
								</button>
							)}
						</For>
						<Show when={layout() === "full"}>
							<span class="text-xs text-petal-900/55">
								4 or 6 per page uses a shorter card
							</span>
						</Show>
					</div>
					<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
						<label class="flex min-h-10 cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={withSummary()}
								onChange={(e) => setWithSummary(e.currentTarget.checked)}
								class="size-5 accent-petal-700"
							/>
							Print the flower list and checklist first
						</label>
						<Show when={props.work.doneCount}>
							<label class="flex min-h-10 cursor-pointer items-center gap-2">
								<input
									type="checkbox"
									checked={props.includeDone}
									onChange={(e) => props.onIncludeDone(e.currentTarget.checked)}
									class="size-5 accent-petal-700"
								/>
								Show finished bouquets too ({props.work.doneCount})
							</label>
						</Show>
					</div>
				</div>
			</div>

			<Show
				when={props.work.bouquets.length}
				fallback={
					<div class="rounded-2xl border border-petal-100 bg-white px-5 py-10 text-center">
						<p class="font-medium">No bouquets to make right now.</p>
						<p class="mt-1 text-sm text-petal-900/60">
							New ones show here as soon as they’re given to{" "}
							{props.work.florist.name}.
						</p>
					</div>
				}
			>
				{/* The flowers to get, and a checklist: on screen, and the first printed page. */}
				<section
					class={cn(
						"mb-8 print:mb-0 print:break-after-page print:p-[8mm] print:[-webkit-box-decoration-break:clone] print:[box-decoration-break:clone]",
						!withSummary() && "print:hidden",
					)}
					aria-labelledby="flowers-to-get"
				>
					<header class="mb-3 hidden items-end justify-between border-b-2 border-black pb-2 print:flex">
						<div>
							<p class="text-[8pt] uppercase tracking-widest">
								ORAIA · florist sheet
							</p>
							<p class="font-display text-[20pt] font-semibold leading-tight">
								{props.work.florist.name}
							</p>
						</div>
						<p class="text-right text-[9pt]">
							Printed {printedOn}
							<br />
							{toMake()} bouquets · {totalStems()} flowers
						</p>
					</header>
					<div class="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-5">
						<div>
							<h2
								id="flowers-to-get"
								class="mb-2 font-semibold print:text-[11pt]"
							>
								Flowers to get
							</h2>
							<Show
								when={flowers().rows.length}
								fallback={
									<p class="text-sm text-petal-900/60">
										No flowers on record for these bouquets.
									</p>
								}
							>
								<div class="overflow-hidden rounded-2xl border border-petal-100 bg-white print:rounded-none print:border-black/40">
									<table class="w-full text-left text-sm print:text-[9pt]">
										<thead class="bg-petal-50 text-xs uppercase tracking-wide text-petal-900/60 print:bg-black/5 print:text-[7.5pt]">
											<tr>
												<th class="w-8 px-3 py-2 font-medium print:px-2">
													<span class="sr-only">Got it</span>✓
												</th>
												<th class="px-2 py-2 font-medium">Flower</th>
												<th class="px-3 py-2 text-right font-medium">Stems</th>
												<th class="px-3 py-2 text-right font-medium">
													Bouquets
												</th>
											</tr>
										</thead>
										<tbody>
											<For each={flowers().rows}>
												{(row) => (
													<tr class="border-t border-petal-50 print:border-black/20">
														<td class="px-3 py-1.5 print:px-2">
															<span class="inline-block size-4 rounded-sm border-2 border-petal-900/40 print:border-black" />
														</td>
														<td class="px-2 py-1.5">
															<span class="flex items-center gap-2">
																<span class="size-8 shrink-0 overflow-hidden rounded-md bg-petal-50 print:size-[7mm]">
																	<Show when={photoFor(row.flower, row.color)}>
																		{(src) => (
																			<img
																				src={photoSrc(src(), "thumb")}
																				alt=""
																				loading="eager"
																				class="size-full object-cover"
																			/>
																		)}
																	</Show>
																</span>
																<span class="leading-tight">
																	<span class="font-medium">{row.flower}</span>
																	<Show when={row.color}>
																		<span class="text-petal-900/60">
																			{" "}
																			· {row.color}
																		</span>
																	</Show>
																	<Show when={row.filler}>
																		<span class="text-petal-900/50">
																			{" "}
																			(filler)
																		</span>
																	</Show>
																</span>
															</span>
														</td>
														<td class="px-3 py-1.5 text-right font-semibold tabular-nums">
															{row.stems || ""}
															<Show when={row.clusters}>
																<span class="block text-xs font-normal">
																	{row.clusters} cluster
																	{row.clusters === 1 ? "" : "s"}
																</span>
															</Show>
														</td>
														<td class="px-3 py-1.5 text-right tabular-nums text-petal-900/70">
															{row.bouquets}
														</td>
													</tr>
												)}
											</For>
										</tbody>
									</table>
								</div>
								<Show when={flowers().missing}>
									<p class="mt-2 text-xs text-petal-900/60">
										{flowers().missing} bouquet(s) have no flowers on record, so
										they aren’t counted.
									</p>
								</Show>
							</Show>
						</div>
						<div>
							<h2 class="mb-2 font-semibold print:text-[11pt]">Checklist</h2>
							<ol class="overflow-hidden rounded-2xl border border-petal-100 bg-white text-sm print:rounded-none print:border-black/40 print:text-[9pt]">
								<For each={bouquets()}>
									{(bouquet) => (
										<li class="flex items-start gap-2.5 border-t border-petal-50 px-3 py-1.5 first:border-t-0 print:break-inside-avoid print:border-black/20 print:px-2 print:py-1">
											<span class="mt-0.5 inline-block size-4 shrink-0 rounded-sm border-2 border-petal-900/40 print:border-black" />
											<span class="min-w-0 flex-1 leading-tight">
												<span class="font-semibold tabular-nums">
													#{bouquet.orderNumber}
												</span>{" "}
												{bouquet.title}
												<span class="text-petal-900/60">
													{" "}
													· {bouquet.colorName}
												</span>
												<span class="block text-xs text-petal-900/60 print:text-[8pt]">
													{bouquet.customer.name}
													<Show when={bouquet.deliveryDate}>
														{(date) => <> · for {formatDeliveryDate(date())}</>}
													</Show>
												</span>
											</span>
											<Show when={bouquet.stage === "done"}>
												<span class="shrink-0 rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground">
													Done
												</span>
											</Show>
										</li>
									)}
								</For>
							</ol>
						</div>
					</div>
				</section>

				<h2 class="mb-3 font-semibold print:hidden">
					Each bouquet{" "}
					<span class="font-normal text-petal-900/60">
						({bouquets().length})
					</span>
				</h2>
				<div
					class={cn(
						"grid gap-5 print:block",
						layout() === "full"
							? "xl:grid-cols-2"
							: "md:grid-cols-2 xl:grid-cols-3",
					)}
				>
					{/* On screen the pages melt into one grid; on paper each is an A4 sheet. */}
					<For each={chunk(bouquets(), perPage())}>
						{(page, index) => (
							<div
								class={cn(
									"contents print:box-border print:grid print:gap-[3mm] print:p-[6mm]",
									PAGE_GRID[orientation()][perPage()],
									index() < chunk(bouquets(), perPage()).length - 1 &&
										"print:break-after-page",
								)}
							>
								<For each={page}>
									{(bouquet) => (
										<Show
											when={layout() !== "full"}
											fallback={
												<BouquetCard
													bouquet={bouquet}
													staff={props.staff}
													photoFor={photoFor}
													perPage={perPage()}
													orientation={orientation()}
													printedOn={printedOn}
													florist={props.work.florist.name}
												/>
											}
										>
											<ShortBouquetCard
												bouquet={bouquet}
												staff={props.staff}
												withFlowers={layout() === "flowers"}
												perPage={perPage()}
												tall={TALL_CARD[orientation()][perPage()]}
											/>
										</Show>
									)}
								</For>
							</div>
						)}
					</For>
				</div>
				<p class="mt-6 text-xs text-petal-900/50 print:hidden">
					Up to date as of {dateTime(props.work.generatedAt)}. Reload the page
					for the latest.
				</p>
			</Show>
		</div>
	);
}

function BouquetCard(props: {
	bouquet: FloristBouquet;
	staff?: boolean;
	photoFor: (flower: string, color?: string) => string | undefined;
	perPage: PerPage;
	orientation: Orientation;
	printedOn: string;
	florist: string;
}) {
	const b = () => props.bouquet;
	const big = () => props.perPage === 1;
	/** Printed with the photo beside the details, not above them. */
	const sideBySide = () =>
		!FULL_CARD_GRID[props.orientation][big() ? 1 : 2].includes("grid-rows");
	const count = () => stems(b().recipe);
	const card = () => b().card ?? b().orderCard;
	const customer = () =>
		[
			b().customer.company,
			b().customer.className,
			b().customer.serialNumber
				? formatSerialNumber(b().customer.serialNumber)
				: "",
		]
			.filter(Boolean)
			.join(" · ");

	return (
		<article
			class={cn(
				"flex flex-col overflow-hidden rounded-2xl border border-petal-100 bg-white print:h-full print:min-h-0 print:rounded-[2mm] print:border-black/50 print:break-inside-avoid",
			)}
		>
			<header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-petal-100 bg-petal-50 px-4 py-2.5 print:border-black/30 print:bg-black/5 print:px-[3mm] print:py-[1.5mm]">
				<p class="flex flex-wrap items-center gap-2">
					<Show
						when={props.staff && b().orderId}
						fallback={
							<span class="font-semibold tabular-nums">
								Order #{b().orderNumber}
							</span>
						}
					>
						{(orderId) => (
							<Link
								to="/admin/orders/$orderId"
								params={{ orderId: orderId() }}
								class="font-semibold tabular-nums text-petal-700 underline-offset-2 hover:underline print:text-inherit"
							>
								Order #{b().orderNumber}
							</Link>
						)}
					</Show>
					<Show when={b().quantity > 1}>
						<span class="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-petal-900/75 ring-1 ring-petal-200 print:ring-black/30">
							{b().unit + 1} of {b().quantity}
						</span>
					</Show>
					<Show when={b().stage === "done"}>
						<span class="rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground">
							Done
						</span>
					</Show>
					<Show when={b().waitingForPayment && b().stage !== "done"}>
						<span class="rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
							Waiting for payment
						</span>
					</Show>
					<Show when={b().isTest}>
						<span class="rounded-full bg-petal-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
							Test
						</span>
					</Show>
				</p>
				<p class="text-sm">
					<Show
						when={b().deliveryDate}
						fallback={<span class="text-petal-900/55">No delivery date</span>}
					>
						{(date) => (
							<>
								<span class="text-petal-900/60">For </span>
								<strong class="font-semibold">
									{formatDeliveryDate(date())}
								</strong>
							</>
						)}
					</Show>
				</p>
			</header>

			<div
				class={cn(
					"grid min-h-0 flex-1 gap-4 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:gap-[4mm] print:p-[3mm]",
					FULL_CARD_GRID[props.orientation][big() ? 1 : 2],
				)}
			>
				<div class="flex min-h-0 flex-col gap-2">
					<div class="relative aspect-square overflow-hidden rounded-xl bg-petal-50 print:aspect-auto print:min-h-0 print:flex-1 print:rounded-none print:bg-transparent">
						<Show
							when={b().image ?? b().referenceImages[0]}
							fallback={
								<span class="absolute inset-0 flex items-center justify-center text-sm text-petal-900/40">
									No photo
								</span>
							}
						>
							{(src) => (
								<img
									src={photoSrc(src())}
									alt={`${b().title} · ${b().colorName}`}
									loading="eager"
									class={cn(
										// The whole photo, scaled to fit: never cropped.
										"absolute inset-0 size-full object-contain",
										sideBySide() && "print:object-top",
									)}
								/>
							)}
						</Show>
					</div>
					<Show when={b().referenceImages.length > (b().image ? 0 : 1)}>
						<div class="flex gap-1.5">
							<For each={b().referenceImages.slice(b().image ? 0 : 1, 4)}>
								{(src, i) => (
									<img
										src={src}
										alt={`The look they want, ${i() + 1}`}
										loading="eager"
										class="size-14 rounded-lg object-cover print:size-[12mm]"
									/>
								)}
							</For>
						</div>
					</Show>
				</div>

				<div class="flex min-w-0 flex-col gap-3 print:gap-[2mm] print:text-[9pt]">
					<div>
						<h3
							class={cn(
								"font-display text-2xl font-semibold leading-tight",
								big() ? "print:text-[22pt]" : "print:text-[16pt]",
							)}
						>
							{b().title}
							<span class="font-sans text-base font-normal text-petal-900/65 print:text-[10pt]">
								{" "}
								· {b().colorName}
							</span>
						</h3>
						<p class="text-sm text-petal-900/65 print:text-[8.5pt]">
							{[
								b().code !== b().title ? b().code : "",
								b().typeName,
								b().sizeName,
							]
								.filter(Boolean)
								.join(" · ")}
						</p>
						<Show when={b().preorder}>
							<p class="mt-1 text-sm font-medium">{b().preorder}</p>
						</Show>
					</div>

					<div>
						<p class="flex items-baseline justify-between border-b border-petal-100 pb-1 text-sm font-semibold print:border-black/25 print:text-[9pt]">
							<span>Flowers</span>
							<Show when={count()}>
								<span class="tabular-nums">{count()} stems</span>
							</Show>
						</p>
						<Show
							when={b().recipe.length}
							fallback={
								<p class="py-1 text-sm text-petal-900/55">
									{b().custom
										? "Custom bouquet: follow the photos and the note."
										: "No flowers on record."}
								</p>
							}
						>
							<ul class="flex flex-col gap-1 py-1.5 print:gap-[0.6mm] print:py-[1mm]">
								<For each={b().recipe}>
									{(item) => (
										<li class="flex items-center gap-2 text-sm print:text-[9pt]">
											<span class="size-7 shrink-0 overflow-hidden rounded-md bg-petal-50 print:size-[6mm]">
												<Show when={props.photoFor(item.flower, item.color)}>
													{(src) => (
														<img
															src={photoSrc(src(), "thumb")}
															alt=""
															loading="eager"
															class="size-full object-cover"
														/>
													)}
												</Show>
											</span>
											<span class="min-w-0 flex-1 leading-tight">
												{item.flower}
												<Show when={item.color}>
													<span class="text-petal-900/60"> · {item.color}</span>
												</Show>
												<Show when={item.filler}>
													<span class="text-petal-900/50"> (filler)</span>
												</Show>
											</span>
											<span class="shrink-0 font-semibold tabular-nums">
												{item.count ? `× ${item.count}` : "cluster"}
											</span>
										</li>
									)}
								</For>
							</ul>
						</Show>
						<Show when={b().wrapper}>
							<p class="border-t border-petal-100 pt-1 text-sm print:border-black/25 print:text-[9pt]">
								<span class="text-petal-900/60">Wrapper:</span>{" "}
								<strong class="font-semibold">{b().wrapper}</strong>
							</p>
						</Show>
					</div>
				</div>
			</div>

			<footer class="grid gap-2 border-t border-petal-100 px-4 py-3 text-sm sm:grid-cols-2 print:grid-cols-2 print:gap-[3mm] print:border-black/30 print:px-[3mm] print:py-[2mm] print:text-[9pt]">
				<div>
					<p class="text-xs font-medium uppercase tracking-wide text-petal-900/55 print:text-[7pt]">
						Ordered by
					</p>
					<p class="font-semibold">{b().customer.name}</p>
					<Show when={customer()}>
						<p class="text-petal-900/70">{customer()}</p>
					</Show>
				</div>
				<div class="flex flex-col gap-1.5">
					<div>
						<p class="text-xs font-medium uppercase tracking-wide text-petal-900/55 print:text-[7pt]">
							Card
						</p>
						<Show
							when={card()}
							fallback={<p class="text-petal-900/55">No card</p>}
						>
							{(c) => (
								<p class="whitespace-pre-line wrap-anywhere">
									{cardText(c())}
									<Show when={!b().card}>
										<span class="text-petal-900/55">
											{" "}
											(for the whole order)
										</span>
									</Show>
								</p>
							)}
						</Show>
					</div>
					<Show when={b().note || b().orderNote}>
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-petal-900/55 print:text-[7pt]">
								Customer’s note
							</p>
							<Show when={b().note}>
								<p class="whitespace-pre-line wrap-anywhere font-medium">
									{b().note}
								</p>
							</Show>
							<Show when={b().orderNote}>
								<p class="whitespace-pre-line wrap-anywhere">
									{b().orderNote}
									<span class="text-petal-900/55"> (for the whole order)</span>
								</p>
							</Show>
						</div>
					</Show>
				</div>
				<p class="hidden items-center justify-between text-[7.5pt] text-black/55 print:col-span-2 print:flex">
					<span>
						<span class="mr-1 inline-block size-[3.5mm] translate-y-[0.6mm] border-2 border-black" />{" "}
						Made · {props.florist}
					</span>
					<span>Printed {props.printedOn}</span>
				</p>
			</footer>
		</article>
	);
}

/**
 * The shorter card, 4 or 6 to a page: order number, payment, the photo and
 * who it's for, and (if asked) the flowers and wrapper.
 */
function ShortBouquetCard(props: {
	bouquet: FloristBouquet;
	staff?: boolean;
	withFlowers: boolean;
	perPage: PerPage;
	/** Printed taller than wide: details on top, the photo below. */
	tall: boolean;
}) {
	const b = () => props.bouquet;
	const small = () => props.perPage >= 6;
	const payment = () => PAYMENT[b().payment];
	const photo = () => b().image ?? b().referenceImages[0];
	const label = (text: string) => (
		<span class="text-petal-900/60 print:text-black/60">{text} </span>
	);

	return (
		<article class="flex flex-col overflow-hidden rounded-2xl border border-petal-100 bg-white print:h-full print:min-h-0 print:rounded-[2mm] print:border-black/50 print:break-inside-avoid">
			<header
				class={cn(
					"flex items-center justify-between gap-2 border-b border-petal-100 bg-petal-50 px-3 py-2 print:border-black/30 print:bg-black/5",
					small()
						? "print:px-[2.5mm] print:py-[1mm]"
						: "print:px-[3mm] print:py-[1.5mm]",
				)}
			>
				<p class="flex min-w-0 flex-wrap items-center gap-1.5">
					<Show
						when={props.staff && b().orderId}
						fallback={
							<span
								class={cn(
									"text-lg font-bold tabular-nums",
									small() ? "print:text-[12pt]" : "print:text-[14pt]",
								)}
							>
								#{b().orderNumber}
							</span>
						}
					>
						{(orderId) => (
							<Link
								to="/admin/orders/$orderId"
								params={{ orderId: orderId() }}
								class={cn(
									"text-lg font-bold tabular-nums text-petal-700 underline-offset-2 hover:underline print:text-inherit",
									small() ? "print:text-[12pt]" : "print:text-[14pt]",
								)}
							>
								#{b().orderNumber}
							</Link>
						)}
					</Show>
					<Show when={b().quantity > 1}>
						<span class="text-xs font-semibold text-petal-900/70 print:text-[7.5pt]">
							{b().unit + 1} of {b().quantity}
						</span>
					</Show>
					<Show when={b().isTest}>
						<span class="rounded-full bg-petal-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
							Test
						</span>
					</Show>
				</p>
				{/* Border and words, not just colour, so it reads on a black-and-white printer. */}
				<span
					class={cn(
						"shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold print:text-[8pt]",
						payment().paid
							? "border-success bg-success text-success-foreground print:border-black print:bg-transparent print:text-black"
							: "border-warning bg-warning text-warning-foreground print:border-2 print:border-black print:bg-black print:text-white",
					)}
				>
					{payment().label}
				</span>
			</header>

			<div
				class={cn(
					"grid min-h-0 flex-1 gap-3 p-3",
					// With flowers: photo beside the list. Without: who it's for on
					// top, and the photo fills the rest of the card.
					props.withFlowers
						? "grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
						: "grid-rows-[auto_minmax(0,1fr)]",
					// On paper the photo takes whatever room the details leave.
					props.tall
						? "print:grid-cols-1 print:grid-rows-[auto_minmax(0,1fr)]"
						: "print:grid-cols-[minmax(0,1fr)_58mm] print:grid-rows-1",
					small()
						? "print:gap-[2.5mm] print:p-[2.5mm]"
						: "print:gap-[3mm] print:p-[3mm]",
				)}
			>
				<div
					class={cn(
						"relative aspect-square overflow-hidden rounded-xl bg-petal-50 print:aspect-auto print:min-h-0 print:rounded-none print:bg-transparent",
						!props.withFlowers && "row-start-2",
						props.tall
							? "print:col-start-1 print:row-start-2"
							: "print:col-start-1 print:row-start-1",
					)}
				>
					<Show
						when={photo()}
						fallback={
							<span class="absolute inset-0 flex items-center justify-center text-sm text-petal-900/40">
								No photo
							</span>
						}
					>
						{(src) => (
							<img
								src={photoSrc(src())}
								alt={`${b().title} · ${b().colorName}`}
								loading="eager"
								class={cn(
									// The whole photo, scaled to fit: never cropped.
									"absolute inset-0 size-full object-contain",
									!props.tall && "print:object-top",
								)}
							/>
						)}
					</Show>
				</div>

				<div
					class={cn(
						"flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden text-sm leading-snug",
						props.tall
							? "print:col-start-1 print:row-start-1"
							: "print:col-start-2 print:row-start-1",
						small()
							? "print:gap-[1.2mm] print:text-[8pt]"
							: "print:gap-[1.8mm] print:text-[9pt]",
					)}
				>
					<div>
						<p
							class={cn(
								"font-semibold wrap-anywhere",
								small() ? "print:text-[9.5pt]" : "print:text-[11pt]",
							)}
						>
							{b().customer.name}
						</p>
						<Show when={b().customer.company}>
							<p class="wrap-anywhere">
								{label("Company")}
								{b().customer.company}
							</p>
						</Show>
						<Show when={b().customer.className}>
							<p class="wrap-anywhere">
								{label("Class")}
								{b().customer.className}
							</p>
						</Show>
					</div>

					<Show when={props.withFlowers}>
						<Show when={b().wrapper}>
							<p class="border-t border-petal-100 pt-1 print:border-black/25">
								{label("Wrapper")}
								<strong class="font-semibold">{b().wrapper}</strong>
							</p>
						</Show>
						<div class="border-t border-petal-100 pt-1 print:border-black/25">
							<Show
								when={b().recipe.length}
								fallback={
									<p class="text-petal-900/55">
										{b().custom
											? "Custom: follow the photo."
											: "No flowers on record."}
									</p>
								}
							>
								<ul class="flex flex-col">
									<For each={b().recipe}>
										{(item) => (
											<li class="flex items-baseline gap-1.5">
												<span class="min-w-0 flex-1">
													{item.flower}
													<Show when={item.color}>
														<span class="text-petal-900/60 print:text-black/60">
															{" "}
															· {item.color}
														</span>
													</Show>
												</span>
												<span class="shrink-0 font-semibold tabular-nums">
													{item.count ? `× ${item.count}` : "cluster"}
												</span>
											</li>
										)}
									</For>
								</ul>
							</Show>
						</div>
					</Show>
				</div>
			</div>
		</article>
	);
}
