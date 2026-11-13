import { CLASS_OPTIONS, COMPANIES } from "~/lib/cadets";

/** How many cards share one A4 sheet: 2 × 2, each A6 (105 × 148.5 mm). */
export const CARDS_PER_SHEET = 4;

/**
 * Whether a card went on paper with its words as they are now. "changed":
 * printed, then edited (by staff or the customer), so the printed one is wrong.
 */
export type CardPrintStatus = "new" | "changed" | "printed";

/** One dedication card on Admin → Cards, with its order and print history. */
export interface PrintCard {
	/** `${orderId}/${slot}`: unique across orders. */
	key: string;
	orderId: string;
	/** "order" for an order-wide card, else "line:unit". */
	slot: string;
	number: string;
	/** Who ordered: "Cruz, Ana". */
	buyer: string;
	company: string;
	className: string;
	/** A cadet's serial number, digits only; "" for civilians. */
	serialNumber: string;
	email: string;
	/** `YYYY-MM-DD`, or "" when no day was chosen. */
	deliveryDate: string;
	/** The bouquet it goes with: "Odette · Cream (2 of 3)"; "" order-wide. */
	label: string;
	to: string;
	message: string;
	status: CardPrintStatus;
	/** Code for the card's private page, `/b/<link>`: its bouquet and message. */
	link: string;
	/** The words that were printed last time, and by whom. */
	printed?: { to: string; message: string; at: string; by: string };
}

/** Where a card sits on its order, kept the same when its words change. */
export const cardSlot = (card: { lineIndex?: number; unit?: number }) =>
	card.lineIndex === undefined
		? "order"
		: `${card.lineIndex}:${card.unit ?? 0}`;

/** Compares what was printed with the card's words now. */
export function printStatus(
	card: { to: string; message: string },
	printed: { to: string; message: string } | undefined,
): CardPrintStatus {
	if (!printed) return "new";
	return printed.to === card.to && printed.message === card.message
		? "printed"
		: "changed";
}

const rank = (list: readonly string[], value: string) => {
	const index = list.indexOf(value);
	return index === -1 ? list.length : index;
};
const companyNames = COMPANIES.map((company) => company.name);

/**
 * Cards in the order they're handed over: by delivery day (no day last), then
 * company and class like the handover list, then buyer and order. Cut stacks
 * then go straight onto the right bouquets.
 */
export function compareCards(a: PrintCard, b: PrintCard) {
	return (
		(a.deliveryDate || "9999").localeCompare(b.deliveryDate || "9999") ||
		rank(companyNames, a.company) - rank(companyNames, b.company) ||
		rank(CLASS_OPTIONS, a.className) - rank(CLASS_OPTIONS, b.className) ||
		a.buyer.localeCompare(b.buyer) ||
		a.number.localeCompare(b.number, undefined, { numeric: true }) ||
		a.slot.localeCompare(b.slot, undefined, { numeric: true })
	);
}

/**
 * Cards by order number, oldest first, then their place on the order. New
 * orders only ever join at the end, so a list printed in this order keeps
 * its place however often the page is refreshed.
 */
export function compareByNumber(a: PrintCard, b: PrintCard) {
	return (
		a.number.localeCompare(b.number, undefined, { numeric: true }) ||
		a.slot.localeCompare(b.slot, undefined, { numeric: true })
	);
}

/** The private page a card's QR code opens: its bouquet and its message. */
export const bouquetPath = (link: string) => `/b/${link}`;

/**
 * Where each card's back goes on the other side of its sheet. Turned over
 * (short edge, or long edge with the inside upside down), left and right
 * swap, so each row's two spots trade places; rows stay put.
 */
export function mirrorSheet<T>(
	cards: (T | undefined)[],
	perRow = 2,
): (T | undefined)[] {
	const spots = Math.ceil(CARDS_PER_SHEET / perRow) * perRow;
	return Array.from({ length: spots }, (_, spot) => {
		const row = Math.floor(spot / perRow);
		const col = spot % perRow;
		return cards[row * perRow + (perRow - 1 - col)];
	});
}

/** Splits cards into A4 sheets of four; the last may have fewer. */
export function toSheets<T>(cards: T[], perSheet = CARDS_PER_SHEET): T[][] {
	const sheets: T[][] = [];
	for (let i = 0; i < cards.length; i += perSheet)
		sheets.push(cards.slice(i, i + perSheet));
	return sheets;
}

/**
 * Short notes read best centered, like a printed card; longer ones and ones
 * with paragraphs read best left-aligned.
 */
export function centerMessage(message: string) {
	const lines = message.split("\n").filter((line) => line.trim()).length;
	return message.length <= 180 && lines <= 4;
}

/** Lowercase, without accents, so "José" is found by "jose". */
const fold = (value: string) =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();

/**
 * Whether a card matches what was typed in the search. Commas separate
 * alternatives ("95, 102, 213" finds those three orders); within one, every
 * word must be found somewhere on the card, in any order ("ana cruz" finds
 * "Cruz, Ana"). A number is an order number, matched exactly so a list
 * finds just those orders; five digits or more also finds serial numbers.
 */
export function cardMatches(card: PrintCard, query: string) {
	const alternatives = query
		.split(",")
		.map((part) => fold(part).split(/\s+/).filter(Boolean))
		.filter((words) => words.length);
	if (!alternatives.length) return true;
	const text = fold(
		[
			card.buyer,
			card.to,
			card.message,
			card.label,
			card.company,
			card.className,
			card.email,
			card.serialNumber && `c-${card.serialNumber}`,
		].join("\n"),
	);
	const matchesWord = (word: string) => {
		const digits = word.replace(/^(#|no\.?|c-)/, "");
		if (/^\d+$/.test(digits)) {
			if (word.startsWith("c-")) return card.serialNumber.includes(digits);
			if (card.number === digits) return true;
			return (
				!word.startsWith("#") &&
				digits.length >= 5 &&
				card.serialNumber.includes(digits)
			);
		}
		return text.includes(word);
	};
	return alternatives.some((words) => words.every(matchesWord));
}

/** A card's place and words, enough to find it again after an order changes. */
export interface PlacedCard {
	slot: string;
	to: string;
	message: string;
}

/**
 * Where each card went when an order's bouquets changed (a bouquet cancelled,
 * the order edited), so a printed QR code keeps showing the same card. A card
 * is found again by its exact words. Returns old slot → new slot; a card that
 * was removed, whose place another card now takes, goes to `gone:<slot>` so
 * its code never shows someone else's message. A card edited where it is
 * stays put, so the code shows the new words.
 */
export function planCardMoves(before: PlacedCard[], after: PlacedCard[]) {
	const words = (card: PlacedCard) => `${card.to}\n${card.message}`;
	const afterAt = new Map(after.map((card) => [card.slot, card]));
	const moves = new Map<string, string>();
	const claimed = new Set<string>();
	// Cards still where they were, unchanged, keep their place first.
	for (const card of before) {
		const now = afterAt.get(card.slot);
		if (now && words(now) === words(card)) claimed.add(card.slot);
	}
	for (const card of before) {
		if (
			claimed.has(card.slot) &&
			words(afterAt.get(card.slot) as PlacedCard) === words(card)
		)
			continue;
		const found = after.find(
			(candidate) =>
				!claimed.has(candidate.slot) && words(candidate) === words(card),
		);
		if (found) {
			claimed.add(found.slot);
			moves.set(card.slot, found.slot);
		}
	}
	// A card that didn't move and whose place now holds a card that moved in.
	const takenOver = new Set(moves.values());
	for (const card of before) {
		if (moves.has(card.slot)) continue;
		const now = afterAt.get(card.slot);
		if (takenOver.has(card.slot) && (!now || words(now) !== words(card)))
			moves.set(card.slot, `gone:${card.slot}`);
	}
	return moves;
}
