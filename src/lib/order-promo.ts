import { formatPrice } from "~/lib/product";
import { shopToday } from "~/lib/sale";

export const ORDER_PROMO_NAME_MAX = 60;
export const ORDER_PROMO_TERMS_MAX = 600;

/**
 * A reward for ordering again, counted by serial number (cadets only, as
 * civilians have none), e.g. ₱500 off every 10th order. Set up in Admin →
 * Sales. Cancelled and test orders don't count.
 */
export interface OrderPromo {
	id: string;
	/** Shown to shoppers, e.g. "10th Flower Promo". */
	name: string;
	/** The reward order: every 10th, or just the 10th without `repeat`. */
	every: number;
	/** Pesos off that order. */
	amount: number;
	/** Every 10th order (10th, 20th…), not just the first 10th. */
	repeat: boolean;
	/** First day, `YYYY-MM-DD`; earlier orders still count toward it. */
	startsOn: string;
	/** Last day, `YYYY-MM-DD`, or empty for no end. */
	endsOn: string;
	enabled: boolean;
	/** The owner's own fine print, shown on the Promos page. */
	terms: string;
}

export type PublicOrderPromo = Omit<OrderPromo, "enabled">;

/** The promo an order got, kept with it. */
export interface AppliedPromo {
	id: string;
	name: string;
	/** Pesos off, never more than the bouquets cost. */
	amount: number;
}

export type OrderPromoStatus = "off" | "scheduled" | "live" | "ended";

export function orderPromoStatus(
	promo: Pick<OrderPromo, "enabled" | "startsOn" | "endsOn">,
	today = shopToday(),
): OrderPromoStatus {
	if (!promo.enabled) return "off";
	if (today < promo.startsOn) return "scheduled";
	if (promo.endsOn && today > promo.endsOn) return "ended";
	return "live";
}

/** "10th", "21st", "2nd"… */
export function ordinal(n: number) {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/** "₱500 off every 10th order" or "₱500 off your 10th order". */
export function orderPromoLabel(
	promo: Pick<OrderPromo, "amount" | "every" | "repeat">,
) {
	return `${formatPrice(promo.amount, "PHP")} off ${promo.repeat ? "every" : "your"} ${ordinal(promo.every)} order`;
}

/** Whether the order after `placedBefore` orders is a reward order. */
export function isRewardOrder(
	promo: Pick<OrderPromo, "every" | "repeat">,
	placedBefore: number,
) {
	const next = placedBefore + 1;
	return promo.repeat ? next % promo.every === 0 : next === promo.every;
}

/**
 * How many more orders until the reward, counting the next one: 1 means the
 * next order gets it. Undefined once a one-time reward is used up.
 */
export function ordersUntilReward(
	promo: Pick<OrderPromo, "every" | "repeat">,
	placedBefore: number,
) {
	if (promo.repeat) return promo.every - (placedBefore % promo.every);
	return placedBefore < promo.every ? promo.every - placedBefore : undefined;
}

/** How the promo works, a line each, for the Promos page. */
export function orderPromoMechanics(promo: PublicOrderPromo) {
	const peso = formatPrice(promo.amount, "PHP");
	return [
		`Cadets: we count your orders by your serial number.`,
		promo.repeat
			? `Every ${ordinal(promo.every)} order (${ordinal(promo.every)}, ${ordinal(promo.every * 2)}, ${ordinal(promo.every * 3)}…) gets ${peso} off its total.`
			: `Your ${ordinal(promo.every)} order gets ${peso} off its total.`,
		"Checkout shows how many orders you have to go once you enter your serial number, and takes the discount off automatically.",
		"Cancelled orders don’t count.",
		"It adds to any sale prices; it can’t bring an order below ₱0.",
	];
}
