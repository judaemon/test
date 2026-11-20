import { shortDeliveryDate } from "./delivery-dates";

/** Where an event is in the shop's year, in the order it goes through them. */
export const EVENT_STATUSES = {
	upcoming: {
		label: "Upcoming",
		text: "Planned. The shop isn’t working on it yet.",
	},
	current: {
		label: "Current",
		text: "The event the shop is working on now. Only one at a time.",
	},
	done: {
		label: "Done",
		text: "Over, with every bouquet delivered.",
	},
} as const;
export type EventStatus = keyof typeof EVENT_STATUSES;
export const EVENT_STATUS_KEYS = Object.keys(EVENT_STATUSES) as EventStatus[];

export const isEventStatus = (value: unknown): value is EventStatus =>
	typeof value === "string" && value in EVENT_STATUSES;

/** Most delivery days one event can have. */
export const EVENT_DELIVERY_DATES_MAX = 10;

export interface ShopEvent {
	id: string;
	name: string;
	/** Online ordering runs from this day to that one, YYYY-MM-DD. */
	ordersOpenOn: string;
	ordersCloseOn: string;
	/** The days bouquets are delivered, earliest first. */
	deliveryDates: string[];
	status: EventStatus;
	notes: string;
	/**
	 * Once this many orders are in (cancelled ones aside), the shop
	 * is fully booked. Null: no limit.
	 */
	maxOrders: number | null;
}

/** The highest "most orders" an event can be given. */
export const EVENT_MAX_ORDERS_LIMIT = 100_000;

const year = (date: string) => date.slice(0, 4);

/**
 * Two days as a span: "Sat, Nov 14 – Sun, Nov 15, 2026", one day:
 * "Sat, Nov 14, 2026".
 */
export function dateSpan(first: string, last: string) {
	const start = shortDeliveryDate(first);
	if (first === last) return `${start}, ${year(first)}`;
	return year(first) === year(last)
		? `${start} – ${shortDeliveryDate(last)}, ${year(last)}`
		: `${start}, ${year(first)} – ${shortDeliveryDate(last)}, ${year(last)}`;
}

/** "Sat, Nov 14 and Sun, Nov 15, 2026", or "No delivery days yet". */
export function deliveryDays(dates: readonly string[]) {
	if (!dates.length) return "No delivery days yet";
	const days = dates.map(shortDeliveryDate);
	const list =
		days.length === 1
			? days[0]
			: `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
	return `${list}, ${year(dates[dates.length - 1])}`;
}

/** When the event happens: its first delivery day, else ordering's last day. */
const happensOn = (event: ShopEvent) =>
	event.deliveryDates[0] ?? event.ordersCloseOn;

/** Current first, then upcoming (soonest first), then done (latest first). */
export function sortEvents<T extends ShopEvent>(events: readonly T[]): T[] {
	const rank = { current: 0, upcoming: 1, done: 2 } as const;
	return [...events].sort((a, b) => {
		if (a.status !== b.status) return rank[a.status] - rank[b.status];
		const byDate = happensOn(a).localeCompare(happensOn(b));
		return a.status === "done" ? -byDate : byDate;
	});
}
