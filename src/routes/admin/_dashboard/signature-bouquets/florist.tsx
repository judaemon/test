import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import { adminButton, adminCard, PageHeader } from "~/components/admin/ui";
import { findArrangementType } from "~/lib/arrangements";
import { sortedRecipe } from "~/lib/flowers";
import { photoSrc } from "~/lib/photos";
import { printFileName, usePrintTitle } from "~/lib/print-title";
import { wrapperNames } from "~/lib/product";
import { findSize } from "~/lib/sizes";
import { useArrangementTypes, useSizes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { getFloristList } from "~/server/admin/florist";
import type { RecipeVersionInfo } from "~/server/recipe-versions";
import type { AdminProduct, AdminVariant, RecipeItem } from "~/types/product";

export const Route = createFileRoute(
	"/admin/_dashboard/signature-bouquets/florist",
)({
	loader: () => getFloristList(),
	component: FloristListPage,
});

/**
 * How the cards fill an A4 sheet. Two per page is the sample's look (A4
 * landscape); more per page saves paper. The photo always sits on top.
 */
const LAYOUTS = {
	2: { label: "2 per page", landscape: true, cols: 2, rows: 1 },
	4: { label: "4 per page", landscape: false, cols: 2, rows: 2 },
	6: { label: "6 per page", landscape: false, cols: 3, rows: 2 },
} as const;
type PerPage = keyof typeof LAYOUTS;

/** What each card shows: the flowers to make it, or just the photo and name. */
const CONTENTS = {
	full: "Photo & flowers",
	photo: "Photo & name only",
} as const;
type Contents = keyof typeof CONTENTS;

type Orientation = "landscape" | "portrait";

/** Paper, in millimetres; the sheet's own padding stands in for margins. */
const A4 = { short: 210, long: 297, margin: 7, footer: 6, gap: 4 };

interface Card {
	product: AdminProduct;
	variant: AdminVariant;
	version?: RecipeVersionInfo;
}

function FloristListPage() {
	const data = Route.useLoaderData();
	const types = useArrangementTypes();
	const sizes = useSizes();
	const [perPage, setPerPage] = createSignal<PerPage>(4);
	const [contents, setContents] = createSignal<Contents>("full");
	const [orientation, setOrientation] = createSignal<Orientation>("landscape");
	/** 2 per page is always the photo and name; 4 and 6 can have the flowers. */
	const photoOnly = () => perPage() === 2 || contents() === "photo";
	/** Only 2 per page can turn the sheet. */
	const canTurn = () => perPage() === 2;
	const [chosenTypes, setChosenTypes] = createSignal<string[]>([]);
	const [includeHidden, setIncludeHidden] = createSignal(false);
	const [onlyNewer, setOnlyNewer] = createSignal(false);

	const layout = () =>
		canTurn() && orientation() === "portrait"
			? { landscape: false, cols: 1, rows: 2 }
			: LAYOUTS[perPage()];
	const cards = createMemo((): Card[] =>
		data()
			.products.filter(
				(product) =>
					(includeHidden() || product.isVisible) &&
					(!chosenTypes().length ||
						chosenTypes().includes(product.arrangement)) &&
					(!onlyNewer() || (data().versions[product.id]?.version ?? 1) > 1),
			)
			.flatMap((product) =>
				product.variants.map((variant) => ({
					product,
					variant,
					version: data().versions[product.id],
				})),
			),
	);
	const pages = createMemo(() => {
		const size = perPage();
		const list = cards();
		return Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
			list.slice(i * size, (i + 1) * size),
		);
	});
	const bouquetCount = () => new Set(cards().map((c) => c.product.id)).size;
	const newerCount = () =>
		Object.values(data().versions).filter((v) => v.version > 1).length;

	const printedOn = new Date().toLocaleDateString("en-PH", {
		timeZone: "Asia/Manila",
		dateStyle: "long",
	});
	const sheet = () =>
		layout().landscape
			? { width: A4.long, height: A4.short }
			: { width: A4.short, height: A4.long };

	// The saved PDF's name: "Florist list - Photo & name - Portrait 2 per page - Nov 11".
	usePrintTitle(() =>
		printFileName([
			"Florist list",
			photoOnly() ? "Photo & name" : "Photo & flowers",
			`${layout().landscape ? "Landscape" : "Portrait"} ${perPage()} per page`,
		]),
	);

	const [printing, setPrinting] = createSignal(false);
	/** Waits for every photo, so none prints blank, then opens the print dialog. */
	const print = async () => {
		setPrinting(true);
		const images = [
			...document.querySelectorAll<HTMLImageElement>("[data-florist] img"),
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

	const toggleType = (id: string) =>
		setChosenTypes((list) =>
			list.includes(id) ? list.filter((t) => t !== id) : [...list, id],
		);
	const pill = (on: boolean) =>
		cn(
			"rounded-full border px-3.5 py-1.5 text-sm transition-colors",
			on
				? "border-petal-700 bg-petal-700 font-medium text-white"
				: "border-petal-200 bg-white hover:bg-petal-50",
		);

	return (
		<div class="print:p-0">
			<style>{`@page { size: A4 ${layout().landscape ? "landscape" : "portrait"}; margin: 0; }`}</style>
			<div class="print:hidden">
				<PageHeader
					title="Florist list"
					description="Every style with its flowers, to print on A4 for the florist. Each bouquet has a version: v1 is its flowers when versions began, and every save that changes its flowers makes the next one, so the florist can tell an old sheet from a new one."
					actions={
						<>
							<Link
								to="/admin/signature-bouquets"
								class={adminButton.secondary}
							>
								Back to arrangements
							</Link>
							<button
								type="button"
								onClick={() => void print()}
								disabled={!cards().length || printing()}
								class={adminButton.primary}
							>
								{printing() ? "Loading photos…" : "Print or save PDF"}
							</button>
						</>
					}
				/>
				<div class={cn(adminCard, "mb-6 flex flex-col gap-4 p-5")}>
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">On each A4 page</span>
						<For each={Object.keys(LAYOUTS).map(Number) as PerPage[]}>
							{(n) => (
								<button
									type="button"
									aria-pressed={perPage() === n}
									onClick={() => setPerPage(n)}
									class={pill(perPage() === n)}
								>
									{LAYOUTS[n].label}
								</button>
							)}
						</For>
					</div>
					<Show
						when={!canTurn()}
						fallback={
							<p class="-mt-2 text-xs text-petal-900/55">
								2 per page shows each bouquet’s photo and name only.
							</p>
						}
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="mr-1 text-sm font-medium">On each card</span>
							<For each={Object.keys(CONTENTS) as Contents[]}>
								{(key) => (
									<button
										type="button"
										aria-pressed={contents() === key}
										onClick={() => setContents(key)}
										class={pill(contents() === key)}
									>
										{CONTENTS[key]}
									</button>
								)}
							</For>
						</div>
					</Show>
					<Show when={canTurn()}>
						<div class="flex flex-wrap items-center gap-2">
							<span class="mr-1 text-sm font-medium">A4 paper</span>
							<For each={["landscape", "portrait"] as Orientation[]}>
								{(key) => (
									<button
										type="button"
										aria-pressed={orientation() === key}
										onClick={() => setOrientation(key)}
										class={pill(orientation() === key)}
									>
										{key === "landscape" ? "Landscape" : "Portrait"}
									</button>
								)}
							</For>
							<span class="text-xs text-petal-900/55">
								{orientation() === "landscape"
									? "Side by side"
									: "One above the other"}
							</span>
						</div>
					</Show>
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">Type</span>
						<For each={types()}>
							{(type) => (
								<button
									type="button"
									aria-pressed={chosenTypes().includes(type.id)}
									onClick={() => toggleType(type.id)}
									class={pill(chosenTypes().includes(type.id))}
								>
									{type.pluralName}
								</button>
							)}
						</For>
						<Show when={chosenTypes().length}>
							<button
								type="button"
								onClick={() => setChosenTypes([])}
								class="px-2 text-sm text-petal-700 underline underline-offset-2"
							>
								All types
							</button>
						</Show>
					</div>
					<div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<label class="flex min-h-10 cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={includeHidden()}
								onChange={(e) => setIncludeHidden(e.currentTarget.checked)}
								class="size-5 accent-petal-700"
							/>
							Include arrangements hidden from the shop
						</label>
						<label class="flex min-h-10 cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={onlyNewer()}
								onChange={(e) => setOnlyNewer(e.currentTarget.checked)}
								class="size-5 accent-petal-700"
							/>
							Only bouquets on v2 or later ({newerCount()})
						</label>
					</div>
					<p class="text-sm text-petal-900/65">
						{cards().length} styles from {bouquetCount()} arrangements ·{" "}
						{pages().length} {pages().length === 1 ? "page" : "pages"}. In the
						print dialog, keep the paper on A4 and margins on “Default” or
						“None”.
					</p>
				</div>
			</div>

			<div
				data-florist
				class="flex flex-col items-center gap-6 overflow-x-auto pb-10 print:block print:gap-0 print:overflow-visible print:p-0"
			>
				<Show
					when={pages().length}
					fallback={
						<p class="text-petal-900/60 print:hidden">
							No styles match these choices.
						</p>
					}
				>
					<For each={pages()}>
						{(page, i) => (
							<section
								class="flex shrink-0 flex-col bg-white text-[#2a1418] shadow-md ring-1 ring-black/10 print:break-after-page print:shadow-none print:ring-0 print:last:break-after-auto"
								style={{
									width: `${sheet().width}mm`,
									height: `${sheet().height}mm`,
									padding: `${A4.margin}mm`,
									"padding-bottom": "0",
								}}
								aria-label={`Page ${i() + 1}`}
							>
								<div
									class="grid min-h-0 flex-1"
									style={{
										"grid-template-columns": `repeat(${layout().cols}, minmax(0, 1fr))`,
										// Stacked cards share each row's tracks (photo, then
										// flowers), so photos in a row end at the same line.
										"grid-template-rows": `repeat(${layout().rows}, minmax(0, 1fr) auto)`,
										"column-gap": `${A4.gap}mm`,
									}}
								>
									<For each={page}>
										{(card) => (
											<FloristCard
												card={card}
												perPage={perPage()}
												photoOnly={photoOnly()}
												photos={data().flowerPhotos}
												typeLabel={findArrangementType(
													types(),
													card.product.arrangement,
												)}
												size={findSize(sizes(), card.product.size)}
											/>
										)}
									</For>
								</div>
								<footer
									class="flex shrink-0 items-center justify-between text-[8pt] text-black/55"
									style={{ height: `${A4.footer}mm` }}
								>
									<span>ORAIA · florist list · printed {printedOn}</span>
									<span>
										Page {i() + 1} of {pages().length}
									</span>
								</footer>
							</section>
						)}
					</For>
				</Show>
			</div>
		</div>
	);
}

/** The style's front photo if one is tagged, else its first. */
function mainPhoto(variant: AdminVariant) {
	const front = variant.imageTags?.indexOf("front") ?? -1;
	return variant.images[front >= 0 ? front : 0];
}

/** Stems, not counting filler; filler-only recipes count their filler. */
function flowerCount(recipe: RecipeItem[]) {
	const stems = (list: RecipeItem[]) =>
		list.reduce((sum, item) => sum + (item.count ?? 1), 0);
	const main = recipe.filter((item) => !item.filler);
	return stems(main.length ? main : recipe);
}

function FloristCard(props: {
	card: Card;
	perPage: PerPage;
	/** Just the photo and the name under it. */
	photoOnly: boolean;
	photos: Record<string, string>;
	typeLabel?: { name: string; description: string };
	size?: { name: string; description: string };
}) {
	const product = () => props.card.product;
	const variant = () => props.card.variant;
	const recipe = () => variant().recipe;
	const big = () => props.perPage === 2;
	const small = () => props.perPage === 6;
	const photo = () => mainPhoto(variant());
	const flowerPhoto = (item: RecipeItem) =>
		props.photos[`${item.flower}|${item.color ?? ""}`] ??
		props.photos[`${item.flower}|`];
	const versionDate = () =>
		props.card.version
			? new Date(props.card.version.createdAt).toLocaleDateString("en-PH", {
					timeZone: "Asia/Manila",
					month: "short",
					day: "numeric",
					year: "numeric",
				})
			: "";
	const wrappers = () => wrapperNames(variant().wrapperColor).join(" + ");

	return (
		<article
			class={cn(
				"row-span-2 grid min-h-0 grid-rows-subgrid overflow-hidden break-inside-avoid",
			)}
		>
			<div class="relative min-h-0 overflow-hidden rounded-[2mm]">
				<Show
					when={photo()}
					fallback={
						<span class="absolute inset-0 flex items-center justify-center text-[9pt] text-black/40">
							No photo
						</span>
					}
				>
					{(src) => (
						<img
							src={photoSrc(src())}
							alt={`${product().title} · ${variant().colorName}`}
							loading="eager"
							// The whole photo, scaled to fit: never cropped. Sits on the
							// name or flowers below it, any spare room above.
							class="absolute inset-0 size-full object-contain object-bottom"
						/>
					)}
				</Show>
			</div>

			<Show when={props.photoOnly}>
				<div class="min-w-0 pt-[2mm] pb-[4mm] text-center">
					<h2
						class={cn(
							"font-display font-semibold leading-tight",
							big() ? "text-[24pt]" : small() ? "text-[13pt]" : "text-[16pt]",
						)}
					>
						{product().title}
					</h2>
					<p
						class={cn(
							"text-black/65",
							big() ? "text-[13pt]" : small() ? "text-[8.5pt]" : "text-[10pt]",
						)}
					>
						{variant().colorName}
					</p>
				</div>
			</Show>

			<Show when={!props.photoOnly}>
				<div
					class={cn(
						"flex min-w-0 flex-col pt-[2mm] pb-[4mm]",
						big() ? "text-[10pt]" : small() ? "text-[7.5pt]" : "text-[8.5pt]",
					)}
				>
					<div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-[0.5mm]">
						<h2
							class={cn(
								"min-w-0 font-display font-semibold leading-tight",
								big() ? "text-[20pt]" : small() ? "text-[12pt]" : "text-[14pt]",
							)}
						>
							{product().title}
							<span class="font-sans text-[0.6em] font-normal text-black/60">
								{" "}
								· {variant().colorName}
							</span>
						</h2>
						<span
							class="shrink-0 rounded-full border border-black/30 px-[2mm] py-[0.3mm] text-[8pt] font-semibold tabular-nums"
							title={
								props.card.version
									? `Flowers saved by ${props.card.version.createdBy}`
									: undefined
							}
						>
							v{props.card.version?.version ?? 1}
							<Show when={versionDate()}>
								<span class="font-normal text-black/60">
									{" "}
									· {versionDate()}
								</span>
							</Show>
						</span>
					</div>

					<div class="mt-[1.5mm] flex items-baseline justify-between border-b border-black/15 pb-[0.8mm] font-semibold">
						<span>
							What’s in this{" "}
							{product().arrangement === "bouquet"
								? "bouquet"
								: (props.typeLabel?.name.toLowerCase() ?? "arrangement")}
						</span>
						<span class="tabular-nums">{flowerCount(recipe())} flowers</span>
					</div>
					<Show
						when={recipe().length}
						fallback={
							<p class="py-[1mm] text-black/55">No flowers on record yet.</p>
						}
					>
						<ul class="flex flex-col gap-[0.6mm] py-[1mm]">
							<For each={sortedRecipe(recipe())}>
								{(item) => (
									<li class="flex items-center gap-[2mm]">
										<span
											class={cn(
												"shrink-0 overflow-hidden rounded-[1mm] bg-black/5",
												big()
													? "size-[9mm]"
													: small()
														? "size-[5mm]"
														: "size-[6mm]",
											)}
										>
											<Show when={flowerPhoto(item)}>
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
												<span class="text-black/60"> · {item.color}</span>
											</Show>
											<Show when={item.filler}>
												<span class="text-black/50"> (filler)</span>
											</Show>
										</span>
										<span class="shrink-0 font-semibold tabular-nums">
											× {item.count ?? 1}
										</span>
									</li>
								)}
							</For>
						</ul>
					</Show>

					<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[3mm] gap-y-[0.3mm] border-t border-black/15 pt-[1mm]">
						<dt class="text-black/55">Type</dt>
						<dd>
							<strong class="font-semibold">
								{props.typeLabel?.name ?? product().arrangement}
							</strong>
							<Show when={big() && props.typeLabel?.description}>
								<span class="text-black/60">
									{" "}
									· {props.typeLabel?.description}
								</span>
							</Show>
						</dd>
						<dt class="text-black/55">Wrapper</dt>
						<dd>{wrappers() || "None"}</dd>
						<dt class="text-black/55">Size</dt>
						<dd>
							<strong class="font-semibold">
								{props.size?.name ?? "Not set"}
							</strong>
							<Show when={props.size?.description}>
								<span class="text-black/60"> · {props.size?.description}</span>
							</Show>
						</dd>
					</dl>
				</div>
			</Show>
		</article>
	);
}
