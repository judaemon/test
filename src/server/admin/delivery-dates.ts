import { createServerFn } from "@tanstack/solid-start";

import { DELIVERY_DATES_MAX, isCalendarDate } from "~/lib/delivery-dates";
import { EVENT_DELIVERY_DATES_MAX } from "~/lib/events";
import { requirePermission } from "../admin-auth";
import { getDb } from "../db";
import {
	deliveryDatesEvent,
	getDeliveryDates,
	saveDeliveryDates,
} from "../delivery-dates-repo";
import { asRecord, InputError } from "../validate";

export const getDeliveryDatesAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requirePermission("delivery_dates.view");
		return {
			dates: getDeliveryDates(),
			event: deliveryDatesEvent(),
			booked: bookedByDay(),
		};
	},
);

export const saveDeliveryDatesFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const { dates } = asRecord(input);
		if (!Array.isArray(dates)) throw new InputError("Add the dates to offer.");
		if (dates.length > DELIVERY_DATES_MAX)
			throw new InputError(
				`Offer up to ${DELIVERY_DATES_MAX} dates at a time.`,
			);
		for (const date of dates)
			if (typeof date !== "string" || !isCalendarDate(date))
				throw new InputError("One of the dates isn’t a real day.");
		return { dates: dates as string[] };
	})
	.handler(async ({ data }) => {
		await requirePermission("delivery_dates.manage");
		if (deliveryDatesEvent() && !data.dates.length)
			throw new InputError(
				"The current event needs at least one delivery day.",
			);
		if (deliveryDatesEvent() && data.dates.length > EVENT_DELIVERY_DATES_MAX)
			throw new InputError(
				`An event can have up to ${EVENT_DELIVERY_DATES_MAX} delivery days.`,
			);
		return saveDeliveryDates(data.dates);
	});

/** Orders and bouquets booked on each delivery day, cancelled ones aside. */
function bookedByDay(): Record<string, { orders: number; bouquets: number }> {
	const rows = getDb()
		.query(
			`SELECT o.delivery_date AS day, COUNT(DISTINCT o.id) AS orders,
			        COALESCE(SUM(json_extract(l.value, '$.quantity')), 0) AS bouquets
			   FROM orders o LEFT JOIN json_each(o.lines) l
			  WHERE o.stage != 'cancelled' AND o.delivery_date != ''
			  GROUP BY o.delivery_date`,
		)
		.all() as { day: string; orders: number; bouquets: number }[];
	return Object.fromEntries(
		rows.map((row) => [
			row.day,
			{ orders: row.orders, bouquets: row.bouquets },
		]),
	);
}
