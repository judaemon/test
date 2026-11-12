import { createServerFn } from "@tanstack/solid-start";

import { orderCards } from "~/lib/bouquet-messages";
import { DEDICATION_MESSAGE_MAX, NAME_MAX } from "~/lib/checkout";
import {
	cardSlot,
	compareCards,
	type PrintCard,
	printStatus,
} from "~/lib/print-cards";
import { requireStaff } from "../admin-auth";
import {
	clearCardPrints,
	listCardPrints,
	recordCardPrints,
} from "../card-prints-repo";
import { listOrders } from "../orders-repo";
import { asRecord, InputError, text } from "../validate";

export interface PrintCardsResult {
	cards: PrintCard[];
	/** When this was read, so the page can say how fresh it is. */
	loadedAt: string;
}

/**
 * Every dedication card on active orders, with the words they have now, so
 * edits by staff or the customer are what print. Test orders are left out.
 */
export const listPrintCardsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<PrintCardsResult> => {
		await requireStaff();
		const prints = new Map(
			listCardPrints().map((print) => [
				`${print.orderId}/${print.slot}`,
				print,
			]),
		);
		const cards: PrintCard[] = [];
		for (const order of listOrders({ limit: 100_000, test: "exclude" })) {
			if (order.stage === "cancelled") continue;
			const { details } = order;
			const buyer = details.lastName
				? `${details.lastName}, ${details.firstName}`
				: details.fullName;
			for (const card of orderCards(order)) {
				const slot = cardSlot(card);
				const key = `${order.id}/${slot}`;
				const print = prints.get(key);
				cards.push({
					key,
					orderId: order.id,
					slot,
					number: order.number,
					buyer,
					company: details.company,
					className: details.className,
					deliveryDate: details.deliveryDate ?? "",
					label: card.label ?? "",
					to: card.to,
					message: card.message,
					status: printStatus(card, print),
					...(print
						? {
								printed: {
									to: print.to,
									message: print.message,
									at: print.printedAt,
									by: print.printedBy,
								},
							}
						: {}),
				});
			}
		}
		return {
			cards: cards.sort(compareCards),
			loadedAt: new Date().toISOString(),
		};
	},
);

const MAX_CARDS = 2000;

const cardRefs = (input: unknown) => {
	const list = asRecord(input).cards;
	if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CARDS)
		throw new InputError("Pick the cards first.");
	return list.map((raw) => {
		const source = asRecord(raw);
		const slot = text(source, "slot", { max: 32 });
		if (!/^(order|\d+:\d+)$/.test(slot)) throw new InputError("Invalid card.");
		return { orderId: text(source, "orderId", { max: 64 }), slot, source };
	});
};

/**
 * Marks cards as printed with the words that were on the page. Those words,
 * not the order's words now, are kept: a card edited while it printed then
 * shows up as changed.
 */
export const markCardsPrintedFn = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		cardRefs(input).map(({ orderId, slot, source }) => ({
			orderId,
			slot,
			to: text(source, "to", { max: NAME_MAX, required: false }),
			message: text(source, "message", {
				// Staff-made chat orders aren't held to checkout's limit.
				max: DEDICATION_MESSAGE_MAX * 10,
			}),
		})),
	)
	.handler(async ({ data }) => {
		const user = await requireStaff();
		recordCardPrints(data, user.name);
		return { ok: true as const, count: data.length };
	});

/** Puts cards back on the to-print list, e.g. after a jam or misprint. */
export const unmarkCardsPrintedFn = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		cardRefs(input).map(({ orderId, slot }) => ({ orderId, slot })),
	)
	.handler(async ({ data }) => {
		await requireStaff();
		clearCardPrints(data);
		return { ok: true as const, count: data.length };
	});
