import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import { FlowerMark, Sparkle, Wordmark } from "~/components/site/brand";
import { CONTACT, TAGLINE } from "~/lib/contact";
import { CARDS_PER_SHEET, centerMessage } from "~/lib/print-cards";
import { cn } from "~/lib/utils";
import { type CardFit, CardQrs, SheetLabel, shrinkToFit } from "./card-sheets";

/**
 * A4 landscape, drawn 1 mm short so rounding never spills onto a blank page.
 * Four cards, two across and two down; each cuts to 148.5 × 104.5 mm and folds
 * down the middle into a 74 × 104.5 mm card that opens like a book.
 */
export const FOLD_SHEET = { width: 297, height: 209 } as const;

/** A message smaller than this on the right-hand page flows over both inside pages. */
/**
 * Sizes, in points. A small card reads best at a gentle size, so a short
 * message stops growing at 13pt rather than filling the page edge to edge.
 * Below 10.5pt on one page, a message is easier to read over both.
 */
const SPREAD_BELOW_PT = 10.5;
const MAX_PT = 13;
const SPREAD_MAX_PT = 11.5;
const MIN_PT = 7.5;

/**
 * Sizes every folded card's message: on the right-hand inside page if it fits
 * there at a readable size, else flowing over both inside pages. Says how each
 * fitted, keyed by card. Measures layout, so call it after render.
 */
export function fitFolded(root: ParentNode = document) {
	const fits = new Map<string, CardFit>();
	for (const card of root.querySelectorAll<HTMLElement>("[data-fold-inside]")) {
		const key = card.dataset.foldInside;
		const single = card.querySelector<HTMLElement>("[data-single-box]");
		const singleText = card.querySelector<HTMLElement>("[data-single-text]");
		const spread = card.querySelector<HTMLElement>("[data-spread-box]");
		const spreadText = card.querySelector<HTMLElement>("[data-spread-text]");
		if (!key || !single || !singleText || !spread || !spreadText) continue;

		card.dataset.mode = "single";
		const alone = shrinkToFit(single, singleText, SPREAD_BELOW_PT, MAX_PT);
		if (alone.fits) {
			fits.set(key, { pt: alone.pt, overflow: false });
			continue;
		}
		card.dataset.mode = "spread";
		// Balanced columns: half the message on each page, centered as a block.
		const both = shrinkToFit(spread, spreadText, MIN_PT, SPREAD_MAX_PT);
		fits.set(key, { pt: both.pt, overflow: !both.fits, spread: true });
	}
	return fits;
}

/**
 * One landscape sheet of four folded cards. Cut guides sit at the middle of
 * each edge and the center; fold guides, dashed, above and below each fold.
 */
export function FoldedSheet(props: {
	children: JSX.Element;
	guides?: boolean;
	/** Tiny "Sheet 2 of 5 · messages" by the top cut mark, with the guides. */
	label?: string;
	/** Turned around, for how the stack goes back into the printer. */
	upsideDown?: boolean;
}) {
	return (
		<div
			class="card-sheet relative box-border grid grid-cols-2 grid-rows-2 overflow-hidden bg-white text-[#2b1a20]"
			style={{
				width: `${FOLD_SHEET.width}mm`,
				height: `${FOLD_SHEET.height}mm`,
				transform: props.upsideDown ? "rotate(180deg)" : undefined,
				"print-color-adjust": "exact",
				"-webkit-print-color-adjust": "exact",
			}}
		>
			{props.children}
			<Show when={props.guides}>
				<FoldGuides />
				<SheetLabel label={props.label} />
			</Show>
		</div>
	);
}

function FoldGuides() {
	const cut = "absolute bg-[#b8aeb1]";
	const hair = "0.2mm";
	const len = "5mm";
	const inset = "3mm";
	const fold = (left: string, edge: "top" | "bottom") => (
		<span
			class="absolute border-l border-dashed border-[#b8aeb1]"
			style={{ left, [edge]: inset, height: len, "border-left-width": hair }}
		/>
	);
	return (
		<div aria-hidden="true" class="pointer-events-none absolute inset-0">
			<span
				class={cut}
				style={{ left: "50%", top: inset, width: hair, height: len }}
			/>
			<span
				class={cut}
				style={{ left: "50%", bottom: inset, width: hair, height: len }}
			/>
			<span
				class={cut}
				style={{ top: "50%", left: inset, height: hair, width: len }}
			/>
			<span
				class={cut}
				style={{ top: "50%", right: inset, height: hair, width: len }}
			/>
			<span
				class={cut}
				style={{
					left: "50%",
					top: "calc(50% - 2.5mm)",
					width: hair,
					height: len,
				}}
			/>
			<span
				class={cut}
				style={{
					top: "50%",
					left: "calc(50% - 2.5mm)",
					height: hair,
					width: len,
				}}
			/>
			{fold("25%", "top")}
			{fold("25%", "bottom")}
			{fold("75%", "top")}
			{fold("75%", "bottom")}
		</div>
	);
}

/** Half of an open card: one page, 74 × 104.5 mm. */
function Page(props: { children: JSX.Element; class?: string }) {
	return (
		<div
			class={cn(
				"relative box-border flex min-h-0 min-w-0 flex-col items-center justify-center text-center",
				props.class,
			)}
		>
			{props.children}
		</div>
	);
}

/**
 * The outside of a card, laid flat: the back cover (how to find ORAIA) on the
 * left, the front cover on the right. Every card's outside is the same.
 */
export function FoldedOutside(props: { link?: string }) {
	return (
		<div class="grid min-h-0 grid-cols-2">
			<Page class="px-[6mm] py-[10mm] font-sans">
				<Sparkle
					class="text-petal-500"
					style={{ width: "2.4mm", height: "2.4mm" }}
				/>
				<span class="mt-[5mm]">
					<CardQrs
						link={props.link}
						size={props.link ? 17 : 20}
						pt={props.link ? 4.8 : 5.5}
					/>
				</span>
				<span
					class="block bg-petal-300"
					style={{ width: "8mm", height: "0.25mm", "margin-block": "3.5mm" }}
				/>
				<p class="tabular-nums text-[#4a3a40]" style={{ "font-size": "7pt" }}>
					{CONTACT.phone}
				</p>
				<p
					class="text-[#4a3a40]"
					style={{ "font-size": "7pt", "margin-top": "0.8mm" }}
				>
					{CONTACT.instagram}
				</p>
				<p
					class="text-[#8a7c81]"
					style={{ "font-size": "6pt", "margin-top": "0.8mm" }}
				>
					{CONTACT.location}
				</p>
				<span class="absolute inset-x-0 bottom-[8mm] flex justify-center">
					<Wordmark class="text-[7pt] leading-none" />
				</span>
			</Page>
			<Page class="px-[7mm] py-[10mm]">
				<FlowerMark class="block size-[21mm]" />
				<Wordmark class="mt-[4.5mm] block text-[15pt] leading-none" />
				<p
					class="font-display italic text-petal-700"
					style={{ "font-size": "7.5pt", "margin-top": "2.5mm" }}
				>
					{TAGLINE}
				</p>
				<div
					class="mt-[5mm] flex items-center gap-[2mm] text-petal-500"
					aria-hidden="true"
				>
					<span
						class="block bg-petal-300"
						style={{ width: "7mm", height: "0.25mm" }}
					/>
					<Sparkle style={{ width: "2.2mm", height: "2.2mm" }} />
					<span
						class="block bg-petal-300"
						style={{ width: "7mm", height: "0.25mm" }}
					/>
				</div>
			</Page>
		</div>
	);
}

/** The "To" name, small capitals over the name in the display serif. */
function ToLine(props: { to: string; centered?: boolean }) {
	return (
		<div
			class={cn(
				"flex flex-col",
				props.centered ? "items-center" : "items-start",
			)}
		>
			<p
				class="font-sans font-medium uppercase text-petal-700"
				style={{ "font-size": "6pt", "letter-spacing": "0.28em" }}
			>
				To
			</p>
			<p
				class="font-display font-medium leading-tight break-words"
				style={{
					"font-size": "13pt",
					"margin-top": "1mm",
					"max-width": "100%",
				}}
			>
				{props.to}
			</p>
			<span
				class="block bg-petal-300"
				style={{ width: "8mm", height: "0.25mm", "margin-top": "2.5mm" }}
			/>
		</div>
	);
}

/**
 * The inside of a card, laid flat. Usually who it's to on the left page and
 * the message on the right; a long message flows over both pages instead.
 * `fitFolded` picks which, so both are drawn and one is hidden.
 */
export function FoldedInside(props: {
	fitKey: string;
	/** The card's bouquet link, so its back can be checked against it. */
	link?: string;
	to: string;
	message: string;
	reference?: string;
}) {
	const centered = () => centerMessage(props.message);
	const text = "m-0 whitespace-pre-line break-words font-display italic";
	// No lone word on a last line; short centered notes get even lines.
	const wrap = () =>
		centered() ? "[text-wrap:balance]" : "[text-wrap:pretty]";
	return (
		<div
			data-fold-inside={props.fitKey}
			data-link={props.link}
			class="group relative min-h-0 min-w-0"
		>
			{/* To on the left page, message on the right. */}
			<div class="grid size-full grid-cols-2 group-data-[mode=spread]:hidden">
				<Page class="px-[8mm] py-[12mm]">
					<Show
						when={props.to}
						fallback={<FlowerMark class="block size-[9mm] opacity-80" />}
					>
						<Sparkle
							class="text-petal-500"
							style={{
								width: "2.6mm",
								height: "2.6mm",
								"margin-bottom": "4mm",
							}}
						/>
						<ToLine to={props.to} centered />
					</Show>
				</Page>
				<Page class="px-[10mm] py-[11mm]">
					<div
						data-single-box
						class={cn(
							"flex size-full min-h-0 flex-col justify-center overflow-hidden",
							centered() ? "text-center" : "text-left",
						)}
					>
						<p
							data-single-text
							class={cn(text, wrap())}
							style={{ "line-height": "1.45" }}
						>
							{props.message}
						</p>
					</div>
				</Page>
			</div>

			{/* Long: the message is shared evenly by both pages, centered top to bottom. */}
			<div
				data-spread-box
				class="hidden size-full flex-col justify-center overflow-hidden text-left group-data-[mode=spread]:flex"
				style={{ padding: "15mm 10mm 15mm" }}
			>
				<div
					style={{
						"column-count": 2,
						"column-gap": "20mm",
						"column-fill": "balance",
					}}
				>
					<Show when={props.to}>
						<div style={{ "margin-bottom": "4mm", "break-inside": "avoid" }}>
							<ToLine to={props.to} />
						</div>
					</Show>
					<p
						data-spread-text
						class={cn(text, "[text-wrap:pretty]")}
						style={{ "line-height": "1.45", orphans: 2, widows: 2 }}
					>
						{props.message}
					</p>
				</div>
			</div>

			<Show when={props.reference}>
				<p
					class="absolute truncate font-sans tabular-nums text-[#9d9195]"
					style={{
						left: "6mm",
						bottom: "4mm",
						"max-width": "62mm",
						"font-size": "5pt",
					}}
				>
					{props.reference}
				</p>
			</Show>
		</div>
	);
}

/** An unused spot: blank on paper, marked in the preview. */
export function EmptyFolded() {
	return (
		<div class="flex items-center justify-center p-[8mm]">
			<span class="flex size-full items-center justify-center rounded-[3mm] border-[0.4mm] border-dashed border-petal-200 text-center font-sans text-[9pt] text-petal-900/40 print:hidden">
				Spare card
			</span>
		</div>
	);
}

/** A sheet of four outsides. */
export function FoldedOutsideSheet(props: {
	guides?: boolean;
	label?: string;
	upsideDown?: boolean;
	/** Each spot's bouquet link, already mirrored (see `mirrorSheet`). */
	links?: (string | undefined)[];
}) {
	return (
		<FoldedSheet
			guides={props.guides}
			label={props.label}
			upsideDown={props.upsideDown}
		>
			<For each={Array.from({ length: CARDS_PER_SHEET })}>
				{(_, spot) => <FoldedOutside link={props.links?.[spot()]} />}
			</For>
		</FoldedSheet>
	);
}
