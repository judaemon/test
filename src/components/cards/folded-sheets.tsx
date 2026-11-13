import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import { FlowerMark, Sparkle, Wordmark } from "~/components/site/brand";
import { CONTACT, TAGLINE } from "~/lib/contact";
import { CARDS_PER_SHEET, centerMessage } from "~/lib/print-cards";
import { SITE_URL } from "~/lib/site";
import { cn } from "~/lib/utils";
import {
	BouquetQr,
	type CardFit,
	HelloQr,
	ScanLure,
	SheetLabel,
	SurpriseQrRow,
	shrinkToFit,
} from "./card-sheets";

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
			class="card-sheet relative box-border grid grid-cols-2 overflow-hidden bg-white text-[#1f1216]"
			style={{
				width: `${FOLD_SHEET.width}mm`,
				height: `${FOLD_SHEET.height}mm`,
				// Each row is exactly half the A4 paper, centred on the 1 mm short
				// sheet, so every card is a true quarter of the paper with the same
				// space from its outer edge as from the middle cut.
				"grid-template-rows": "repeat(2, 105mm)",
				"align-content": "center",
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
	const cut = "absolute bg-[#8a7f84]";
	const hair = "0.2mm";
	const len = "5mm";
	// Clear of the 3 mm every printer leaves blank, e.g. the Epson L3210.
	const inset = "5mm";
	const fold = (left: string, edge: "top" | "bottom") => (
		<span
			class="absolute border-l border-dashed border-[#8a7f84]"
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
 * The back cover, inside a fine frame: a few kind words at the top, ORAIA's
 * code with how to reach the shop in the open space, and "Thoughtfully
 * arranged by ORAIA" at the foot. Fine lines on white, light on ink.
 */
function BackCover() {
	return (
		<Page class="font-sans">
			<div
				class="absolute flex flex-col items-center border-petal-500"
				style={{
					inset: "6mm",
					"border-width": "0.3mm",
					"border-style": "solid",
					padding: "6mm 4mm 6mm",
				}}
			>
				<p
					class="font-display italic text-[#2b1a20] [text-wrap:balance]"
					style={{
						"font-size": "7.6pt",
						"line-height": "1.6",
						"letter-spacing": "0.03em",
					}}
				>
					{CARD_LINE}
				</p>
				<div style={{ "margin-top": "3mm" }}>
					<SparkleRule width={7} />
				</div>
				{/* The code, one caption, then how to reach us: one line each, one style. */}
				<div class="flex flex-1 flex-col items-center justify-center">
					<HelloQr size={17} />
					<p
						class="font-semibold uppercase text-petal-900"
						style={{
							"font-size": "4.8pt",
							"letter-spacing": "0.22em",
							"margin-right": "-0.22em",
							"margin-top": "2.2mm",
						}}
					>
						Scan to say hello
					</p>
					<span
						class="block bg-petal-500"
						style={{ width: "6mm", height: "0.3mm", "margin-block": "3mm" }}
					/>
					<ul
						class="flex flex-col items-center tabular-nums text-[#2b1a20]"
						style={{ "font-size": "6.2pt", "line-height": "1.6" }}
					>
						<li>{CONTACT.phone}</li>
						<li>{CONTACT.instagram}</li>
						<li>{SITE_URL.replace(/^https?:\/\//, "")}</li>
					</ul>
				</div>

				<div class="flex flex-col items-center">
					<p
						class="font-semibold uppercase text-[#2b1a20]"
						style={{
							"font-size": "4.8pt",
							"letter-spacing": "0.3em",
							"margin-right": "-0.3em",
						}}
					>
						Thoughtfully arranged by
					</p>
					<div
						class="flex items-center"
						style={{ "margin-top": "2.4mm", gap: "1.4mm" }}
					>
						<FlowerMark print class="block size-[7mm]" />
						<Wordmark class="text-[12pt] leading-none" />
					</div>
				</div>
			</div>
		</Page>
	);
}

/** Every card's kind words, at the top of the back cover. */
const CARD_LINE =
	"May this gesture remind you how appreciated and deeply thought of you are";

/** A short line, a sparkle, a short line. */
function SparkleRule(props: { width: number }) {
	// A function: one element can only be placed once.
	const line = () => (
		<span
			class="block bg-petal-500"
			style={{ width: `${props.width}mm`, height: "0.3mm" }}
		/>
	);
	return (
		<div
			class="flex items-center gap-[1.6mm] text-petal-700"
			aria-hidden="true"
		>
			{line()}
			<Sparkle style={{ width: "2.2mm", height: "2.2mm" }} />
			{line()}
		</div>
	);
}

/** The front cover: the flower, ORAIA and its tagline. Nothing else. */
function FrontCover() {
	return (
		<Page class="px-[7mm] py-[10mm]">
			<FlowerMark print class="block size-[21mm]" />
			<Wordmark class="mt-[4.5mm] block text-[15pt] leading-none" />
			<p
				class="font-display italic text-[#7a2a43]"
				style={{ "font-size": "7.5pt", "margin-top": "2.5mm" }}
			>
				{TAGLINE}
			</p>
			<div class="mt-[5mm]">
				<SparkleRule width={7} />
			</div>
		</Page>
	);
}

/**
 * The outside of a card, laid flat: the back cover (how to find ORAIA) on the
 * left, the front cover on the right. Every card's outside is the same, with
 * nothing of its own (its bouquet code is inside), so outsides can be printed
 * ahead in a stack and any one goes with any message.
 */
export function FoldedOutside() {
	return (
		<div class="grid min-h-0 grid-cols-2">
			<BackCover />
			<FrontCover />
		</div>
	);
}

/** The "To" name, small capitals over the name in the display serif. */
function ToLine(props: { to: string; centered?: boolean; rule?: boolean }) {
	return (
		<div
			class={cn(
				"flex flex-col",
				props.centered ? "items-center" : "items-start",
			)}
		>
			<p
				class="font-sans font-semibold uppercase text-[#7a2a43]"
				style={{ "font-size": "6pt", "letter-spacing": "0.28em" }}
			>
				To
			</p>
			<p
				class="font-display font-semibold leading-tight break-words"
				style={{
					"font-size": "13pt",
					"margin-top": "1mm",
					"max-width": "100%",
				}}
			>
				{props.to}
			</p>
			<Show when={props.rule !== false}>
				<span
					class="block bg-petal-500"
					style={{ width: "8mm", height: "0.35mm", "margin-top": "2.5mm" }}
				/>
			</Show>
		</div>
	);
}

/** How big the card's own QR code prints inside, in millimetres. */
const INSIDE_QR_MM = 17;
/** Smaller after a long message, where room is short. */
const SPREAD_QR_MM = 12;

/**
 * The inside of a card, laid flat. Usually who it's to on the left page and
 * the message on the right; a long message flows over both pages instead.
 * `fitFolded` picks which, so both are drawn and one is hidden. With `qr`,
 * the card's code to its bouquet page sits small at the foot of the left
 * page, below who it's to, leaving the message its page; when the message
 * takes both pages, it follows the message's last line instead.
 */
export function FoldedInside(props: {
	fitKey: string;
	/** The card's bouquet link, so its back can be checked against it. */
	link?: string;
	/** The bouquet link to print as a QR code inside, if any. */
	qr?: string;
	to: string;
	message: string;
	reference?: string;
}) {
	const centered = () => centerMessage(props.message);
	// A touch heavier than on screen: thin italic strokes print faint.
	const text =
		"m-0 whitespace-pre-line break-words font-display font-medium italic text-[#1f1216]";
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
				<Page class="px-[6mm] py-[12mm]">
					<Show
						when={props.qr}
						fallback={
							<Show
								when={props.to}
								fallback={
									<FlowerMark print class="block size-[9mm] opacity-80" />
								}
							>
								<Sparkle
									class="text-petal-700"
									style={{
										width: "2.6mm",
										height: "2.6mm",
										"margin-bottom": "4mm",
									}}
								/>
								<ToLine to={props.to} centered />
							</Show>
						}
					>
						{(link) => (
							// Who it's to across the top; under it the code, and beside it the
							// pink rule level with the code's top edge, its words under that.
							// One left edge for both, the block centered on the page.
							<div class="flex max-w-full flex-col items-start text-left">
								<Show when={props.to}>
									<div style={{ "margin-bottom": "3.5mm" }}>
										<ToLine to={props.to} rule={false} />
									</div>
								</Show>
								<div class="flex items-start gap-[3mm]">
									<BouquetQr link={link()} size={INSIDE_QR_MM} />
									<div class="flex flex-col items-start">
										<span
											aria-hidden="true"
											class="block bg-petal-500"
											style={{ width: "8mm", height: "0.35mm" }}
										/>
										<span style={{ "margin-top": "2.6mm" }}>
											<ScanLure />
										</span>
									</div>
								</div>
							</div>
						)}
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
						<div
							data-single-text
							class="flow-root"
							style={{ "line-height": "1.45" }}
						>
							<p class={cn(text, wrap())}>{props.message}</p>
						</div>
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
					<div
						data-spread-text
						class="flow-root"
						style={{ "line-height": "1.45", orphans: 2, widows: 2 }}
					>
						<p class={cn(text, "[text-wrap:pretty]")}>{props.message}</p>
						<Show when={props.qr}>
							{(link) => (
								<span
									class="block"
									style={{ "margin-top": "4mm", "break-inside": "avoid" }}
								>
									<SurpriseQrRow link={link()} size={SPREAD_QR_MM} />
								</span>
							)}
						</Show>
					</div>
				</div>
			</div>

			<Show when={props.reference}>
				<p
					class="absolute truncate font-sans tabular-nums text-[#6b5e63]"
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

/** A sheet of four outsides, all alike. */
export function FoldedOutsideSheet(props: {
	guides?: boolean;
	label?: string;
	upsideDown?: boolean;
}) {
	return (
		<FoldedSheet
			guides={props.guides}
			label={props.label}
			upsideDown={props.upsideDown}
		>
			<For each={Array.from({ length: CARDS_PER_SHEET })}>
				{() => <FoldedOutside />}
			</For>
		</FoldedSheet>
	);
}
