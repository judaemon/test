import { getDb, nowIso } from "./db";

/** A dedication card that went on paper, with the words it had then. */
export interface CardPrint {
	orderId: string;
	/** "order" for an order-wide card, else "line:unit" (see `cardSlot`). */
	slot: string;
	to: string;
	message: string;
	printedBy: string;
	printedAt: string;
}

interface CardPrintRow {
	order_id: string;
	slot: string;
	printed_to: string;
	printed_message: string;
	printed_by: string;
	printed_at: string;
}

export function listCardPrints(): CardPrint[] {
	return (
		getDb().query("SELECT * FROM card_prints").all() as CardPrintRow[]
	).map((row) => ({
		orderId: row.order_id,
		slot: row.slot,
		to: row.printed_to,
		message: row.printed_message,
		printedBy: row.printed_by,
		printedAt: row.printed_at,
	}));
}

/** Records these cards as printed with these words; a reprint replaces the last. */
export function recordCardPrints(
	cards: { orderId: string; slot: string; to: string; message: string }[],
	printedBy: string,
) {
	const db = getDb();
	const upsert = db.query(
		`INSERT INTO card_prints (order_id, slot, printed_to, printed_message, printed_by, printed_at)
		 VALUES ($orderId, $slot, $to, $message, $printedBy, $now)
		 ON CONFLICT (order_id, slot) DO UPDATE SET
		   printed_to = excluded.printed_to,
		   printed_message = excluded.printed_message,
		   printed_by = excluded.printed_by,
		   printed_at = excluded.printed_at`,
	);
	const now = nowIso();
	db.transaction(() => {
		for (const card of cards) upsert.run({ ...card, printedBy, now });
	})();
}

/** Takes these cards off the printed list, e.g. after a misprint. */
export function clearCardPrints(cards: { orderId: string; slot: string }[]) {
	const db = getDb();
	const remove = db.query(
		"DELETE FROM card_prints WHERE order_id = $orderId AND slot = $slot",
	);
	db.transaction(() => {
		for (const card of cards) remove.run(card);
	})();
}
