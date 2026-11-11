import { describe, expect, test } from "bun:test";
import {
	deliveryDateError,
	isCalendarDate,
	tidyDates,
	upcomingDeliveryDates,
} from "./delivery-dates";

describe("delivery dates", () => {
	const offered = ["2026-11-14", "2026-11-15"];

	test("one of the offered days must be chosen", () => {
		expect(deliveryDateError("", offered)).toBe("Choose your delivery date.");
		expect(deliveryDateError(undefined, offered)).toBeDefined();
		expect(deliveryDateError("2026-11-16", offered)).toBe(
			"Choose one of the delivery dates.",
		);
		expect(deliveryDateError("2026-11-15", offered)).toBeUndefined();
	});

	test("with no days offered, the date stays optional", () => {
		expect(deliveryDateError("", [])).toBeUndefined();
		expect(deliveryDateError("2026-12-01", [])).toBeUndefined();
	});

	test("checkout only offers today and later, in Manila", () => {
		// 2026-11-14 16:30 UTC is already the 15th in Manila.
		const now = new Date("2026-11-14T16:30:00Z");
		expect(upcomingDeliveryDates(offered, now)).toEqual(["2026-11-15"]);
		expect(upcomingDeliveryDates(offered, new Date("2026-11-01"))).toEqual(
			offered,
		);
	});

	test("dates are real days, each once, in order", () => {
		expect(isCalendarDate("2026-02-30")).toBe(false);
		expect(isCalendarDate("2026-11-14")).toBe(true);
		expect(
			tidyDates(["2026-11-15", "nope", "2026-11-14", "2026-11-15"]),
		).toEqual(offered);
	});
});
