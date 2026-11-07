import {
	type AppliedPromo,
	isRewardOrder,
	type OrderPromo,
	orderPromoStatus,
	ordersUntilReward,
	type PublicOrderPromo,
} from "~/lib/order-promo";
import { shopToday } from "~/lib/sale";
import { getDb, nowIso } from "./db";

interface PromoRow {
	id: string;
	name: string;
	every: number;
	amount: number;
	repeat: number;
	starts_on: string;
	ends_on: string;
	enabled: number;
	terms: string;
}

const toPromo = (row: PromoRow): OrderPromo => ({
	id: row.id,
	name: row.name,
	every: row.every,
	amount: row.amount,
	repeat: row.repeat === 1,
	startsOn: row.starts_on,
	endsOn: row.ends_on,
	enabled: row.enabled === 1,
	terms: row.terms,
});

export function listOrderPromos(): OrderPromo[] {
	return (
		getDb()
			.query("SELECT * FROM order_promos ORDER BY starts_on DESC, name")
			.all() as PromoRow[]
	).map(toPromo);
}

/** The order promos live today (Manila time), as the shop sees them. */
export function listLiveOrderPromos(today = shopToday()): PublicOrderPromo[] {
	return listOrderPromos()
		.filter((promo) => orderPromoStatus(promo, today) === "live")
		.map(({ enabled: _enabled, ...promo }) => promo);
}

export type OrderPromoInput = Omit<OrderPromo, "id">;

export function saveOrderPromo(input: OrderPromoInput, id?: string) {
	const db = getDb();
	const promoId = id ?? crypto.randomUUID();
	const values = {
		id: promoId,
		name: input.name,
		every: input.every,
		amount: input.amount,
		repeat: input.repeat ? 1 : 0,
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		enabled: input.enabled ? 1 : 0,
		terms: input.terms,
		now: nowIso(),
	};
	if (id) {
		const result = db
			.query(
				`UPDATE order_promos SET name = $name, every = $every, amount = $amount,
				   repeat = $repeat, starts_on = $startsOn, ends_on = $endsOn,
				   enabled = $enabled, terms = $terms, updated_at = $now
				 WHERE id = $id`,
			)
			.run(values);
		if (result.changes === 0) throw new Error("That promo was deleted.");
	} else {
		db.query(
			`INSERT INTO order_promos (id, name, every, amount, repeat, starts_on, ends_on,
			   enabled, terms, created_at, updated_at)
			 VALUES ($id, $name, $every, $amount, $repeat, $startsOn, $endsOn,
			   $enabled, $terms, $now, $now)`,
		).run(values);
	}
	return listOrderPromos().find((promo) => promo.id === promoId) as OrderPromo;
}

export function deleteOrderPromo(id: string) {
	getDb().query("DELETE FROM order_promos WHERE id = $id").run({ id });
}

/** Orders placed under a serial number that count: not cancelled, not tests. */
export function countSerialOrders(serialNumber: string) {
	if (!serialNumber) return 0;
	const row = getDb()
		.query(
			`SELECT COUNT(*) AS n FROM orders
			 WHERE serial_number = $serial AND stage != 'cancelled' AND is_test = 0`,
		)
		.get({ serial: serialNumber }) as { n: number };
	return row.n;
}

/**
 * The promo the next order under this serial number gets, if any: the biggest
 * of the live promos it's a reward order for, capped at what the bouquets
 * cost.
 */
export function promoForNextOrder(
	serialNumber: string,
	subtotal: number,
	today = shopToday(),
): AppliedPromo | undefined {
	if (!serialNumber || subtotal <= 0) return undefined;
	const placed = countSerialOrders(serialNumber);
	const best = listLiveOrderPromos(today)
		.filter((promo) => isRewardOrder(promo, placed))
		.sort((a, b) => b.amount - a.amount)[0];
	if (!best) return undefined;
	return {
		id: best.id,
		name: best.name,
		amount: Math.min(best.amount, subtotal),
	};
}

/**
 * What checkout tells a cadet about their orders: the reward this order gets,
 * or how many orders to go for the nearest one.
 */
export function promoProgress(serialNumber: string, today = shopToday()) {
	if (!serialNumber) return { reward: undefined, next: undefined };
	const placed = countSerialOrders(serialNumber);
	const live = listLiveOrderPromos(today);
	const reward = live
		.filter((promo) => isRewardOrder(promo, placed))
		.sort((a, b) => b.amount - a.amount)[0];
	const next = live
		.map((promo) => ({ promo, remaining: ordersUntilReward(promo, placed) }))
		.filter(
			(entry): entry is { promo: PublicOrderPromo; remaining: number } =>
				entry.remaining !== undefined && entry.remaining > 1,
		)
		.sort((a, b) => a.remaining - b.remaining)[0];
	return {
		reward: reward && { name: reward.name, amount: reward.amount },
		next: next && {
			name: next.promo.name,
			amount: next.promo.amount,
			// Orders still to place before the reward one.
			remaining: next.remaining - 1,
		},
	};
}
