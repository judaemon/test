import { battalionOf, CIVILIAN } from "./cadets";

/** Battalion Hop 2026: 1/2 Battalion's bouquets go out Saturday, 3/4's Sunday. */
export const HOP_2026_DAYS = {
	"1/2 Battalion": "2026-11-14",
	"3/4 Battalion": "2026-11-15",
} as const;
/** Civilians (no company) are delivered with 1/2 Battalion, on Saturday. */
export const HOP_2026_CIVILIAN_DAY = HOP_2026_DAYS["1/2 Battalion"];

/** The days an order shouldn't be on for this event: Friday, or none at all. */
export const HOP_2026_DAYS_TO_FIX = ["2026-11-13", ""] as const;

/**
 * Where an order on a day to fix goes: its battalion's day, or Saturday for
 * a civilian. An order with no company becomes a civilian.
 */
export function fixedHopDay(order: { company: string; className: string }): {
	date: string;
	className: string;
} {
	const battalion = battalionOf(order.company);
	if (battalion)
		return {
			date: HOP_2026_DAYS[battalion as keyof typeof HOP_2026_DAYS],
			className: order.className,
		};
	return { date: HOP_2026_CIVILIAN_DAY, className: CIVILIAN };
}
