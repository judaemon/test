import { expect, test } from "bun:test";
import { fixedHopDay } from "./event-day-fix";

test("1/2 Battalion goes to Saturday, keeping its class", () => {
	for (const company of ["Alfa", "Bravo", "Charlie", "Delta"])
		expect(fixedHopDay({ company, className: "1CL" })).toEqual({
			date: "2026-11-14",
			className: "1CL",
		});
});

test("3/4 Battalion goes to Sunday", () => {
	for (const company of ["Echo", "Foxtrot", "Golf", "Hawk"])
		expect(fixedHopDay({ company, className: "4CL" })).toEqual({
			date: "2026-11-15",
			className: "4CL",
		});
});

test("no company is a civilian, delivered Saturday", () => {
	expect(fixedHopDay({ company: "", className: "" })).toEqual({
		date: "2026-11-14",
		className: "Civilian",
	});
	expect(fixedHopDay({ company: "", className: "Civilian" })).toEqual({
		date: "2026-11-14",
		className: "Civilian",
	});
});
