import { createServerFn } from "@tanstack/solid-start";

import { orderCards } from "~/lib/bouquet-messages";
import type { PricedLine } from "~/lib/pricing";
import { cardSlot } from "~/lib/print-cards";
import { findCardLink, isCardToken } from "./card-links-repo";
import { getOrderById } from "./orders-repo";

/** One bouquet as its receiver sees it: no prices, no buyer details. */
export interface BouquetView {
	title: string;
	colorName: string;
	image?: string;
	sizeName?: string;
	flowers: {
		flower: string;
		color?: string;
		count?: number;
		filler?: boolean;
	}[];
}

/**
 * What the QR code on a dedication card shows: who it's for, the card's
 * words as they are now, and the bouquet. Nothing about who ordered it or
 * what it cost (or staff stock names, like the wrapper's), since the person scanning is usually the receiver.
 */
export type BouquetPage =
	| { state: "ok"; to: string; message: string; bouquets: BouquetView[] }
	| { state: "gone" };

const view = (line: PricedLine): BouquetView => ({
	title: line.title,
	colorName: line.colorName,
	...(line.image ? { image: line.image } : {}),
	...(line.sizeName ? { sizeName: line.sizeName } : {}),
	flowers: (line.recipe ?? []).map(({ flower, color, count, filler }) => ({
		flower,
		...(color ? { color } : {}),
		...(count ? { count } : {}),
		...(filler ? { filler } : {}),
	})),
});

/** Public, by the card's link code; undefined for a code that never existed. */
export const getBouquetPageFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => (typeof input === "string" ? input : ""))
	.handler(({ data }): BouquetPage | undefined => {
		if (!isCardToken(data)) return undefined;
		const link = findCardLink(data);
		if (!link) return undefined;
		const order = getOrderById(link.orderId);
		if (!order || order.stage === "cancelled") return { state: "gone" };
		const card = orderCards(order).find(
			(candidate) => cardSlot(candidate) === link.slot,
		);
		if (!card) return { state: "gone" };
		const lines =
			card.lineIndex === undefined
				? order.lines
				: order.lines.slice(card.lineIndex, card.lineIndex + 1);
		return {
			state: "ok",
			to: card.to,
			message: card.message,
			bouquets: lines.map(view),
		};
	});
