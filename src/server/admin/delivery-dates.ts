import { createServerFn } from "@tanstack/solid-start";

import { DELIVERY_DATES_MAX, isCalendarDate } from "~/lib/delivery-dates";
import { requireStaff } from "../admin-auth";
import { getDeliveryDates, saveDeliveryDates } from "../delivery-dates-repo";
import { asRecord, InputError } from "../validate";

export const getDeliveryDatesAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return getDeliveryDates();
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
		return saveDeliveryDates(data.dates);
	});
