import { type CheckoutDetails, DELIVERY_SLOTS } from "~/lib/checkout";
import type { CardBrand, PaymentMethod } from "~/lib/payment";
import type { PricedCart, PricedLine } from "~/lib/pricing";
import {
	type CustomerOrder,
	isPaymentSettled,
	type Order,
	type OrderEvent,
	type OrderPayment,
	type OrderStage,
	type PaymentStatus,
} from "~/types/order";
import { fromCents, getDb, nowIso, toCents } from "./db";

interface OrderRow {
	id: string;
	number: string;
	created_at: string;
	stage: OrderStage;
	stage_updated_at: string;
	email: string;
	phone: string;
	recipient_name: string;
	address: string;
	city: string;
	postal_code: string;
	delivery_date: string;
	delivery_slot: string;
	gift_message: string;
	lines: string;
	subtotal_cents: number;
	delivery_fee_cents: number;
	total_cents: number;
	currency: string;
	payment_method: PaymentMethod;
	payment_status: PaymentStatus;
	reference_number: string | null;
	proof_file: string | null;
	card_brand: CardBrand | null;
	card_last4: string | null;
	payment_reviewed_by: string | null;
	payment_reviewed_at: string | null;
	customer_id: string | null;
	rider_name: string | null;
	rider_phone: string | null;
	delivery_photo: string | null;
	delivered_at: string | null;
}

function loadEvents(ids: string[]): Map<string, OrderEvent[]> {
	const events = new Map<string, OrderEvent[]>(ids.map((id) => [id, []]));
	if (ids.length === 0) return events;
	const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
	const rows = getDb()
		.query(
			`SELECT order_id, stage, at FROM order_events
			 WHERE order_id IN (${ids.map((_, i) => `$id${i}`).join(", ")}) ORDER BY at`,
		)
		.all(params) as Array<{ order_id: string; stage: OrderStage; at: string }>;
	for (const row of rows) {
		events.get(row.order_id)?.push({ stage: row.stage, at: row.at });
	}
	return events;
}

function toOrders(rows: OrderRow[]): Order[] {
	const events = loadEvents(rows.map((row) => row.id));
	return rows.map((row) => toOrder(row, events.get(row.id) ?? []));
}

function toOrder(row: OrderRow, events: OrderEvent[]): Order {
	const lines = JSON.parse(row.lines) as PricedLine[];
	return {
		id: row.id,
		number: row.number,
		createdAt: row.created_at,
		stage: row.stage,
		stageUpdatedAt: row.stage_updated_at,
		details: {
			email: row.email,
			phone: row.phone,
			recipientName: row.recipient_name,
			address: row.address,
			city: row.city,
			postalCode: row.postal_code,
			deliveryDate: row.delivery_date,
			deliverySlot: row.delivery_slot,
			giftMessage: row.gift_message,
		},
		lines,
		subtotal: fromCents(row.subtotal_cents),
		deliveryFee: fromCents(row.delivery_fee_cents),
		total: fromCents(row.total_cents),
		currency: row.currency,
		itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
		payment: {
			method: row.payment_method,
			status: row.payment_status,
			referenceNumber: row.reference_number ?? undefined,
			proofFile: row.proof_file ?? undefined,
			cardBrand: row.card_brand ?? undefined,
			cardLast4: row.card_last4 ?? undefined,
			reviewedBy: row.payment_reviewed_by ?? undefined,
			reviewedAt: row.payment_reviewed_at ?? undefined,
		},
		customerId: row.customer_id ?? undefined,
		delivery: {
			riderName: row.rider_name ?? undefined,
			riderPhone: row.rider_phone ?? undefined,
			photoFile: row.delivery_photo ?? undefined,
			deliveredAt: row.delivered_at ?? undefined,
		},
		events,
	};
}

/** Strips staff-only details before an order goes to its customer. */
export function toCustomerOrder(order: Order): CustomerOrder {
	const {
		customerId: _customer,
		payment: { proofFile: _proof, reviewedBy: _reviewer, ...payment },
		delivery: { photoFile, ...delivery },
		...rest
	} = order;
	return { ...rest, payment, delivery: { ...delivery, hasPhoto: !!photoFile } };
}

function addEvent(id: string, stage: OrderStage, at = nowIso()) {
	getDb()
		.query(
			"INSERT INTO order_events (order_id, stage, at) VALUES ($id, $stage, $at)",
		)
		.run({ id, stage, at });
}

/** A clear, user-facing reason an order action can't happen. */
export class OrderRuleError extends Error {}

export interface NewOrder {
	id: string;
	details: CheckoutDetails;
	cart: PricedCart;
	payment: Omit<OrderPayment, "reviewedBy" | "reviewedAt">;
	/** The signed-in customer placing the order, if any. */
	customerId?: string;
}

/**
 * Inserts the order and takes its units out of stock atomically, so two
 * shoppers can never both buy the last bouquet.
 */
export function createOrder(order: NewOrder): Order {
	const db = getDb();
	const takeStock = db.query(
		`UPDATE variants SET stock_quantity = stock_quantity - $quantity
		 WHERE product_id = $productId AND id = $variantId
		   AND is_available = 1 AND stock_quantity >= $quantity`,
	);
	db.transaction(() => {
		for (const line of order.cart.lines) {
			const result = takeStock.run({
				quantity: line.quantity,
				productId: line.productId,
				variantId: line.variantId,
			});
			if (result.changes === 0) {
				throw new OrderRuleError(
					`${line.colorName} just sold out. Remove it from your bag to continue.`,
				);
			}
		}
		const now = nowIso();
		db.query(
			`INSERT INTO orders (id, number, created_at, stage, stage_updated_at, email, phone, recipient_name,
			   address, city, postal_code, delivery_date, delivery_slot, gift_message, lines, subtotal_cents,
			   delivery_fee_cents, total_cents, currency, payment_method, payment_status, reference_number,
			   proof_file, card_brand, card_last4, customer_id)
			 VALUES ($id, $number, $now, 'new', $now, $email, $phone, $recipientName, $address, $city,
			   $postalCode, $deliveryDate, $deliverySlot, $giftMessage, $lines, $subtotal, $deliveryFee,
			   $total, $currency, $method, $status, $reference, $proof, $cardBrand, $cardLast4, $customerId)`,
		).run({
			id: order.id,
			number: order.id.slice(0, 8).toUpperCase(),
			now,
			...order.details,
			lines: JSON.stringify(order.cart.lines),
			subtotal: toCents(order.cart.subtotal),
			deliveryFee: toCents(order.cart.deliveryFee),
			total: toCents(order.cart.total),
			currency: order.cart.currency,
			method: order.payment.method,
			status: order.payment.status,
			reference: order.payment.referenceNumber ?? null,
			proof: order.payment.proofFile ?? null,
			cardBrand: order.payment.cardBrand ?? null,
			cardLast4: order.payment.cardLast4 ?? null,
			customerId: order.customerId ?? null,
		});
		addEvent(order.id, "new", now);
	})();
	return getOrderById(order.id) as Order;
}

export function getOrderById(id: string): Order | undefined {
	const row = getDb()
		.query("SELECT * FROM orders WHERE id = $id")
		.get({ id }) as OrderRow | null;
	return row ? toOrders([row])[0] : undefined;
}

/** Everything a customer has ordered while signed in, newest first. */
export function listCustomerOrders(customerId: string): Order[] {
	const rows = getDb()
		.query(
			"SELECT * FROM orders WHERE customer_id = $customerId ORDER BY created_at DESC LIMIT 200",
		)
		.all({ customerId }) as OrderRow[];
	return toOrders(rows);
}

export interface OrderFilter {
	/** Exact shop-local delivery date. */
	date?: string;
	/** Delivery date on or after. */
	fromDate?: string;
	stages?: OrderStage[];
	needsVerification?: boolean;
	search?: string;
	limit?: number;
}

const slotOrder = new Map(
	DELIVERY_SLOTS.map((slot, index) => [slot.id, index]),
);

export function listOrders(filter: OrderFilter = {}): Order[] {
	const where: string[] = [];
	const params: Record<string, string | number> = {};
	if (filter.date) {
		where.push("delivery_date = $date");
		params.date = filter.date;
	}
	if (filter.fromDate) {
		where.push("delivery_date >= $fromDate");
		params.fromDate = filter.fromDate;
	}
	if (filter.stages?.length) {
		const keys = filter.stages.map((stage, i) => {
			params[`stage${i}`] = stage;
			return `$stage${i}`;
		});
		where.push(`stage IN (${keys.join(", ")})`);
	}
	if (filter.needsVerification) {
		where.push("payment_status = 'pending' AND stage != 'cancelled'");
	}
	if (filter.search) {
		where.push(
			`(number LIKE $q OR recipient_name LIKE $q OR email LIKE $q OR phone LIKE $q OR reference_number LIKE $q)`,
		);
		params.q = `%${filter.search.replace(/[%_]/g, "")}%`;
	}
	params.limit = filter.limit ?? 500;
	const rows = getDb()
		.query(
			`SELECT * FROM orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY delivery_date, created_at LIMIT $limit`,
		)
		.all(params) as OrderRow[];
	// Soonest departure first: by date, then slot, then when it was placed.
	return toOrders(rows).sort(
		(a, b) =>
			a.details.deliveryDate.localeCompare(b.details.deliveryDate) ||
			(slotOrder.get(a.details.deliverySlot) ?? 0) -
				(slotOrder.get(b.details.deliverySlot) ?? 0) ||
			a.createdAt.localeCompare(b.createdAt),
	);
}

/**
 * Moves an order through the workflow. Unpaid QR orders stay in "New" until
 * their payment is verified, and cancelling puts the bouquets back in stock.
 */
export function setOrderStage(id: string, stage: OrderStage): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		if (order.stage === stage) return;
		if (order.stage === "cancelled")
			throw new OrderRuleError("Cancelled orders can’t be moved.");
		if (stage !== "new" && stage !== "cancelled") {
			if (!isPaymentSettled(order.payment.status)) {
				throw new OrderRuleError(
					order.payment.status === "rejected"
						? "This payment was rejected. Sort it out with the customer, then verify it."
						: "Verify the payment first.",
				);
			}
		}
		if (stage === "cancelled") {
			const restock = db.query(
				`UPDATE variants SET stock_quantity = stock_quantity + $quantity
				 WHERE product_id = $productId AND id = $variantId`,
			);
			for (const line of order.lines) {
				restock.run({
					quantity: line.quantity,
					productId: line.productId,
					variantId: line.variantId,
				});
			}
		}
		const now = nowIso();
		db.query(
			`UPDATE orders SET stage = $stage, stage_updated_at = $now,
			   delivered_at = CASE WHEN $stage = 'done' THEN $now ELSE NULL END
			 WHERE id = $id`,
		).run({ id, stage, now });
		addEvent(id, stage, now);
	})();
	return getOrderById(id) as Order;
}

export function reviewPayment(
	id: string,
	decision: "verified" | "rejected",
	reviewer: string,
): Order {
	const order = getOrderById(id);
	if (!order) throw new OrderRuleError("Order not found.");
	if (order.payment.method === "card")
		throw new OrderRuleError("Card payments don’t need review.");
	if (order.stage === "cancelled")
		throw new OrderRuleError("This order was cancelled.");
	if (decision === "rejected" && order.stage !== "new")
		throw new OrderRuleError(
			"This order is already being made. Move it back to New first.",
		);
	getDb()
		.query(
			`UPDATE orders SET payment_status = $status, payment_reviewed_by = $reviewer,
			 payment_reviewed_at = $now WHERE id = $id`,
		)
		.run({ id, status: decision, reviewer, now: nowIso() });
	return getOrderById(id) as Order;
}

export function setRider(
	id: string,
	rider: { name: string; phone: string },
): Order {
	const result = getDb()
		.query(
			"UPDATE orders SET rider_name = $name, rider_phone = $phone WHERE id = $id",
		)
		.run({ id, name: rider.name || null, phone: rider.phone || null });
	if (result.changes === 0) throw new OrderRuleError("Order not found.");
	return getOrderById(id) as Order;
}

/** Records the proof-of-delivery photo; returns the file it replaced, if any. */
export function setDeliveryPhoto(id: string, fileName: string) {
	const order = getOrderById(id);
	if (!order) throw new OrderRuleError("Order not found.");
	if (order.stage !== "delivering" && order.stage !== "done")
		throw new OrderRuleError(
			"Add the delivery photo once the order is out for delivery.",
		);
	getDb()
		.query("UPDATE orders SET delivery_photo = $file WHERE id = $id")
		.run({ id, file: fileName });
	return {
		order: getOrderById(id) as Order,
		replaced: order.delivery.photoFile,
	};
}
