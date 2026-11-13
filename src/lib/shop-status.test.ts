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
		company: "Alfa",
		serialNumber: "C-12345",
		date: "2026-11-14",
	};
	test("a cadet needs company, serial number and day", () => {
		expect(checkWish(cadet)).toEqual({
			ok: true,
			wish: { ...cadet, serialNumber: "12345" },
		});
		const result = checkWish({ ...cadet, serialNumber: "" });
		expect(!result.ok && Object.keys(result.errors)).toEqual(["serialNumber"]);
		const unknown = checkWish({ ...cadet, company: "Zulu" });
		expect(!unknown.ok && unknown.errors.company).toBeTruthy();
	});
	test("civilians leave the serial number out", () => {
		const result = checkWish({ ...cadet, company: "Civilian" });
		expect(result.ok && result.wish).toMatchObject({
			company: "Civilian",
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
	test("needs a company and a name", () => {
		const result = checkWish({ date: "2026-11-14" });
		expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
			"company",
			"name",
		]);
	});
});
