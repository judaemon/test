/** Every date/time rule runs on the shop's clock, wherever the shopper is. */
export const SHOP_TIME_ZONE = "Asia/Manila";

export interface ShopClock {
	/** Shop-local calendar date, `YYYY-MM-DD`. */
	date: string;
	/** Minutes since shop-local midnight. */
	minutes: number;
}

export function shopNow(now = new Date()): ShopClock {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: SHOP_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "0";
	return {
		date: `${get("year")}-${get("month")}-${get("day")}`,
		minutes: Number(get("hour")) * 60 + Number(get("minute")),
	};
}

export function addDays(isoDate: string, days: number) {
	const time = Date.parse(`${isoDate}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
	return new Date(time).toISOString().slice(0, 10);
}

/** `"15:00"` → 900 */
export function toMinutes(time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** `"15:00"` → `"3:00 PM"` */
export function formatClock(time: string) {
	const total = toMinutes(time);
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	const suffix = hours >= 12 ? "PM" : "AM";
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;
	return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatDate(
	isoDate: string,
	options: Intl.DateTimeFormatOptions = {
		weekday: "long",
		month: "long",
		day: "numeric",
	},
) {
	return new Intl.DateTimeFormat("en-US", {
		...options,
		timeZone: "UTC",
	}).format(new Date(`${isoDate}T00:00:00Z`));
}
