import { describe, expect, test } from "bun:test";

import { checkWish, cleanWishName, isShoppingPath } from "./shop-status";

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

describe("checkWish", () => {
	const cadet = {
		name: "Ana Cruz",
		className: "2CL",
		company: "Alfa",
		serialNumber: "C-12345",
		date: "2026-11-14",
	};
	test("a cadet needs class, company, serial number and day", () => {
		expect(checkWish(cadet)).toEqual({
			ok: true,
			wish: { ...cadet, serialNumber: "12345" },
		});
		const result = checkWish({ ...cadet, company: "", serialNumber: "" });
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(Object.keys(result.errors).sort()).toEqual([
				"company",
				"serialNumber",
			]);
	});
	test("civilians leave company and serial number out", () => {
		const result = checkWish({ ...cadet, className: "Civilian" });
		expect(result.ok && result.wish).toMatchObject({
			className: "Civilian",
			company: "",
			serialNumber: "",
		});
	});
	test("only November 14 or 15", () => {
		for (const date of ["", "2026-11-16", "tomorrow"]) {
			const result = checkWish({ ...cadet, date });
			expect(!result.ok && result.errors.date).toBeTruthy();
		}
		expect(checkWish({ ...cadet, date: "2026-11-15" }).ok).toBe(true);
	});
	test("needs a class and a name", () => {
		const result = checkWish({ date: "2026-11-14" });
		expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
			"className",
			"name",
		]);
	});
});
