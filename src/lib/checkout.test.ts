import { describe, expect, test } from "bun:test";

import {
	deliveryDateRange,
	parseCheckoutDetails,
	validateCheckoutDetails,
} from "~/lib/checkout";

const base = {
	firstName: "Test",
	lastName: "Shopper",
	className: "Civilian (not a cadet)",
	email: "shopper@example.com",
};
const errorFor = (deliveryDate: string) =>
	validateCheckoutDetails(parseCheckoutDetails({ ...base, deliveryDate }))
		.deliveryDate;

describe("delivery date", () => {
	const { min, max } = deliveryDateRange();
	test("is optional", () => {
		expect(errorFor("")).toBeUndefined();
		expect(parseCheckoutDetails(base).deliveryDate).toBe("");
	});
	test("today up to a year ahead", () => {
		expect(errorFor(min)).toBeUndefined();
		expect(errorFor(max)).toBeUndefined();
	});
	test("not in the past, not too far, and a real day", () => {
		expect(errorFor("2020-01-01")).toBe("Choose today or a later day.");
		expect(errorFor("2999-01-01")).toBe("Choose a day within the next year.");
		expect(errorFor("2026-02-31")).toBe("Choose a date from the calendar.");
		expect(errorFor("2026-13-45")).toBe("Choose a date from the calendar.");
	});
	test("anything that isn't a date is dropped", () => {
		expect(
			parseCheckoutDetails({ ...base, deliveryDate: "next week" }).deliveryDate,
		).toBe("");
	});
});
