import { createServerFn } from "@tanstack/solid-start";

import { DELIVERY_DATES_MAX, isCalendarDate } from "~/lib/delivery-dates";
import { EVENT_DELIVERY_DATES_MAX } from "~/lib/events";
import { requireStaff } from "../admin-auth";
import {
	deliveryDatesEvent,
	getDeliveryDates,
	saveDeliveryDates,
} from "../delivery-dates-repo";
import { asRecord, InputError } from "../validate";

export const getDeliveryDatesAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return { dates: getDeliveryDates(), event: deliveryDatesEvent() };
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
		await requireStaff();
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
