import { describe, expect, test } from "bun:test";

import {
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
