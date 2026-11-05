import {
	type CheckoutDetails,
	DEDICATION_MESSAGE_MAX,
	NAME_MAX,
	NOTES_MAX,
} from "~/lib/checkout";
import type { PricedLine } from "~/lib/pricing";
import { lineName } from "~/lib/product";

/**
 * What the shopper wrote for one bouquet: its dedication card and a note for
 * the florist. A line with quantity 3 has up to three, one per bouquet.
 */
export interface BouquetMessage {
	/** The receiver named on the card ("To: …"); optional. */
	to: string;
	/** The card's message; empty means no card for this bouquet. */
	message: string;
	/** Note for the florist about this bouquet. */
	note: string;
}

export type BouquetMessageErrors = Partial<
	Record<keyof BouquetMessage, string>
>;

export const EMPTY_MESSAGE: BouquetMessage = { to: "", message: "", note: "" };

/** Identifies one bouquet in the bag: its line and which of that line's units. */
export const lineKey = (line: { productId: string; variantId: string }) =>
	`${line.productId}::${line.variantId}`;
export const unitKey = (
	line: { productId: string; variantId: string },
	unit: number,
) => `${lineKey(line)}#${unit}`;

export const hasCard = (message: BouquetMessage | undefined) =>
	!!message?.message;
export const hasContent = (message: BouquetMessage | undefined) =>
	!!(message && (message.to || message.message || message.note));

/** Trims untrusted input into a message; line breaks in text are kept. */
export function parseBouquetMessage(raw: unknown): BouquetMessage {
	const source =
		typeof raw === "object" && raw !== null
			? (raw as Record<string, unknown>)
			: {};
	const text = (key: keyof BouquetMessage) =>
		typeof source[key] === "string" ? (source[key] as string).trim() : "";
	return {
		to: text("to").replace(/\s+/g, " "),
		message: text("message"),
		note: text("note"),
	};
}

/** Checkout's rules for one bouquet's card and note. */
export function validateBouquetMessage(
	message: BouquetMessage,
): BouquetMessageErrors {
	const errors: BouquetMessageErrors = {};
	if (message.to.length > NAME_MAX)
		errors.to = `Keep the name under ${NAME_MAX} characters.`;
	// "To" on its own would print an empty card.
	if (message.to && !message.message)
		errors.message = `Write a message for ${message.to}, or remove the card.`;
	else if (message.message.length > DEDICATION_MESSAGE_MAX)
		errors.message = `That’s too long for the card — keep it under ${DEDICATION_MESSAGE_MAX} characters.`;
	if (message.note.length > NOTES_MAX)
		errors.note = `Keep the note under ${NOTES_MAX} characters.`;
	return errors;
}

/**
 * Attaches checkout's messages to the priced lines, one per bouquet. `raw` maps
 * a line's key to its units' messages. Lines nobody wrote anything for get none.
 */
export function attachMessages(
	lines: PricedLine[],
	raw: unknown,
): { lines: PricedLine[]; errors: Record<string, BouquetMessageErrors> } {
	const source =
		typeof raw === "object" && raw !== null && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const errors: Record<string, BouquetMessageErrors> = {};
	const withMessages = lines.map((line) => {
		const units = source[lineKey(line)];
		if (!Array.isArray(units)) return line;
		const messages = Array.from({ length: line.quantity }, (_, unit) => {
			const message = parseBouquetMessage(units[unit]);
			const problems = validateBouquetMessage(message);
			if (Object.keys(problems).length) errors[unitKey(line, unit)] = problems;
			return message;
		});
		return messages.some(hasContent) ? { ...line, messages } : line;
	});
	return { lines: withMessages, errors };
}

/** One card or note on a placed order, with the bouquet it goes with. */
export interface OrderMessage extends BouquetMessage {
	/** Index into the order's lines; unset for an order-wide (older) message. */
	lineIndex?: number;
	/** Which of the line's bouquets, from 0, and how many the line has. */
	unit?: number;
	of?: number;
	/** "Odette · Cream", or "Odette · Cream (2 of 3)"; unset order-wide. */
	label?: string;
}

/**
 * Every card and note on an order, bouquet by bouquet. Orders placed before
 * per-bouquet cards (and orders added from a chat) have one for the whole order.
 */
export function orderMessages(order: {
	lines: PricedLine[];
	details: CheckoutDetails;
}): OrderMessage[] {
	const messages: OrderMessage[] = [];
	const { details } = order;
	if (details.dedicationMessage || details.dedicationFor || details.notes)
		messages.push({
			to: details.dedicationFor,
			message: details.dedicationMessage,
			note: details.notes,
		});
	order.lines.forEach((line, lineIndex) => {
		line.messages?.forEach((message, unit) => {
			if (!hasContent(message)) return;
			const of = line.messages?.length ?? 1;
			messages.push({
				...message,
				lineIndex,
				unit,
				of,
				label:
					of > 1 ? `${lineName(line)} (${unit + 1} of ${of})` : lineName(line),
			});
		});
	});
	return messages;
}

/** Just the cards to print, in order. */
export const orderCards = (order: Parameters<typeof orderMessages>[0]) =>
	orderMessages(order).filter(hasCard);

/** Who the bouquets are for: the cards' receivers, else the buyer. */
export function orderFor(order: Parameters<typeof orderMessages>[0]) {
	const names = [
		...new Set(
			orderMessages(order)
				.map((message) => message.to)
				.filter(Boolean),
		),
	];
	if (names.length === 0) return order.details.fullName;
	if (names.length <= 2) return names.join(" & ");
	return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
