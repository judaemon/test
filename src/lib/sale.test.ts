import { describe, expect, test } from "bun:test";

import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import {
	allowsMethod,
	applySale,
	bestSale,
	markupPrice,
	methodsText,
	orderPaymentMethods,
	type PublicSale,
	type Sale,
	saleEndsText,
	salePrice,
	saleStatus,
	savings,
	shopToday,
} from "~/lib/sale";

const sale = (overrides: Partial<Sale> = {}): Sale => ({
	id: "s1",
	name: "November Sale",
	kind: "percent",
	value: 5,
	pricing: "discount",
	startsOn: "2026-11-07",
	endsOn: "2026-11-09",
	enabled: true,
	scope: "all",
	arrangementTypes: [],
	products: [],
	includeCustom: false,
	paymentMethods: [],
	...overrides,
});

describe("when a sale is on", () => {
	test("runs from its first to the end of its last Manila day", () => {
		expect(saleStatus(sale(), "2026-11-06")).toBe("scheduled");
		expect(saleStatus(sale(), "2026-11-07")).toBe("live");
		expect(saleStatus(sale(), "2026-11-09")).toBe("live");
		expect(saleStatus(sale(), "2026-11-10")).toBe("ended");
		expect(saleStatus(sale({ enabled: false }), "2026-11-08")).toBe("off");
	});
	test("Manila's day, not the server's", () => {
		// 16:30 UTC on the 9th is already the 10th in Manila.
		expect(shopToday(new Date("2026-11-09T16:30:00Z"))).toBe("2026-11-10");
		expect(shopToday(new Date("2026-11-09T15:30:00Z"))).toBe("2026-11-09");
	});
	test("says when it ends", () => {
		expect(saleEndsText("2026-11-09", "2026-11-09")).toBe("Ends today");
		expect(saleEndsText("2026-11-09", "2026-11-08")).toBe("Ends tomorrow");
		expect(saleEndsText("2026-11-09", "2026-11-07")).toBe("Ends Nov 9");
	});
});

describe("sale prices", () => {
	test("rounded down to whole pesos, never below zero", () => {
		expect(salePrice(3499, { kind: "percent", value: 5 })).toBe(3324);
		expect(salePrice(1000, { kind: "percent", value: 5 })).toBe(950);
		expect(salePrice(300, { kind: "amount", value: 100 })).toBe(200);
		expect(salePrice(80, { kind: "amount", value: 100 })).toBe(0);
	});
	test("the biggest discount wins; sales don't add up", () => {
		const sales: PublicSale[] = [
			sale({ id: "a", value: 5 }),
			sale({ id: "b", kind: "amount", value: 300 }),
			sale({ id: "c", value: 10 }),
		];
		const best = bestSale(2000, { productId: "x" }, sales);
		expect(best?.sale.id).toBe("b");
		expect(best?.price).toBe(1700);
	});
	test("chosen items: by type, by arrangement, or custom bouquets", () => {
		const chosen = sale({
			scope: "selected",
			arrangementTypes: ["corsage"],
			products: ["odette"],
		});
		const on = (item: { productId: string; arrangement?: string }) =>
			!!bestSale(1000, item, [chosen]);
		expect(on({ productId: "lily", arrangement: "corsage" })).toBe(true);
		expect(on({ productId: "odette", arrangement: "bouquet" })).toBe(true);
		expect(on({ productId: "rosie", arrangement: "bouquet" })).toBe(false);
		expect(on({ productId: CUSTOM_PRODUCT_ID })).toBe(false);
		expect(
			!!bestSale(1000, { productId: CUSTOM_PRODUCT_ID }, [
				{ ...chosen, includeCustom: true },
			]),
		).toBe(true);
		// Everything includes custom bouquets.
		expect(!!bestSale(1000, { productId: CUSTOM_PRODUCT_ID }, [sale()])).toBe(
			true,
		);
	});
	test("savings add up per line and quantity", () => {
		expect(
			savings([
				{ originalUnitPrice: 3499, unitPrice: 3324, quantity: 2 },
				{ unitPrice: 500, quantity: 1 },
			]),
		).toBe(350);
	});
});

describe("showing a higher before-price (markup)", () => {
	test("5% off the shown price lands on the real price", () => {
		expect(markupPrice(1000, { kind: "percent", value: 5 })).toBe(1053);
		expect(salePrice(1053, { kind: "percent", value: 5 })).toBe(1000);
		expect(markupPrice(2999, { kind: "percent", value: 5 })).toBe(3157);
		expect(salePrice(3157, { kind: "percent", value: 5 })).toBe(2999);
		expect(markupPrice(1000, { kind: "amount", value: 100 })).toBe(1100);
	});
	test("customers pay the real price", () => {
		expect(
			applySale(1000, { kind: "percent", value: 5, pricing: "markup" }),
		).toEqual({ price: 1000, original: 1053 });
		expect(
			applySale(1000, { kind: "percent", value: 5, pricing: "discount" }),
		).toEqual({ price: 950, original: 1000 });
	});
	test("a real discount beats a higher before-price", () => {
		const best = bestSale(1000, { productId: "x" }, [
			sale({ id: "markup", pricing: "markup", value: 20 }),
			sale({ id: "real", value: 5 }),
		]);
		expect(best?.sale.id).toBe("real");
		expect(best?.price).toBe(950);
	});
	test("between before-prices, the higher one shows", () => {
		const best = bestSale(1000, { productId: "x" }, [
			sale({ id: "small", pricing: "markup", value: 5 }),
			sale({ id: "big", pricing: "markup", value: 10 }),
		]);
		expect(best).toEqual(
			expect.objectContaining({ price: 1000, original: 1112 }),
		);
		expect(best?.sale.id).toBe("big");
	});
});

describe("sales for some payment methods only", () => {
	test("apply only when one of them is chosen", () => {
		const gcash = sale({ paymentMethods: ["gcash"] });
		expect(allowsMethod(gcash, null)).toBe(false);
		expect(allowsMethod(gcash, "bank")).toBe(false);
		expect(allowsMethod(gcash, "gcash")).toBe(true);
		expect(allowsMethod(sale(), null)).toBe(true);
	});
	test("read naturally", () => {
		expect(methodsText(["gcash"])).toBe("GCash");
		expect(methodsText(["gcash", "maya"])).toBe("GCash or Maya");
		expect(methodsText(["bank", "gcash", "cash"])).toBe(
			"bank transfer, GCash or cash",
		);
	});
	test("an order with such discounts must be paid one of their ways", () => {
		expect(orderPaymentMethods({ lines: [{}, { sale: {} }] })).toBeUndefined();
		expect(
			orderPaymentMethods({
				lines: [{ sale: { paymentMethods: ["gcash", "maya"] } }],
				promo: { paymentMethods: ["gcash", "bank"] },
			}),
		).toEqual(["gcash"]);
	});
});
