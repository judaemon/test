import { shopNow } from "~/lib/time";

/**
 * The days shoppers can have their bouquets delivered, set by staff for each
 * event in Admin → Delivery dates. Until staff save their own, these.
 */
export const DEFAULT_DELIVERY_DATES = ["2026-11-14", "2026-11-15"];

/** Most dates staff can offer at once. */
export const DELIVERY_DATES_MAX = 20;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written `YYYY-MM-DD`. */
export function isCalendarDate(value: string) {
	if (!DATE.test(value)) return false;
	const time = Date.parse(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
	);
}

/** Each date once, earliest first. */
export const tidyDates = (dates: readonly string[]) =>
	[...new Set(dates.filter(isCalendarDate))].sort();

/** The dates checkout offers: today's and later ones, Manila time. */
export function upcomingDeliveryDates(
	dates: readonly string[],
	now = new Date(),
) {
	const today = shopNow(now).date;
	return tidyDates(dates).filter((date) => date >= today);
}

/**
 * Why checkout can't take this date, or nothing when it's fine. With dates
 * offered, one of them must be chosen; with none, the date is up to the
 * shopper (and checked as before).
 */
export function deliveryDateError(
	date: string | undefined,
	offered: readonly string[],
) {
	if (!offered.length) return undefined;
	if (!date) return "Choose your delivery date.";
	if (!offered.includes(date)) return "Choose one of the delivery dates.";
	return undefined;
}

/** "Sat, Nov 14": short, for buttons and the orders table. */
export function shortDeliveryDate(date: string) {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", {
		timeZone: "UTC",
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

/**
 * The day each company mostly takes delivery: the date most of its orders
 * have (the earlier one on a tie). Orders with no date yet are listed with
 * their company's day, so "Alfa · No date yet" follows Nov 14's companies.
 */
export function companyDays(
	orders: readonly { company: string; deliveryDate: string }[],
): Map<string, string> {
	const counts = new Map<string, Map<string, number>>();
	for (const { company, deliveryDate } of orders) {
		if (!deliveryDate) continue;
		const days = counts.get(company) ?? new Map<string, number>();
		days.set(deliveryDate, (days.get(deliveryDate) ?? 0) + 1);
		counts.set(company, days);
	}
	const main = new Map<string, string>();
	for (const [company, days] of counts) {
		const [day] = [...days].sort(
			([a, x], [b, y]) => y - x || a.localeCompare(b),
		)[0] as [string, number];
		main.set(company, day);
	}
	return main;
}
