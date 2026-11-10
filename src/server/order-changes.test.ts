import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canCancelOneBouquet, orderEditState } from "~/lib/order-edit";
import type { PricedLine } from "~/lib/pricing";
import type { Order } from "~/types/order";

/**
 * Cancelling, editing and swapping change stock and money, so these run the
 * real database code, on a throwaway database. Never the shop's own.
 */
process.env.DATABASE_PATH = join(
	mkdtempSync(join(tmpdir(), "oraia-test-")),
	"test.sqlite",
);

let repo: typeof import("./orders-repo");
let db: typeof import("./db");
let pricing: typeof import("~/lib/pricing");
let catalog: typeof import("./catalog-repo");
/** Two bouquets to order, with counted stock. */
let first: { productId: string; variantId: string };
let second: { productId: string; variantId: string };

const HOUR = 3_600_000;
const stock = (bouquet: { productId: string; variantId: string }) =>
	(
		db
			.getDb()
			.query(
				"SELECT stock_quantity AS q FROM bouquet_styles WHERE bouquet_id = $p AND slug = $v",
			)
			.get({ p: bouquet.productId, v: bouquet.variantId }) as { q: number }
	).q;
const setRow = (id: string, sql: string, values: Record<string, string>) =>
	db
		.getDb()
		.query(`UPDATE orders SET ${sql} WHERE id = $id`)
		.run({
			id,
			...values,
		});

const DETAILS = {
	firstName: "Test",
	lastName: "Shopper",
	fullName: "Test Shopper",
	company: "",
	serialNumber: "",
	className: "Civilian",
	email: "shopper@example.com",
	notes: "",
	addDedication: false,
	dedicationFor: "",
	dedicationMessage: "",
};

/** An order on hold (ordered, payment to follow), just placed. */
function place(
	lines: { productId: string; variantId: string; quantity: number }[],
) {
	const cart = pricing.priceCart(lines, catalog.listPublicProducts());
	expect(cart.lines.length).toBe(lines.length);
	return repo.createOrder({
		id: crypto.randomUUID(),
		details: DETAILS,
		cart,
		payment: { method: "gcash", status: "on_hold" },
	});
}
const line = (
	order: Order,
	bouquet: { variantId: string; productId: string },
) =>
	order.lines.find(
		(l) =>
			l.productId === bouquet.productId && l.variantId === bouquet.variantId,
	) as PricedLine;
const key = (bouquet: { productId: string; variantId: string }) =>
	`${bouquet.productId}::${bouquet.variantId}`;

beforeAll(async () => {
	expect(process.env.DATABASE_PATH).toContain("oraia-test-");
	db = await import("./db");
	repo = await import("./orders-repo");
	pricing = await import("~/lib/pricing");
	catalog = await import("./catalog-repo");
	db.getDb();
	// The first two bouquets the shop can sell, with stock that's counted.
	const styles = catalog.listPublicProducts().flatMap((product) =>
		product.variants.map((variant) => ({
			productId: product.id,
			variantId: variant.id,
		})),
	);
	const [a, b] = styles;
	if (!a || !b) throw new Error("The starter catalog needs two styles.");
	first = a;
	second = b;
	const reset = db.getDb().query(
		`UPDATE bouquet_styles SET stock_quantity = 20, is_available = 1, price_cents = $price
		 WHERE bouquet_id = $productId AND slug = $variantId`,
	);
	reset.run({ ...first, price: 80000 });
	reset.run({ ...second, price: 130000 });
});

describe("who can edit, and until when", () => {
	const order = (over: Record<string, unknown> = {}) =>
		({
			createdAt: new Date().toISOString(),
			stage: "new",
			payment: { status: "on_hold" },
			lines: [{ variantId: "red", quantity: 2 }],
			...over,
		}) as Parameters<typeof canCancelOneBouquet>[0];

	test("on hold and within 24 hours", () => {
		expect(orderEditState(order()).editable).toBe(true);
	});
	test("just inside and just past the deadline", () => {
		const now = new Date();
		const at = (hours: number) =>
			order({
				createdAt: new Date(now.getTime() - hours * HOUR).toISOString(),
			});
		expect(orderEditState(at(23.99), now).editable).toBe(true);
		const late = orderEditState(at(24), now);
		expect(late.editable).toBe(false);
		expect(late.lock).toBe("expired");
	});
	test("locked once any payment is sent, even one not yet checked", () => {
		for (const status of ["pending", "rejected", "verified", "paid"]) {
			const state = orderEditState(order({ payment: { status } }));
			expect(state.editable).toBe(false);
			expect(state.lock).toBe("payment");
		}
	});
	test("locked once it's being made, done or cancelled", () => {
		for (const stage of ["making", "done", "cancelled"])
			expect(orderEditState(order({ stage })).editable).toBe(false);
	});
	test("orders staff added from a chat stay with staff", () => {
		expect(
			orderEditState(order({ lines: [{ variantId: "chat-1", quantity: 1 }] }))
				.editable,
		).toBe(false);
	});
	test("one bouquet can be cancelled only if another remains", () => {
		expect(canCancelOneBouquet(order())).toBe(true);
		expect(
			canCancelOneBouquet(
				order({ lines: [{ variantId: "red", quantity: 1 }] }),
			),
		).toBe(false);
	});
});

describe("cancelling the whole order", () => {
	test("needs nothing but a recorded reason, restocks everything", () => {
		const before = stock(first);
		const order = place([{ ...first, quantity: 2 }]);
		expect(stock(first)).toBe(before - 2);
		const done = repo.cancelOrder(order.id, {
			reason: "Asked to cancel",
			cancelledBy: "Staff",
			proofFile: "proof.jpg",
		});
		expect(done.stage).toBe("cancelled");
		expect(done.cancelReason).toBe("Asked to cancel");
		expect(stock(first)).toBe(before);
	});
	test("can't happen twice, so stock can't be returned twice", () => {
		const order = place([{ ...first, quantity: 1 }]);
		const cancel = () =>
			repo.cancelOrder(order.id, { reason: "x", cancelledBy: "Staff" });
		cancel();
		const after = stock(first);
		expect(cancel).toThrow();
		expect(stock(first)).toBe(after);
	});
	test("done orders can't be cancelled", () => {
		const order = place([{ ...first, quantity: 1 }]);
		setRow(order.id, "stage = 'done'", {});
		expect(() =>
			repo.cancelOrder(order.id, { reason: "x", cancelledBy: "Staff" }),
		).toThrow();
	});
	test("customers see the reason, never who did it or the photo", () => {
		const order = place([{ ...first, quantity: 1 }]);
		const done = repo.cancelOrder(order.id, {
			reason: "Out of flowers",
			cancelledBy: "Secret Staff",
			proofFile: "secret.jpg",
		});
		const seen = JSON.stringify(repo.toCustomerOrder(done));
		expect(seen).toContain("Out of flowers");
		expect(seen).not.toContain("Secret Staff");
		expect(seen).not.toContain("secret.jpg");
	});
});

describe("cancelling one bouquet", () => {
	const cancelOne = (
		id: string,
		bouquet: { productId: string; variantId: string },
		unit = 0,
	) =>
		repo.cancelBouquet(id, {
			lineKey: key(bouquet),
			unit,
			reason: "Changed their mind",
			cancelledBy: "Secret Staff",
			proofFile: "secret.jpg",
		});

	test("leaves the other bouquets and the order alone", () => {
		const firstBefore = stock(first);
		const secondBefore = stock(second);
		const order = place([
			{ ...first, quantity: 1 },
			{ ...second, quantity: 1 },
		]);
		const after = cancelOne(order.id, first);
		expect(after.stage).toBe("new");
		expect(after.lines.map((l) => l.productId)).toEqual([second.productId]);
		expect(after.total).toBe(1300);
		expect(stock(first)).toBe(firstBefore);
		expect(stock(second)).toBe(secondBefore - 1);
		expect(after.cancelledBouquets[0]?.reason).toBe("Changed their mind");
	});
	test("takes the chosen one of several, with its card", () => {
		const order = place([{ ...first, quantity: 2 }]);
		const card = (to: string) => ({ to, message: `For ${to}`, note: "" });
		const stored = {
			...line(order, first),
			messages: [card("Maria"), card("Ana")],
		};
		setRow(order.id, "lines = $lines", { lines: JSON.stringify([stored]) });
		const before = stock(first);
		const after = repo.cancelBouquet(order.id, {
			lineKey: key(first),
			unit: 0,
			reason: "x",
			cancelledBy: "Staff",
		});
		expect(line(after, first).quantity).toBe(1);
		expect(line(after, first).lineTotal).toBe(800);
		expect(line(after, first).messages?.map((m) => m.to)).toEqual(["Ana"]);
		expect(after.total).toBe(800);
		expect(stock(first)).toBe(before + 1);
	});
	test("refused for the order's only bouquet", () => {
		const order = place([{ ...first, quantity: 1 }]);
		expect(() => cancelOne(order.id, first)).toThrow();
	});
	test("refused once payment is sent or 24 hours have passed", () => {
		const paid = place([{ ...first, quantity: 2 }]);
		setRow(paid.id, "payment_status = 'pending'", {});
		expect(() => cancelOne(paid.id, first)).toThrow();
		const old = place([{ ...first, quantity: 2 }]);
		setRow(old.id, "created_at = $at", {
			at: new Date(Date.now() - 25 * HOUR).toISOString(),
		});
		expect(() => cancelOne(old.id, first)).toThrow();
		expect(line(repo.getOrderById(old.id) as Order, first).quantity).toBe(2);
	});
	test("customers see the reason, never who did it or the photo", () => {
		const order = place([
			{ ...first, quantity: 1 },
			{ ...second, quantity: 1 },
		]);
		const seen = JSON.stringify(
			repo.toCustomerOrder(cancelOne(order.id, first)),
		);
		expect(seen).toContain("Changed their mind");
		expect(seen).not.toContain("Secret Staff");
		expect(seen).not.toContain("secret.jpg");
	});
});

describe("the shopper editing", () => {
	const priced = (
		bouquet: { productId: string; variantId: string },
		quantity: number,
	) =>
		pricing.priceCart([{ ...bouquet, quantity }], catalog.listPublicProducts())
			.lines[0] as PricedLine;

	test("removing one returns its stock and lowers the total", () => {
		const order = place([{ ...first, quantity: 2 }]);
		const before = stock(first);
		const after = repo.updateCustomerOrder(order.id, {
			details: DETAILS,
			lines: [priced(first, 1)],
		});
		expect(after.total).toBe(800);
		expect(stock(first)).toBe(before + 1);
		expect(after.customerEditedAt).toBeTruthy();
	});
	test("swapping moves stock across and reprices", () => {
		const order = place([{ ...first, quantity: 2 }]);
		const firstBefore = stock(first);
		const secondBefore = stock(second);
		const after = repo.updateCustomerOrder(order.id, {
			details: DETAILS,
			lines: [priced(second, 2)],
		});
		expect(after.total).toBe(2600);
		expect(stock(first)).toBe(firstBefore + 2);
		expect(stock(second)).toBe(secondBefore - 2);
	});
	test("not enough stock changes nothing at all", () => {
		const order = place([{ ...first, quantity: 1 }]);
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 0 WHERE bouquet_id = ?1",
			)
			.run(second.productId);
		const before = stock(first);
		expect(() =>
			repo.updateCustomerOrder(order.id, {
				details: DETAILS,
				lines: [
					{
						...priced(first, 1),
						productId: second.productId,
						variantId: second.variantId,
					},
				],
			}),
		).toThrow();
		expect(stock(first)).toBe(before);
		expect(line(repo.getOrderById(order.id) as Order, first).quantity).toBe(1);
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 20 WHERE bouquet_id = ?1",
			)
			.run(second.productId);
	});
	test("refused once payment is sent or 24 hours have passed", () => {
		const paid = place([{ ...first, quantity: 1 }]);
		setRow(paid.id, "payment_status = 'pending'", {});
		const old = place([{ ...first, quantity: 1 }]);
		setRow(old.id, "created_at = $at", {
			at: new Date(Date.now() - 25 * HOUR).toISOString(),
		});
		for (const id of [paid.id, old.id])
			expect(() =>
				repo.updateCustomerOrder(id, {
					details: { ...DETAILS, fullName: "Changed" },
					lines: [priced(first, 1)],
				}),
			).toThrow();
	});
});

describe("staff changing the payment method", () => {
	const change = (id: string, method: "gcash" | "maya" | "cash" | "card") =>
		repo.changePaymentMethod(id, {
			method,
			reason: "Paid in cash instead",
			changedBy: "Secret Staff",
			proofFile: "change-proof.jpg",
		});

	test("switches the method, keeps the status, and records why", () => {
		const order = place([{ ...first, quantity: 1 }]);
		const changed = change(order.id, "cash");
		expect(changed.payment.method).toBe("cash");
		expect(changed.payment.status).toBe("on_hold");
		expect(changed.paymentMethodChanges).toHaveLength(1);
		expect(changed.paymentMethodChanges[0]).toMatchObject({
			from: "gcash",
			to: "cash",
			reason: "Paid in cash instead",
			changedBy: "Secret Staff",
			proofFile: "change-proof.jpg",
		});
		expect(change(order.id, "maya").paymentMethodChanges).toHaveLength(2);
	});

	test("refused for the same method, card, or a cancelled order", () => {
		const order = place([{ ...first, quantity: 1 }]);
		expect(() => change(order.id, "gcash")).toThrow();
		expect(() => change(order.id, "card")).toThrow();
		setRow(order.id, "payment_method = 'card'", {});
		expect(() => change(order.id, "cash")).toThrow();
		const other = place([{ ...first, quantity: 1 }]);
		repo.cancelOrder(other.id, { reason: "x", cancelledBy: "Staff" });
		expect(() => change(other.id, "cash")).toThrow();
	});

	test("customers see the new method, never the reason, who or the photo", () => {
		const order = place([{ ...first, quantity: 1 }]);
		const seen = repo.toCustomerOrder(change(order.id, "cash"));
		expect(seen.payment.method).toBe("cash");
		const text = JSON.stringify(seen);
		expect(text).not.toContain("Paid in cash instead");
		expect(text).not.toContain("Secret Staff");
		expect(text).not.toContain("change-proof.jpg");
	});
});

describe("the order log", () => {
	let logRepo: typeof import("./order-log-repo");
	const staff = {
		type: "staff" as const,
		name: "Person 1",
		userId: "u1",
		source: "/admin/orders/x",
	};
	beforeAll(async () => {
		logRepo = await import("./order-log-repo");
	});
	const logOf = (id: string) =>
		logRepo.listOrderLog({ orderId: id }).entries.reverse();

	test("logs placing, then each field a change touched, with who and where", () => {
		const order = place([{ ...first, quantity: 1 }]);
		expect(logOf(order.id).map((e) => e.action)).toContain("placed");
		repo.reviewPayment(order.id, "verified", "Person 1", staff);
		repo.setOrderStage(order.id, "making", staff);
		const entries = logOf(order.id).filter((e) => e.action !== "placed");
		expect(entries).toEqual([
			expect.objectContaining({
				action: "payment_review",
				field: "payment_status",
				from: "on_hold",
				to: "verified",
				actor: staff,
			}),
			expect.objectContaining({
				action: "stage",
				field: "stage",
				from: "new",
				to: "making",
			}),
		]);
	});

	test("a refused change, or one that changes nothing, isn't logged", () => {
		const order = place([{ ...first, quantity: 1 }]);
		const before = logOf(order.id).length;
		expect(() => repo.setOrderStage(order.id, "making", staff)).toThrow();
		repo.setOrderStage(order.id, "new", staff);
		expect(logOf(order.id).length).toBe(before);
	});

	test("a customer's edit logs the new total, bouquets and details", () => {
		const order = place([{ ...first, quantity: 2 }]);
		const line = pricing.priceCart(
			[{ ...first, quantity: 1 }],
			catalog.listPublicProducts(),
		).lines[0] as PricedLine;
		const customer = {
			type: "customer" as const,
			name: "Test Shopper",
			source: `/order/${order.id}/edit`,
		};
		repo.updateCustomerOrder(
			order.id,
			{ details: { ...DETAILS, email: "new@example.com" }, lines: [line] },
			customer,
		);
		const edits = logOf(order.id).filter((e) => e.action === "customer_edit");
		expect(edits.map((e) => e.field).sort()).toEqual([
			"email",
			"items",
			"total",
		]);
		expect(edits.every((e) => e.actor.type === "customer")).toBe(true);
		expect(edits.find((e) => e.field === "items")).toMatchObject({
			from: "2",
			to: "1",
		});
	});

	test("keeps the reason given for changing the payment method", () => {
		const order = place([{ ...first, quantity: 1 }]);
		repo.changePaymentMethod(
			order.id,
			{ method: "cash", reason: "Handed cash", changedBy: "Person 1" },
			staff,
		);
		expect(logOf(order.id).at(-1)).toMatchObject({
			action: "payment_method",
			field: "payment_method",
			from: "gcash",
			to: "cash",
			reason: "Handed cash",
		});
	});

	test("filters by person across orders, newest first", () => {
		const { entries, people } = logRepo.listOrderLog({ actor: "Person 1" });
		expect(people).toContain("Person 1");
		expect(entries.every((e) => e.actor.name === "Person 1")).toBe(true);
		expect(entries[0]?.orderNumber).toBeTruthy();
		const ids = entries.map((e) => e.id);
		expect(ids).toEqual([...ids].sort((a, b) => b - a));
	});
});

describe("orders placed during a sale", () => {
	const fivePercent = {
		id: "test-sale",
		name: "Test Sale",
		kind: "percent" as const,
		value: 5,
		pricing: "discount" as const,
		startsOn: "2000-01-01",
		endsOn: "2999-12-31",
		scope: "all" as const,
		arrangementTypes: [],
		products: [],
		includeCustom: false,
		paymentMethods: [],
	};
	test("keep the sale price, the old price and the sale on each bouquet", () => {
		const cart = pricing.priceCart(
			[{ ...first, quantity: 2 }],
			catalog.listPublicProducts(),
			undefined,
			[fivePercent],
		);
		const order = repo.createOrder({
			id: crypto.randomUUID(),
			details: DETAILS,
			cart,
			payment: { method: "gcash", status: "on_hold" },
		});
		const [line] = order.lines;
		expect(line?.originalUnitPrice).toBe(800);
		expect(line?.unitPrice).toBe(760);
		expect(line?.sale).toEqual({
			id: "test-sale",
			name: "Test Sale",
			label: "5% off",
		});
		expect(order.total).toBe(1520);
	});
	test("an edit after the sale keeps the price the bouquet was ordered at", () => {
		const cart = pricing.priceCart(
			[{ ...second, quantity: 2 }],
			catalog.listPublicProducts(),
			undefined,
			[fivePercent],
		);
		const order = repo.createOrder({
			id: crypto.randomUUID(),
			details: DETAILS,
			cart,
			payment: { method: "gcash", status: "on_hold" },
		});
		const kept = order.lines[0] as PricedLine;
		const after = repo.updateCustomerOrder(order.id, {
			details: DETAILS,
			lines: [{ ...kept, quantity: 1, lineTotal: kept.unitPrice }],
		});
		// 1,300 less 5%, rounded down.
		expect(after.total).toBe(1235);
	});
});

describe("the sales store", () => {
	test("starts with the owner's 5% off everything, Nov 7–9, 2026", async () => {
		const sales = await import("./sales-repo");
		const november = sales
			.listSales()
			.find((sale) => sale.id === "november-sale-2026");
		expect(november).toMatchObject({
			kind: "percent",
			value: 5,
			startsOn: "2026-11-07",
			endsOn: "2026-11-09",
			scope: "all",
			enabled: true,
		});
		expect(sales.listLiveSales("2026-11-09").map((s) => s.id)).toContain(
			"november-sale-2026",
		);
		expect(sales.listLiveSales("2026-11-10").map((s) => s.id)).not.toContain(
			"november-sale-2026",
		);
	});
	test("saves, switches off and deletes a sale", async () => {
		const sales = await import("./sales-repo");
		const saved = sales.saveSale({
			name: "Corsage week",
			kind: "amount",
			value: 100,
			pricing: "discount",
			startsOn: "2026-12-01",
			endsOn: "2026-12-07",
			enabled: true,
			scope: "selected",
			arrangementTypes: ["corsage"],
			products: [],
			includeCustom: false,
			paymentMethods: [],
		});
		expect(
			sales.listLiveSales("2026-12-03").some((s) => s.id === saved.id),
		).toBe(true);
		sales.saveSale({ ...saved, enabled: false }, saved.id);
		expect(
			sales.listLiveSales("2026-12-03").some((s) => s.id === saved.id),
		).toBe(false);
		sales.deleteSale(saved.id);
		expect(sales.listSales().some((s) => s.id === saved.id)).toBe(false);
	});
});

describe("payment method warnings", () => {
	const cashOrder = (notice?: string) =>
		repo.createOrder({
			id: crypto.randomUUID(),
			details: { ...DETAILS, className: "1CL" },
			cart: pricing.priceCart(
				[{ ...second, quantity: 1 }],
				catalog.listPublicProducts(),
			),
			payment: {
				method: "cash",
				status: "on_hold",
				...(notice ? { notice } : {}),
			},
		});

	test("an order keeps the warning it was placed with after staff edit it", async () => {
		const payments = await import("./payments-repo");
		const order = cashOrder("Please pay before November 10.");
		const cash = payments.getPaymentAccount("cash");
		if (!cash) throw new Error("No cash account");
		const { method: _method, ...account } = cash;
		payments.updatePaymentAccount("cash", {
			...account,
			notice: "Please pay within 24 hours.",
		});
		expect(repo.getOrderById(order.id)?.payment.notice).toBe(
			"Please pay before November 10.",
		);
		// The customer sees it too.
		expect(
			repo.toCustomerOrder(repo.getOrderById(order.id) as Order).payment.notice,
		).toBe("Please pay before November 10.");
		// Staff switching an order to cash gives it the warning as it reads now.
		const other = place([{ ...second, quantity: 1 }]);
		const switched = repo.changePaymentMethod(other.id, {
			method: "cash",
			reason: "Paying in person",
			changedBy: "Staff",
		});
		expect(switched.payment.notice).toBe("Please pay within 24 hours.");
		payments.updatePaymentAccount("cash", account);
	});

	test("sending a payment clears the warning", () => {
		const order = place([{ ...second, quantity: 1 }]);
		repo.changePaymentMethod(order.id, {
			method: "cash",
			reason: "x",
			changedBy: "Staff",
		});
		const paid = repo.submitPayment(order.id, {
			method: "gcash",
			referenceNumber: "1234567890",
		});
		expect(paid.payment.notice).toBeUndefined();
	});
});

describe("orders placed during a before-price (markup) sale", () => {
	test("charge the real price and keep the shown before-price", () => {
		const cart = pricing.priceCart(
			[{ ...second, quantity: 1 }],
			catalog.listPublicProducts(),
			undefined,
			[
				{
					id: "markup-sale",
					name: "Markup Sale",
					kind: "percent",
					value: 5,
					pricing: "markup",
					startsOn: "2000-01-01",
					endsOn: "2999-12-31",
					scope: "all",
					arrangementTypes: [],
					products: [],
					includeCustom: false,
					paymentMethods: [],
				},
			],
		);
		const [line] = cart.lines;
		// 1,300 is the real price; 5% off 1,369 brings it back to 1,300.
		expect(line?.unitPrice).toBe(1300);
		expect(line?.originalUnitPrice).toBe(1369);
		expect(cart.total).toBe(1300);
	});
});

describe("the 10th order promo, by serial number", () => {
	const TODAY = "2026-11-08";
	// Twenty-odd orders: give the bouquet enough stock for them.
	beforeAll(() => {
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 200 WHERE bouquet_id = $productId AND slug = $variantId",
			)
			.run(second);
	});
	const cadet = (serialNumber: string) => ({
		...DETAILS,
		className: "1CL",
		serialNumber,
	});
	const orderFor = async (serialNumber: string) => {
		const promos = await import("./order-promos-repo");
		const priced = pricing.priceCart(
			[{ ...second, quantity: 1 }],
			catalog.listPublicProducts(),
		);
		const cart = pricing.withPromo(
			priced,
			promos.promoForNextOrder(serialNumber, priced.lines, null, TODAY),
		);
		return repo.createOrder({
			id: crypto.randomUUID(),
			details: cadet(serialNumber),
			cart,
			payment: { method: "cash", status: "on_hold" },
		});
	};

	test("starts with the owner's ₱500 off every 10th order over ₱500", async () => {
		const promos = await import("./order-promos-repo");
		expect(promos.listLiveOrderPromos(TODAY)).toEqual([
			expect.objectContaining({
				id: "tenth-flower-promo",
				name: "10th Flower Promo",
				every: 10,
				amount: 500,
				minSpend: 500,
				repeat: true,
			}),
		]);
	});

	test("the 10th order gets ₱500 off; cancelled and test orders don't count", async () => {
		const promos = await import("./order-promos-repo");
		const serial = "900001";
		const placed = [];
		for (let i = 0; i < 9; i++) placed.push(await orderFor(serial));
		expect(placed.every((order) => !order.promo)).toBe(true);
		// One cancelled and one test order: back to 7 that count.
		repo.cancelOrder(placed[0]?.id as string, {
			reason: "x",
			cancelledBy: "Staff",
		});
		repo.setOrderTest(placed[1]?.id as string, true);
		expect(promos.promoProgress(serial, TODAY).next?.remaining).toBe(2);
		await orderFor(serial);
		await orderFor(serial);
		expect(promos.promoProgress(serial, TODAY).reward).toEqual({
			name: "10th Flower Promo",
			amount: 500,
			minSpend: 500,
			scope: "all",
			arrangementTypes: [],
			products: [],
			includeCustom: false,
			paymentMethods: [],
		});
		const tenth = await orderFor(serial);
		expect(tenth.promo).toEqual({
			id: "tenth-flower-promo",
			name: "10th Flower Promo",
			amount: 500,
		});
		expect(tenth.total).toBe(tenth.subtotal - 500);
		// Another serial number starts from zero.
		expect(
			promos.promoForNextOrder(
				"900002",
				[{ productId: "x", lineTotal: 1300 }],
				null,
				TODAY,
			),
		).toBeUndefined();
	});

	test("an edit keeps the discount, never below ₱0 for the bouquets", async () => {
		const promos = await import("./order-promos-repo");
		const serial = "900003";
		for (let i = 0; i < 9; i++) await orderFor(serial);
		const tenth = await orderFor(serial);
		expect(tenth.promo?.amount).toBe(500);
		const [line] = tenth.lines;
		const after = repo.updateCustomerOrder(tenth.id, {
			details: cadet(serial),
			lines: [{ ...(line as PricedLine), quantity: 1 }],
		});
		expect(after.promo?.amount).toBe(500);
		expect(after.total).toBe(after.subtotal - 500);
		expect(
			pricing.withPromo(
				pricing.priceCart(
					[{ ...second, quantity: 1 }],
					catalog.listPublicProducts(),
				),
				{ id: "big", name: "Big", amount: 99_999 },
			).total,
		).toBe(0);
		expect(promos.countSerialOrders(serial)).toBe(10);
	});
});

describe("the 10th order promo's minimum order", () => {
	test("only orders over ₱500 (after sale prices) get it", async () => {
		const promos = await import("./order-promos-repo");
		const TODAY = "2026-11-08";
		const serial = "900010";
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 200 WHERE bouquet_id = $productId AND slug = $variantId",
			)
			.run(second);
		for (let i = 0; i < 9; i++)
			repo.createOrder({
				id: crypto.randomUUID(),
				details: { ...DETAILS, className: "1CL", serialNumber: serial },
				cart: pricing.priceCart(
					[{ ...second, quantity: 1 }],
					catalog.listPublicProducts(),
				),
				payment: { method: "cash", status: "on_hold" },
			});
		expect(
			promos.promoForNextOrder(
				serial,
				[{ productId: "x", lineTotal: 500 }],
				null,
				TODAY,
			),
		).toBeUndefined();
		expect(
			promos.promoForNextOrder(
				serial,
				[{ productId: "x", lineTotal: 499 }],
				null,
				TODAY,
			),
		).toBeUndefined();
		expect(
			promos.promoForNextOrder(
				serial,
				[{ productId: "x", lineTotal: 501 }],
				null,
				TODAY,
			)?.amount,
		).toBe(500);
		expect(
			promos.promoForNextOrder(
				serial,
				[{ productId: "x", lineTotal: 1300 }],
				null,
				TODAY,
			)?.amount,
		).toBe(500);
	});
});

describe("an order promo on chosen items", () => {
	test("needs those items, counts only them, and is capped at their cost", async () => {
		const promos = await import("./order-promos-repo");
		const TODAY = "2026-11-08";
		const corsages = promos.saveOrderPromo({
			name: "Corsage reward",
			every: 2,
			amount: 300,
			minSpend: 100,
			scope: "selected",
			arrangementTypes: ["corsage"],
			products: [],
			includeCustom: false,
			paymentMethods: [],
			repeat: true,
			startsOn: "2026-11-01",
			endsOn: "",
			enabled: true,
			terms: "",
		});
		const serial = "900020";
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 200 WHERE bouquet_id = $productId AND slug = $variantId",
			)
			.run(second);
		repo.createOrder({
			id: crypto.randomUUID(),
			details: { ...DETAILS, className: "1CL", serialNumber: serial },
			cart: pricing.priceCart(
				[{ ...second, quantity: 1 }],
				catalog.listPublicProducts(),
			),
			payment: { method: "cash", status: "on_hold" },
		});
		const bouquet = {
			productId: "rosie",
			arrangement: "bouquet",
			lineTotal: 2999,
		};
		const corsage = (lineTotal: number) => ({
			productId: "lily",
			arrangement: "corsage",
			lineTotal,
		});
		// The 2nd order, but no corsage in it: no reward.
		expect(
			promos.promoForNextOrder(serial, [bouquet], null, TODAY),
		).toBeUndefined();
		// Corsages under the minimum: no reward.
		expect(
			promos.promoForNextOrder(serial, [bouquet, corsage(90)], null, TODAY),
		).toBeUndefined();
		// Corsages over it: the reward, never more than they cost.
		expect(
			promos.promoForNextOrder(serial, [bouquet, corsage(250)], null, TODAY),
		).toEqual({ id: corsages.id, name: "Corsage reward", amount: 250 });
		promos.deleteOrderPromo(corsages.id);
	});
});

describe("discounts for some payment methods only", () => {
	const gcashSale = {
		id: "gcash-sale",
		name: "GCash Week",
		kind: "percent" as const,
		value: 10,
		pricing: "discount" as const,
		startsOn: "2000-01-01",
		endsOn: "2999-12-31",
		scope: "all" as const,
		arrangementTypes: [],
		products: [],
		includeCustom: false,
		paymentMethods: ["gcash" as const],
	};
	const priced = (method: "gcash" | "bank" | null) =>
		pricing.priceCart(
			[{ ...second, quantity: 1 }],
			catalog.listPublicProducts(),
			undefined,
			[gcashSale],
			method,
		);
	test("a GCash sale applies only when paying with GCash, and says so", () => {
		expect(priced(null).total).toBe(1300);
		expect(priced("bank").total).toBe(1300);
		expect(priced("gcash").total).toBe(1170);
		expect(priced("gcash").lines[0]?.sale?.paymentMethods).toEqual(["gcash"]);
	});
	test("a promo for GCash only needs GCash", async () => {
		const promos = await import("./order-promos-repo");
		const TODAY = "2026-11-08";
		const gcashPromo = promos.saveOrderPromo({
			name: "GCash reward",
			every: 2,
			amount: 200,
			minSpend: 0,
			scope: "all",
			arrangementTypes: [],
			products: [],
			includeCustom: false,
			paymentMethods: ["gcash"],
			repeat: true,
			startsOn: "2026-11-01",
			endsOn: "",
			enabled: true,
			terms: "",
		});
		const serial = "900030";
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 200 WHERE bouquet_id = $productId AND slug = $variantId",
			)
			.run(second);
		repo.createOrder({
			id: crypto.randomUUID(),
			details: { ...DETAILS, className: "1CL", serialNumber: serial },
			cart: priced(null),
			payment: { method: "cash", status: "on_hold" },
		});
		const lines = [{ productId: "x", lineTotal: 1300 }];
		expect(
			promos.promoForNextOrder(serial, lines, "bank", TODAY),
		).toBeUndefined();
		expect(promos.promoForNextOrder(serial, lines, "gcash", TODAY)).toEqual({
			id: gcashPromo.id,
			name: "GCash reward",
			amount: 200,
			paymentMethods: ["gcash"],
		});
		promos.deleteOrderPromo(gcashPromo.id);
	});
});

describe("the delivery date", () => {
	test("is kept on the order, and through the customer's edits", () => {
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 200 WHERE bouquet_id = $productId AND slug = $variantId",
			)
			.run(second);
		const order = repo.createOrder({
			id: crypto.randomUUID(),
			details: { ...DETAILS, deliveryDate: "2026-12-24" },
			cart: pricing.priceCart(
				[{ ...second, quantity: 2 }],
				catalog.listPublicProducts(),
			),
			payment: { method: "gcash", status: "on_hold" },
		});
		expect(order.details.deliveryDate).toBe("2026-12-24");
		const [line] = order.lines;
		const after = repo.updateCustomerOrder(order.id, {
			details: { ...DETAILS, deliveryDate: "2026-12-24" },
			lines: [{ ...(line as PricedLine), quantity: 1 }],
		});
		expect(after.details.deliveryDate).toBe("2026-12-24");
		expect(place([{ ...second, quantity: 1 }]).details.deliveryDate).toBe("");
	});
});

describe("staff notes", () => {
	test("add, read in order, count, edit and delete", async () => {
		const notes = await import("./order-notes-repo");
		const order = place([{ ...second, quantity: 1 }]);
		const other = place([{ ...second, quantity: 1 }]);
		const ana = { id: "u-ana", name: "Ana" };
		const first = notes.addOrderNote(order.id, "Pink ribbon, please.", ana);
		notes.addOrderNote(order.id, "Called the customer.", {
			id: "u-ben",
			name: "Ben",
		});
		expect(notes.listOrderNotes(order.id).map((n) => n.body)).toEqual([
			"Pink ribbon, please.",
			"Called the customer.",
		]);
		expect(notes.countOrderNotes([order.id, other.id])).toEqual({
			[order.id]: 2,
		});
		const edited = notes.editOrderNote(first.id, "Pink ribbon and a bow.");
		expect(edited?.body).toBe("Pink ribbon and a bow.");
		expect(edited?.editedAt).toBeTruthy();
		notes.deleteOrderNote(first.id);
		expect(notes.listOrderNotes(order.id)).toHaveLength(1);
		// Customers never get them: they aren't part of the order.
		expect(
			JSON.stringify(
				repo.toCustomerOrder(repo.getOrderById(order.id) as Order),
			),
		).not.toContain("Called the customer");
	});
});

describe("staff recording a reference number", () => {
	let logRepo: typeof import("./order-log-repo");
	let payment: typeof import("~/lib/payment");
	beforeAll(async () => {
		logRepo = await import("./order-log-repo");
		payment = await import("~/lib/payment");
		// Earlier tests use up the stock; these only need orders to exist.
		db.getDb()
			.query(
				"UPDATE bouquet_styles SET stock_quantity = 50 WHERE bouquet_id = $p AND slug = $v",
			)
			.run({ p: first.productId, v: first.variantId });
	});

	test("an unpaid order waits for staff to check it, and it's logged", () => {
		const order = place([{ ...first, quantity: 1 }]);
		const saved = repo.setReferenceNumber(order.id, "1012345678901");
		expect(saved.payment.referenceNumber).toBe("1012345678901");
		expect(saved.payment.status).toBe("pending");
		const logged = logRepo
			.listOrderLog({ orderId: order.id })
			.entries.filter((e) => e.action === "payment_reference");
		expect(logged).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: "reference_number",
					to: "1012345678901",
				}),
			]),
		);
	});

	test("works once the order is being made, without undoing a verified payment", () => {
		const order = place([{ ...first, quantity: 1 }]);
		repo.reviewPayment(order.id, "verified", "Staff");
		repo.setOrderStage(order.id, "making");
		const saved = repo.setReferenceNumber(order.id, "ABC123456");
		expect(saved.stage).toBe("making");
		expect(saved.payment.status).toBe("verified");
		expect(saved.payment.referenceNumber).toBe("ABC123456");
	});

	test("can be fixed or removed", () => {
		const order = place([{ ...first, quantity: 1 }]);
		repo.setReferenceNumber(order.id, "1111111111");
		expect(
			repo.setReferenceNumber(order.id, "2222222222").payment.referenceNumber,
		).toBe("2222222222");
		expect(
			repo.setReferenceNumber(order.id, undefined).payment.referenceNumber,
		).toBeUndefined();
	});

	test("refused for a cancelled order", () => {
		const order = place([{ ...first, quantity: 1 }]);
		repo.cancelOrder(order.id, { reason: "Test", cancelledBy: "Staff" });
		expect(() => repo.setReferenceNumber(order.id, "1234567890")).toThrow();
	});

	test("checks the number, but allows none", () => {
		expect(payment.validateStaffReferenceNumber("")).toBeUndefined();
		expect(
			payment.validateStaffReferenceNumber("1012 345-678901"),
		).toBeUndefined();
		expect(payment.validateStaffReferenceNumber("12")).toBeDefined();
		expect(payment.validateStaffReferenceNumber("12#45678")).toBeDefined();
	});
});

describe("florists", () => {
	let florists: typeof import("./florists-repo");
	let logRepo: typeof import("./order-log-repo");
	let work: typeof import("./florist-work");
	const staff = {
		type: "staff" as const,
		name: "Owner",
		source: "/admin/orders",
	};
	let ana = "";
	let ben = "";
	beforeAll(async () => {
		florists = await import("./florists-repo");
		logRepo = await import("./order-log-repo");
		work = await import("./florist-work");
		const base = { phone: "", email: "", notes: "", active: true };
		ana = florists.saveFlorist(null, { ...base, name: "Ana Florist" });
		ben = florists.saveFlorist(null, { ...base, name: "Ben Florist" });
	});
	const ref = (orderId: string, unit: number) => ({
		orderId,
		lineKey: key(first),
		unit,
	});

	test("gives one bouquet of several, and logs it by name", () => {
		const order = place([{ ...first, quantity: 3 }]);
		const result = repo.assignFlorist([ref(order.id, 1)], ana, staff);
		expect(result).toEqual({ changed: 1, skipped: 0 });
		const after = repo.getOrderById(order.id) as Order;
		expect(line(after, first).florists).toEqual(["", ana, ""]);
		const entry = logRepo
			.listOrderLog({ orderId: order.id })
			.entries.find((e) => e.action === "florist");
		expect(entry).toEqual(
			expect.objectContaining({
				field: "florist",
				from: "",
				to: "Ana Florist",
				actor: expect.objectContaining({ name: "Owner" }),
			}),
		);
		expect(entry?.about).toContain("(2 of 3)");
	});
	test("giving the same florist again changes and logs nothing", () => {
		const order = place([{ ...first, quantity: 1 }]);
		repo.assignFlorist([ref(order.id, 0)], ana, staff);
		const count = () =>
			logRepo
				.listOrderLog({ orderId: order.id })
				.entries.filter((e) => e.action === "florist").length;
		expect(count()).toBe(1);
		expect(repo.assignFlorist([ref(order.id, 0)], ana, staff).changed).toBe(0);
		expect(count()).toBe(1);
	});
	test("taking every bouquet off leaves the line as if never assigned", () => {
		const order = place([{ ...first, quantity: 2 }]);
		repo.assignFlorist([ref(order.id, 0), ref(order.id, 1)], ben, staff);
		repo.assignFlorist([ref(order.id, 0), ref(order.id, 1)], "", staff);
		const after = repo.getOrderById(order.id) as Order;
		expect(line(after, first).florists).toBeUndefined();
	});
	test("skips cancelled orders and bouquets no longer on the order", () => {
		const live = place([{ ...first, quantity: 1 }]);
		const gone = place([{ ...first, quantity: 1 }]);
		repo.cancelOrder(gone.id, { reason: "x", cancelledBy: "Owner" });
		const result = repo.assignFlorist(
			[ref(live.id, 0), ref(live.id, 5), ref(gone.id, 0)],
			ana,
			staff,
		);
		expect(result).toEqual({ changed: 1, skipped: 2 });
	});
	test("cancelling one bouquet takes its florist with it", () => {
		const order = place([{ ...first, quantity: 3 }]);
		repo.assignFlorist(
			[ref(order.id, 0), ref(order.id, 1), ref(order.id, 2)],
			ana,
			staff,
		);
		repo.assignFlorist([ref(order.id, 1)], ben, staff);
		const after = repo.cancelBouquet(order.id, {
			lineKey: key(first),
			unit: 1,
			reason: "x",
			cancelledBy: "Owner",
		});
		expect(line(after, first).florists).toEqual([ana, ana]);
	});
	test("a customer's edit keeps the florists of bouquets still ordered", () => {
		const order = place([{ ...first, quantity: 2 }]);
		repo.assignFlorist([ref(order.id, 0), ref(order.id, 1)], ben, staff);
		const current = repo.getOrderById(order.id) as Order;
		const cart = pricing.priceCart(
			[{ ...first, quantity: 1 }],
			catalog.listPublicProducts(),
		);
		const after = repo.updateCustomerOrder(order.id, {
			details: current.details,
			lines: cart.lines,
		});
		expect(line(after, first).florists).toEqual([ben]);
	});
	test("a florist's sheet lists their bouquets still to make, nothing else", () => {
		const mine = place([{ ...first, quantity: 2 }]);
		repo.assignFlorist([ref(mine.id, 1)], ben, staff);
		const florist = florists.getFlorist(ben);
		if (!florist) throw new Error("missing florist");
		const sheet = work.floristWork(florist, {
			includeDone: false,
			forStaff: false,
		});
		const found = sheet.bouquets.filter((b) => b.orderNumber === mine.number);
		expect(found).toHaveLength(1);
		expect(found[0]).toEqual(expect.objectContaining({ unit: 1, quantity: 2 }));
		// Their own link never carries order ids or anyone else's bouquets.
		expect(found[0]?.orderId).toBeUndefined();
		expect(JSON.stringify(sheet)).not.toContain("shopper@example.com");
	});
	test("private link: a new one replaces the old, off finds nothing", () => {
		const first = florists.setFloristLink(ana, true) as string;
		expect(florists.getFloristByToken(first)?.id).toBe(ana);
		const second = florists.setFloristLink(ana, true) as string;
		expect(second).not.toBe(first);
		expect(florists.getFloristByToken(first)).toBeNull();
		florists.setFloristLink(ana, false);
		expect(florists.getFloristByToken(second)).toBeNull();
		expect(florists.getFloristByToken("")).toBeNull();
	});
});

describe("open orders follow their arrangement's flowers", () => {
	let logRepo: typeof import("./order-log-repo");
	beforeAll(async () => {
		logRepo = await import("./order-log-repo");
	});
	const recipe = [
		{ flower: "Roses", color: "Red", count: 7 },
		{ flower: "Misty", color: "Violet", count: 1, filler: true },
	];
	const staff = { type: "staff" as const, name: "Owner" };

	test("open orders take the new flowers and log it; done and cancelled keep theirs", () => {
		const open = place([{ ...first, quantity: 2 }]);
		const done = place([{ ...first, quantity: 1 }]);
		const gone = place([{ ...first, quantity: 1 }]);
		setRow(done.id, "stage = 'done'", {});
		repo.cancelOrder(gone.id, { reason: "x", cancelledBy: "Owner" });
		const result = repo.syncOrderRecipes(
			new Map([[key(first), recipe]]),
			staff,
		);
		expect(result.orders).toBeGreaterThanOrEqual(1);
		const after = repo.getOrderById(open.id) as Order;
		expect(line(after, first).recipe).toEqual(recipe);
		expect(line(repo.getOrderById(done.id) as Order, first).recipe).toEqual(
			line(done, first).recipe,
		);
		expect(line(repo.getOrderById(gone.id) as Order, first).recipe).toEqual(
			line(gone, first).recipe,
		);
		const entry = logRepo
			.listOrderLog({ orderId: open.id })
			.entries.find((e) => e.action === "recipe_sync");
		expect(entry).toEqual(
			expect.objectContaining({
				field: "recipe",
				to: "7 × Roses · Red, 1 × Misty · Violet (filler)",
			}),
		);
	});
	test("running it again changes nothing", () => {
		const again = repo.syncOrderRecipes(new Map([[key(first), recipe]]), staff);
		expect(again).toEqual({ orders: 0, bouquets: 0 });
	});
	test("other styles and empty recipes are left alone", () => {
		const order = place([{ ...second, quantity: 1 }]);
		const before = line(order, second).recipe;
		repo.syncOrderRecipes(
			new Map([
				[key(first), recipe],
				[key(second), []],
			]),
			staff,
		);
		expect(line(repo.getOrderById(order.id) as Order, second).recipe).toEqual(
			before,
		);
	});
});
