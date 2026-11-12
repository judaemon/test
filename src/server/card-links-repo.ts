import { getDb, nowIso } from "./db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
/** 10 characters from 57: about 58 bits, far too many to guess. */
const TOKEN_LENGTH = 10;

/** A random link code, without look-alike characters (0/O, 1/l/I). */
export function newCardToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH * 2));
	let token = "";
	for (const byte of bytes) {
		// Skip values that would favor the first letters.
		if (byte >= ALPHABET.length * 4) continue;
		token += ALPHABET[byte % ALPHABET.length];
		if (token.length === TOKEN_LENGTH) return token;
	}
	return token + newCardToken().slice(token.length);
}

export const isCardToken = (value: string) =>
	value.length === TOKEN_LENGTH &&
	[...value].every((char) => ALPHABET.includes(char));

/**
 * Each card's link code, keyed `${orderId}/${slot}`, making codes for cards
 * that don't have one yet. A card keeps its code for good.
 */
export function ensureCardLinks(cards: { orderId: string; slot: string }[]) {
	const db = getDb();
	const read = () =>
		new Map(
			(
				db.query("SELECT token, order_id, slot FROM card_links").all() as {
					token: string;
					order_id: string;
					slot: string;
				}[]
			).map((row) => [`${row.order_id}/${row.slot}`, row.token]),
		);
	const links = read();
	const missing = cards.filter(
		(card) => !links.has(`${card.orderId}/${card.slot}`),
	);
	if (!missing.length) return links;
	const insert = db.query(
		`INSERT INTO card_links (token, order_id, slot, created_at)
		 VALUES ($token, $orderId, $slot, $now)
		 ON CONFLICT DO NOTHING`,
	);
	const now = nowIso();
	db.transaction(() => {
		for (const card of missing)
			insert.run({ token: newCardToken(), ...card, now });
	})();
	// Read back, so a card made at the same moment elsewhere keeps one code.
	return read();
}

/** Which card a link code belongs to. */
export function findCardLink(token: string) {
	const row = getDb()
		.query("SELECT order_id, slot FROM card_links WHERE token = $token")
		.get({ token }) as { order_id: string; slot: string } | null;
	return row ? { orderId: row.order_id, slot: row.slot } : undefined;
}
