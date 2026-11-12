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
	class?: string;
}) {
	return (
		<div
			class={cn(
				"card-sheet relative box-border grid grid-cols-2 grid-rows-2 overflow-hidden bg-white text-[#2b1a20]",
				props.class,
			)}
			style={{
				width: `${SHEET.width}mm`,
				height: `${SHEET.height}mm`,
				"print-color-adjust": "exact",
				"-webkit-print-color-adjust": "exact",
			}}
		>
			{props.children}
			<Show when={props.guides}>
				<CutGuides />
			</Show>
		</div>
	);
}

/** Hairline ticks where to cut: the middle of each edge, and a cross at the center. */
function CutGuides() {
	const mark = "absolute bg-[#b8aeb1]";
	const len = "5mm";
	const inset = "3mm";
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
	to: string;
	message: string;
	/** Tiny order number and bouquet, to match the card to its bouquet. */
	reference?: string;
}) {
	const centered = () => centerMessage(props.message);
	return (
		<article
			class="relative box-border flex min-h-0 flex-col overflow-hidden"
			style={{ padding: "13mm 13mm 10mm" }}
		>
			<Sparkle
				class="mx-auto shrink-0 text-petal-500"
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
							class="font-sans font-medium uppercase text-petal-700"
							style={{ "font-size": "6.5pt", "letter-spacing": "0.28em" }}
						>
							To
						</p>
						<p
							class="font-display font-medium leading-tight break-words"
							style={{ "font-size": "13pt", "margin-top": "1mm" }}
						>
							{props.to}
						</p>
						<span
							class="block bg-petal-300"
							style={{ width: "9mm", height: "0.25mm", "margin-top": "2.5mm" }}
						/>
					</div>
				</Show>
				<p
					data-fit-text
					class={cn(
						"m-0 whitespace-pre-line break-words font-display italic",
						centered() ? "[text-wrap:balance]" : "[text-wrap:pretty]",
					)}
					style={{ "line-height": "1.42", "font-size": `${MAX_PT}pt` }}
				>
					{props.message}
				</p>
			</div>
			<FlowerMark class="mx-auto size-[6mm] shrink-0" />
			<Show when={props.reference}>
				<p
					class="absolute truncate font-sans tabular-nums text-[#9d9195]"
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
				<FlowerMark class="size-[80%]" />
			</span>
		</span>
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
				<path d={code().path} fill="#2b1a20" />
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
	caption: string;
	pt: number;
}) {
	return (
		<span class="flex flex-col items-center">
			{props.children}
			<span
				class="font-sans font-medium uppercase text-petal-900"
				style={{
					"font-size": `${props.pt}pt`,
					"letter-spacing": "0.2em",
					"margin-top": "2mm",
					"margin-right": "-0.2em",
				}}
			>
				{props.caption}
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
				<CaptionedQr caption="Scan to say hello" pt={props.pt}>
					<HelloQr size={props.size} />
				</CaptionedQr>
			}
		>
			{(link) => (
				<span class="flex items-start" style={{ gap: `${props.size * 0.4}mm` }}>
					<CaptionedQr caption="Your bouquet" pt={props.pt}>
						<Qr
							value={absoluteUrl(bouquetPath(link()))}
							size={props.size}
							label="QR code to this bouquet and its message"
							mark={<Sparkle class="size-[70%] text-petal-500" />}
						/>
					</CaptionedQr>
					<CaptionedQr caption="Say hello" pt={props.pt}>
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
				<FlowerMark class="block size-[24mm]" />
				<Wordmark class="mt-[5mm] block text-[19pt] leading-none" />
				<p
					class="font-display italic text-petal-700"
					style={{ "font-size": "9.5pt", "margin-top": "3mm" }}
				>
					{TAGLINE}
				</p>
			</div>

			<div
				class="flex items-center gap-[2.5mm] text-petal-500"
				aria-hidden="true"
			>
				<span
					class="block bg-petal-300"
					style={{ width: "14mm", height: "0.25mm" }}
				/>
				<Sparkle style={{ width: "2.6mm", height: "2.6mm" }} />
				<span
					class="block bg-petal-300"
					style={{ width: "14mm", height: "0.25mm" }}
				/>
			</div>

			<div class="flex flex-col items-center font-sans">
				<CardQrs link={props.link} size={18} pt={5.5} />
				<p
					class="tabular-nums text-[#4a3a40]"
					style={{ "font-size": "7.5pt", "margin-top": "3mm" }}
				>
					{CONTACT.phone}
					<span class="px-[1.5mm] text-petal-300">·</span>
					{CONTACT.instagram}
				</p>
				<p
					class="text-[#8a7c81]"
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
export function BackSheet(props: { links?: (string | undefined)[] }) {
	return (
		<Sheet>
			<For each={Array.from({ length: CARDS_PER_SHEET })}>
				{(_, spot) => <CardBack link={props.links?.[spot()]} />}
			</For>
		</Sheet>
	);
}
