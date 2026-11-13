import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import { FlowerMark, Sparkle, Wordmark } from "~/components/site/brand";
import { CONTACT, TAGLINE } from "~/lib/contact";
import { bouquetPath, CARDS_PER_SHEET, centerMessage } from "~/lib/print-cards";
import { qrPath } from "~/lib/qr";
import { absoluteUrl } from "~/lib/site";
import { cn } from "~/lib/utils";

/**
 * An A4 sheet is 297 mm tall; it's drawn 1 mm shorter so rounding never
 * pushes it onto a second, blank page. Each card is then 105 × 148 mm.
 */
export const SHEET = { width: 210, height: 296 } as const;

/** Largest and smallest message size, in points; a message shrinks to fit. */
const MAX_PT = 19;
const MIN_PT = 8;
/** Below this the card still prints, but staff are told it's small. */
export const SMALL_PT = 10.5;

/** How a message fitted on its card. */
export interface CardFit {
	pt: number;
	/** Still too long at the smallest size: the end is cut off. */
	overflow: boolean;
	/** Folded cards: the message runs over both inside pages. */
	spread?: boolean;
}

/**
 * Sets `text` to the biggest size, from `max` down to `min` points, at which
 * `box` holds it (by default: nothing below its bottom edge).
 */
export function shrinkToFit(
	box: HTMLElement,
	text: HTMLElement,
	min: number,
	max: number,
	holds = () => box.scrollHeight <= box.clientHeight + 0.5,
) {
	const fitsAt = (pt: number) => {
		text.style.fontSize = `${pt}pt`;
		return holds();
	};
	if (fitsAt(max)) return { pt: max, fits: true };
	// Halve the range until it's within a quarter point.
	let lo = min;
	let hi = max;
	while (hi - lo > 0.25) {
		const mid = (lo + hi) / 2;
		if (fitsAt(mid)) lo = mid;
		else hi = mid;
	}
	const pt = Math.floor(lo * 4) / 4;
	return { pt, fits: fitsAt(pt) };
}

/**
 * Sizes every message on the page to the biggest that fits its card, and says
 * how each one fitted, keyed by card. Measures layout, so call it after render.
 */
export function fitMessages(root: ParentNode = document) {
	const fits = new Map<string, CardFit>();
	for (const box of root.querySelectorAll<HTMLElement>("[data-fit-box]")) {
		const message = box.querySelector<HTMLElement>("[data-fit-text]");
		const key = box.dataset.fitBox;
		if (!message || !key) continue;
		const { pt, fits: fit } = shrinkToFit(box, message, MIN_PT, MAX_PT);
		fits.set(key, { pt, overflow: !fit });
	}
	return fits;
}

/**
 * One A4 sheet of four cards, two across and two down, with no page margin:
 * every card keeps 12 mm or more clear of its edges, more than any printer's
 * unprintable border, and cuts square on the guides.
 */
export function Sheet(props: {
	children: JSX.Element;
	/** Fine marks at the cut lines, outside the cards' content. */
	guides?: boolean;
	/** Tiny words by the top cut mark, "Sheet 2 of 5 · messages", with the guides. */
	label?: string;
	/** Turned around, for how the stack goes back into the printer. */
	upsideDown?: boolean;
	class?: string;
}) {
	return (
		<div
			class={cn(
				"card-sheet relative box-border grid grid-cols-2 overflow-hidden bg-white text-[#1f1216]",
				props.class,
			)}
			style={{
				width: `${SHEET.width}mm`,
				height: `${SHEET.height}mm`,
				// Each row is exactly half the A4 paper, centred on the 1 mm short
				// sheet, so every card is a true quarter of the paper with the same
				// space from its outer edge as from the middle cut.
				"grid-template-rows": "repeat(2, 148.5mm)",
				"align-content": "center",
				transform: props.upsideDown ? "rotate(180deg)" : undefined,
				"print-color-adjust": "exact",
				"-webkit-print-color-adjust": "exact",
			}}
		>
			{props.children}
			<Show when={props.guides}>
				<CutGuides />
				<SheetLabel label={props.label} />
			</Show>
		</div>
	);
}

/**
 * Which sheet and side this is, in tiny type just right of the top cut mark,
 * inside the margin no card's words reach: for matching sides by hand.
 */
export function SheetLabel(props: { label?: string }) {
	return (
		<Show when={props.label}>
			<span
				class="pointer-events-none absolute whitespace-nowrap font-sans text-[#8a7f84]"
				style={{ left: "calc(50% + 2.5mm)", top: "5.4mm", "font-size": "5pt" }}
			>
				{props.label}
			</span>
		</Show>
	);
}

/** Hairline ticks where to cut: the middle of each edge, and a cross at the center. */
function CutGuides() {
	const mark = "absolute bg-[#8a7f84]";
	const len = "5mm";
	// Clear of the 3 mm every printer leaves blank, e.g. the Epson L3210.
	const inset = "5mm";
	const hair = "0.2mm";
	return (
		<div aria-hidden="true" class="pointer-events-none absolute inset-0">
			{/* Down the middle: top and bottom edges. */}
			<span
				class={mark}
				style={{ left: "50%", top: inset, width: hair, height: len }}
			/>
			<span
				class={mark}
				style={{ left: "50%", bottom: inset, width: hair, height: len }}
			/>
			{/* Across the middle: left and right edges. */}
			<span
				class={mark}
				style={{ top: "50%", left: inset, height: hair, width: len }}
			/>
			<span
				class={mark}
				style={{ top: "50%", right: inset, height: hair, width: len }}
			/>
			{/* Center cross. */}
			<span
				class={mark}
				style={{
					left: "50%",
					top: "calc(50% - 2.5mm)",
					width: hair,
					height: len,
				}}
			/>
			<span
				class={mark}
				style={{
					top: "50%",
					left: "calc(50% - 2.5mm)",
					height: hair,
					width: len,
				}}
			/>
		</div>
	);
}

/** The card's dedication: who it's to, then the message, sized to fit. */
export function CardFront(props: {
	/** Keys the fit result; see `fitMessages`. */
	fitKey: string;
	/** The card's bouquet link, so its back can be checked against it. */
	link?: string;
	to: string;
	message: string;
	/** Tiny order number and bouquet, to match the card to its bouquet. */
	reference?: string;
}) {
	const centered = () => centerMessage(props.message);
	return (
		<article
			data-link={props.link}
			class="relative box-border flex min-h-0 flex-col overflow-hidden"
			style={{ padding: "13mm 13mm 10mm" }}
		>
			<Sparkle
				class="mx-auto shrink-0 text-petal-700"
				style={{ width: "3mm", height: "3mm" }}
			/>
			<div
				data-fit-box={props.fitKey}
				class={cn(
					"flex min-h-0 flex-1 flex-col justify-center overflow-hidden",
					centered() ? "text-center" : "text-left",
				)}
				style={{ "padding-block": "4mm" }}
			>
				<Show when={props.to}>
					<div
						class={cn("mb-[4.5mm]", centered() && "flex flex-col items-center")}
					>
						<p
							class="font-sans font-semibold uppercase text-[#7a2a43]"
							style={{ "font-size": "6.5pt", "letter-spacing": "0.28em" }}
						>
							To
						</p>
						<p
							class="font-display font-semibold leading-tight break-words"
							style={{ "font-size": "13pt", "margin-top": "1mm" }}
						>
							{props.to}
						</p>
						<span
							class="block bg-petal-500"
							style={{ width: "9mm", height: "0.35mm", "margin-top": "2.5mm" }}
						/>
					</div>
				</Show>
				<p
					data-fit-text
					class={cn(
						"m-0 whitespace-pre-line break-words font-display font-medium italic",
						centered() ? "[text-wrap:balance]" : "[text-wrap:pretty]",
					)}
					style={{ "line-height": "1.42", "font-size": `${MAX_PT}pt` }}
				>
					{props.message}
				</p>
			</div>
			<FlowerMark print class="mx-auto size-[6mm] shrink-0" />
			<Show when={props.reference}>
				<p
					class="absolute truncate font-sans tabular-nums text-[#6b5e63]"
					style={{
						left: "9mm",
						right: "9mm",
						bottom: "5mm",
						"font-size": "5.5pt",
						"text-align": "left",
					}}
				>
					{props.reference}
				</p>
			</Show>
		</article>
	);
}

/** An unused spot on a sheet: blank on paper, marked in the preview. */
export function EmptyFront() {
	return (
		<div class="flex items-center justify-center p-[10mm]">
			<span class="flex size-full items-center justify-center rounded-[3mm] border-[0.4mm] border-dashed border-petal-200 text-center font-sans text-[9pt] text-petal-900/40 print:hidden">
				Spare card
			</span>
		</div>
	);
}

/**
 * The QR code to oraiashop.com/hello (links, promos and a note), with the
 * ORAIA flower in its middle; the code's high error correction covers it.
 */
export function HelloQr(props: { size: number; class?: string }) {
	return (
		<span
			class={cn("relative block shrink-0", props.class)}
			style={{ width: `${props.size}mm`, height: `${props.size}mm` }}
		>
			<img
				src={CONTACT.helloQr}
				alt="QR code to ORAIA's page: our links, promos and a note"
				class="block size-full"
			/>
			<span
				aria-hidden="true"
				class="absolute inset-0 m-auto flex items-center justify-center rounded-[0.8mm] bg-white"
				style={{ width: "24%", height: "24%" }}
			>
				<FlowerMark print class="size-[80%]" />
			</span>
		</span>
	);
}

/**
 * A little bouquet, two blooms in a cone with a sparkle, the same as the
 * Custom bouquets icon in Admin: the mark in the middle of a card's own code,
 * so it reads as "your bouquet", apart from the flower on ORAIA's code.
 */
function BouquetMark(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={props.class}
		>
			<path d="M7 10 12 21l5-11" />
			<circle cx="9" cy="7" r="3" />
			<circle cx="15" cy="7" r="3" />
			<path d="M19 3v4M17 5h4" />
		</svg>
	);
}

/** A QR code drawn as it renders, sized in millimetres, with a mark in the middle. */
function Qr(props: {
	value: string;
	size: number;
	mark: JSX.Element;
	label: string;
}) {
	const code = () => qrPath(props.value);
	return (
		<span
			class="relative block shrink-0"
			style={{ width: `${props.size}mm`, height: `${props.size}mm` }}
		>
			<svg
				role="img"
				aria-label={props.label}
				viewBox={`0 0 ${code().size} ${code().size}`}
				shape-rendering="crispEdges"
				class="block size-full"
			>
				<title>{props.label}</title>
				<path d={code().path} fill="#000000" />
			</svg>
			<span
				aria-hidden="true"
				class="absolute inset-0 m-auto flex items-center justify-center rounded-[0.8mm] bg-white"
				style={{ width: "24%", height: "24%" }}
			>
				{props.mark}
			</span>
		</span>
	);
}

/** One code with its small caption underneath. */
function CaptionedQr(props: {
	children: JSX.Element;
	/** A short call to action, in small capitals. */
	caption: string;
	/** Why to scan, in the display italic: what's waiting there. */
	lure: string;
	pt: number;
}) {
	return (
		<span class="flex flex-col items-center whitespace-nowrap">
			{props.children}
			<span
				class="font-sans font-semibold uppercase text-petal-900"
				style={{
					"font-size": `${props.pt}pt`,
					"letter-spacing": "0.22em",
					"margin-top": "2mm",
					"margin-right": "-0.22em",
				}}
			>
				{props.caption}
			</span>
			<span
				class="font-display italic text-[#7a2a43]"
				style={{ "font-size": `${props.pt + 1.6}pt`, "margin-top": "0.6mm" }}
			>
				{props.lure}
			</span>
		</span>
	);
}

/** The card's own code, to its private bouquet page, with its "Scan me" caption. */
export function SurpriseQr(props: { link: string; size: number; pt: number }) {
	return (
		<CaptionedQr caption="Scan me" lure="a little surprise ♡" pt={props.pt}>
			<Qr
				value={absoluteUrl(bouquetPath(props.link))}
				size={props.size}
				label="QR code to this bouquet and its message"
				mark={<BouquetMark class="size-[82%] text-petal-700" />}
			/>
		</CaptionedQr>
	);
}

/** A card's own code, to its private bouquet page, with a sparkle in its middle. */
export function BouquetQr(props: { link: string; size: number }) {
	return (
		<Qr
			value={absoluteUrl(bouquetPath(props.link))}
			size={props.size}
			label="QR code to this bouquet and its message"
			mark={<BouquetMark class="size-[82%] text-petal-700" />}
		/>
	);
}

/**
 * Why to scan a card's own code, in grey, said plainly: it keeps the bouquet
 * and this note to look back on. Nothing grander, so no one expects more.
 */
export function ScanLure(props: { centered?: boolean }) {
	return (
		<span
			class={cn(
				"flex flex-col",
				props.centered ? "items-center text-center" : "items-start text-left",
			)}
		>
			<span
				class="font-sans font-semibold uppercase text-[#6b5e63]"
				style={{
					"font-size": "4.4pt",
					"letter-spacing": "0.22em",
					"margin-right": props.centered ? "-0.22em" : undefined,
				}}
			>
				Scan to keep
			</span>
			<span
				class="font-display italic text-[#6b5e63] [text-wrap:balance]"
				style={{
					"font-size": "6.2pt",
					"line-height": "1.3",
					"margin-top": "0.6mm",
					"max-width": "27mm",
				}}
			>
				your bouquet and this note, to look back on ♡
			</span>
		</span>
	);
}

/** The card's own code with its invitation centered under it. */
export function SurpriseQrRow(props: { link: string; size: number }) {
	return (
		<span class="inline-flex flex-col items-center">
			<BouquetQr link={props.link} size={props.size} />
			<span style={{ "margin-top": "1.6mm" }}>
				<ScanLure centered />
			</span>
		</span>
	);
}

/**
 * The QR codes on a card's back: with `link`, the card's own bouquet page
 * (its bouquet and message) beside ORAIA's page; without, ORAIA's alone.
 * Different marks in the middle, a sparkle and the flower, tell them apart.
 */
export function CardQrs(props: { link?: string; size: number; pt: number }) {
	return (
		<Show
			when={props.link}
			fallback={
				<CaptionedQr caption="Say hello" lure="promos & more" pt={props.pt}>
					<HelloQr size={props.size} />
				</CaptionedQr>
			}
		>
			{(link) => (
				<span class="flex items-start" style={{ gap: `${props.size * 0.4}mm` }}>
					<SurpriseQr link={link()} size={props.size} pt={props.pt} />
					<CaptionedQr caption="Follow us" lure="promos & more" pt={props.pt}>
						<HelloQr size={props.size} />
					</CaptionedQr>
				</span>
			)}
		</Show>
	);
}

/** The back of every card: ORAIA, its line, and how to find the shop. */
export function CardBack(props: { link?: string }) {
	return (
		<article
			class="box-border flex min-h-0 flex-col items-center justify-between text-center"
			style={{ padding: "15mm 12mm 12mm" }}
		>
			<div class="flex flex-col items-center">
				<FlowerMark print class="block size-[24mm]" />
				<Wordmark class="mt-[5mm] block text-[19pt] leading-none" />
				<p
					class="font-display italic text-[#7a2a43]"
					style={{ "font-size": "9.5pt", "margin-top": "3mm" }}
				>
					{TAGLINE}
				</p>
			</div>

			<div
				class="flex items-center gap-[2.5mm] text-petal-700"
				aria-hidden="true"
			>
				<span
					class="block bg-petal-500"
					style={{ width: "14mm", height: "0.35mm" }}
				/>
				<Sparkle style={{ width: "2.6mm", height: "2.6mm" }} />
				<span
					class="block bg-petal-500"
					style={{ width: "14mm", height: "0.35mm" }}
				/>
			</div>

			<div class="flex flex-col items-center font-sans">
				<CardQrs link={props.link} size={18} pt={5.5} />
				<p
					class="tabular-nums text-[#2b1a20]"
					style={{ "font-size": "7.5pt", "margin-top": "3mm" }}
				>
					{CONTACT.phone}
					<span class="px-[1.5mm] text-petal-500">·</span>
					{CONTACT.instagram}
				</p>
				<p
					class="text-[#5c4f54]"
					style={{ "font-size": "6.5pt", "margin-top": "0.8mm" }}
				>
					{CONTACT.location}
				</p>
			</div>
		</article>
	);
}

/**
 * A sheet of four backs. `links` are each spot's bouquet link, already
 * mirrored (see `mirrorSheet`) so each back lands behind its own front.
 */
export function BackSheet(props: {
	links?: (string | undefined)[];
	guides?: boolean;
	label?: string;
	upsideDown?: boolean;
}) {
	return (
		<Sheet
			guides={props.guides}
			label={props.label}
			upsideDown={props.upsideDown}
		>
			<For each={Array.from({ length: CARDS_PER_SHEET })}>
				{(_, spot) => <CardBack link={props.links?.[spot()]} />}
			</For>
		</Sheet>
	);
}
