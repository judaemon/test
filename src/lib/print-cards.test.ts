import { describe, expect, test } from "bun:test";

import {
	cardMatches,
	cardSlot,
	centerMessage,
	compareCards,
	type PrintCard,
	printStatus,
	toSheets,
} from "./print-cards";

const card = (over: Partial<PrintCard>): PrintCard => ({
	key: "o/order",
	orderId: "o",
	slot: "order",
	number: "1001",
	buyer: "Cruz, Ana",
	company: "Alfa",
	className: "",
	serialNumber: "",
	email: "",
	deliveryDate: "2026-11-14",
	label: "",
	to: "Mia",
	message: "Happy graduation!",
	status: "new",
	...over,
});

describe("cardSlot", () => {
	test("order-wide cards and bouquet cards get distinct slots", () => {
		expect(cardSlot({})).toBe("order");
		expect(cardSlot({ lineIndex: 2, unit: 1 })).toBe("2:1");
		expect(cardSlot({ lineIndex: 0 })).toBe("0:0");
	});
});

describe("printStatus", () => {
	const now = { to: "Mia", message: "Congrats!" };
	test("never printed is new", () => {
		expect(printStatus(now, undefined)).toBe("new");
	});
	test("same words is printed", () => {
		expect(printStatus(now, { ...now })).toBe("printed");
	});
	test("an edited message or receiver is changed", () => {
		expect(printStatus(now, { ...now, message: "Congrats" })).toBe("changed");
		expect(printStatus(now, { ...now, to: "Mila" })).toBe("changed");
	});
});

describe("compareCards", () => {
	test("by day (none last), company, then buyer", () => {
		const cards = [
			card({ key: "a", deliveryDate: "", company: "Alfa" }),
			card({ key: "b", deliveryDate: "2026-11-15", company: "Alfa" }),
			card({ key: "c", deliveryDate: "2026-11-14", company: "Charlie" }),
			card({
				key: "d",
				deliveryDate: "2026-11-14",
				company: "Alfa",
				buyer: "Zamora, B",
			}),
			card({ key: "e", deliveryDate: "2026-11-14", company: "Alfa" }),
		];
		expect(cards.sort(compareCards).map((c) => c.key)).toEqual([
			"e",
			"d",
			"c",
			"b",
			"a",
		]);
	});
	test("an order's cards stay in bouquet order", () => {
		const cards = [
			card({ key: "x", slot: "10:0" }),
			card({ key: "y", slot: "2:0" }),
		];
		expect(cards.sort(compareCards).map((c) => c.key)).toEqual(["y", "x"]);
	});
});

describe("toSheets", () => {
	test("groups of four, last one short", () => {
		expect(toSheets([1, 2, 3, 4, 5, 6])).toEqual([
			[1, 2, 3, 4],
			[5, 6],
		]);
		expect(toSheets([])).toEqual([]);
	});
});

describe("centerMessage", () => {
	test("short notes center, long or many-line ones don't", () => {
		expect(centerMessage("Happy graduation, Mia!")).toBe(true);
		expect(centerMessage("a".repeat(400))).toBe(false);
		expect(centerMessage("1\n2\n3\n4\n5")).toBe(false);
	});
});

describe("cardMatches", () => {
	const ana = card({
		number: "95",
		buyer: "Cruz, Ana",
		to: "José",
		message: "Proud of you!",
		label: "Sophia · Pink and White",
		company: "Bravo",
		className: "1CL",
		serialNumber: "20231234",
		email: "ana@example.com",
	});
	test("empty search matches everything", () => {
		expect(cardMatches(ana, "")).toBe(true);
		expect(cardMatches(ana, " , ")).toBe(true);
	});
	test("order number with or without #, exactly", () => {
		expect(cardMatches(ana, "95")).toBe(true);
		expect(cardMatches(ana, "#95")).toBe(true);
		expect(cardMatches(ana, "#9")).toBe(false);
		expect(cardMatches(ana, "9")).toBe(false);
		expect(cardMatches(ana, "#195")).toBe(false);
		expect(cardMatches(ana, "#5")).toBe(false);
	});
	test("every word, any order, any field, accents and case ignored", () => {
		expect(cardMatches(ana, "ana cruz")).toBe(true);
		expect(cardMatches(ana, "jose")).toBe(true);
		expect(cardMatches(ana, "bravo sophia")).toBe(true);
		expect(cardMatches(ana, "1cl PROUD")).toBe(true);
		expect(cardMatches(ana, "ana@example")).toBe(true);
		expect(cardMatches(ana, "ana alfa")).toBe(false);
	});
	test("serial numbers, with or without C-", () => {
		expect(cardMatches(ana, "C-2023")).toBe(true);
		expect(cardMatches(ana, "31234")).toBe(true);
		// Short numbers are order numbers, not bits of a serial.
		expect(cardMatches(ana, "1234")).toBe(false);
		expect(cardMatches(ana, "c-9999")).toBe(false);
	});
	test("commas list several orders", () => {
		expect(cardMatches(ana, "102, 95, 213")).toBe(true);
		expect(cardMatches(ana, "102, 213")).toBe(false);
		expect(cardMatches(ana, "#102, ana cruz")).toBe(true);
	});
});
