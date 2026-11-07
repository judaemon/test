import { describe, expect, test } from "bun:test";

import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import {
	isRewardOrder,
	meetsMinSpend,
	orderPromoLabel,
	orderPromoStatus,
	ordersUntilReward,
	ordinal,
	promoSubtotal,
} from "~/lib/order-promo";

const every10 = { every: 10, repeat: true };
const only10 = { every: 10, repeat: false };

describe("order promos", () => {
	test("every 10th order: the 10th, 20th, 30th…", () => {
		expect(isRewardOrder(every10, 8)).toBe(false);
		expect(isRewardOrder(every10, 9)).toBe(true);
		expect(isRewardOrder(every10, 10)).toBe(false);
		expect(isRewardOrder(every10, 19)).toBe(true);
	});
	test("just the 10th, when it doesn't repeat", () => {
		expect(isRewardOrder(only10, 9)).toBe(true);
		expect(isRewardOrder(only10, 19)).toBe(false);
		expect(ordersUntilReward(only10, 12)).toBeUndefined();
	});
	test("counts down to the reward order", () => {
		expect(ordersUntilReward(every10, 0)).toBe(10);
		expect(ordersUntilReward(every10, 7)).toBe(3);
		expect(ordersUntilReward(every10, 9)).toBe(1);
		expect(ordersUntilReward(every10, 10)).toBe(10);
	});
	test("reads naturally", () => {
		expect(ordinal(10)).toBe("10th");
		expect(ordinal(21)).toBe("21st");
		expect(ordinal(12)).toBe("12th");
		expect(orderPromoLabel({ amount: 500, every: 10, repeat: true })).toBe(
			"₱500 off every 10th order",
		);
	});
	test("runs between its days; no end date runs on", () => {
		const promo = { enabled: true, startsOn: "2026-11-07", endsOn: "" };
		expect(orderPromoStatus(promo, "2026-11-06")).toBe("scheduled");
		expect(orderPromoStatus(promo, "2030-01-01")).toBe("live");
		expect(
			orderPromoStatus({ ...promo, endsOn: "2026-11-30" }, "2026-12-01"),
		).toBe("ended");
		expect(orderPromoStatus({ ...promo, enabled: false }, "2026-11-08")).toBe(
			"off",
		);
	});
});

describe("minimum order", () => {
	test("more than the minimum, not equal to it", () => {
		expect(meetsMinSpend({ minSpend: 500 }, 500)).toBe(false);
		expect(meetsMinSpend({ minSpend: 500 }, 500.5)).toBe(true);
		expect(meetsMinSpend({ minSpend: 0 }, 1)).toBe(true);
	});
});

describe("what an order promo is on", () => {
	const lines = [
		{ productId: "lily", arrangement: "corsage", lineTotal: 400 },
		{ productId: "rosie", arrangement: "bouquet", lineTotal: 2999 },
		{ productId: CUSTOM_PRODUCT_ID, lineTotal: 1500 },
	];
	const scope = {
		scope: "selected" as const,
		arrangementTypes: [],
		products: [],
		includeCustom: false,
	};
	test("everything counts the whole order", () => {
		expect(promoSubtotal({ ...scope, scope: "all" }, lines)).toBe(4899);
	});
	test("chosen items count only them", () => {
		expect(
			promoSubtotal({ ...scope, arrangementTypes: ["corsage"] }, lines),
		).toBe(400);
		expect(promoSubtotal({ ...scope, products: ["rosie"] }, lines)).toBe(2999);
		expect(promoSubtotal({ ...scope, includeCustom: true }, lines)).toBe(1500);
		expect(promoSubtotal({ ...scope, products: ["odette"] }, lines)).toBe(0);
	});
});
