import { describe, expect, test } from "bun:test";

import { cleanWishName, isShoppingPath } from "./shop-status";

describe("isShoppingPath", () => {
	test("shopping pages close with the shop", () => {
		for (const path of [
			"/",
			"/shop",
			"/shop/",
			"/products/fiona",
			"/custom",
			"/checkout",
			"/promos",
		])
			expect(isShoppingPath(path)).toBe(true);
	});
	test("orders, payment, accounts and card pages stay open", () => {
		for (const path of [
			"/order/abc",
			"/pay/1043",
			"/active-orders",
			"/account",
			"/sign-in",
			"/hello",
			"/b/Ab3dE9xYz1",
			"/admin/orders",
			"/shopping-bag",
		])
			expect(isShoppingPath(path)).toBe(false);
	});
});

describe("cleanWishName", () => {
	test("tidies spaces", () => {
		expect(cleanWishName("  Ana   Cruz ")).toBe("Ana Cruz");
		expect(cleanWishName("José\nRizal")).toBe("José Rizal");
	});
	test("rejects empty, too short, too long, or no letters", () => {
		expect(cleanWishName("")).toBeUndefined();
		expect(cleanWishName("A")).toBeUndefined();
		expect(cleanWishName("x".repeat(61))).toBeUndefined();
		expect(cleanWishName("12345")).toBeUndefined();
		expect(cleanWishName(42)).toBeUndefined();
	});
});
