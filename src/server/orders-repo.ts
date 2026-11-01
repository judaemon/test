import type { CheckoutDetails } from "~/lib/checkout";
import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import type { CardBrand, PaymentMethod } from "~/lib/payment";
import type { PricedCart, PricedLine } from "~/lib/pricing";
import { lineName } from "~/lib/product";
import {
	type CustomerOrder,
	isPaymentDue,
	isPaymentSettled,
	type Order,
	type OrderEvent,
	type OrderPayment,
	type OrderStage,
	type PaymentStatus,
} from "~/types/order";
import { fromCents, getDb, nowIso, toCents } from "./db";
import { adjustFlowerStock } from "./flowers-repo";
import { adjustWrapperStock } from "./wrappers-repo";

interface OrderRow {
	id: string;
	number: string;
	created_at: string;
	stage: OrderStage;
	stage_updated_at: string;
	email: string;
	first_name: string;
	last_name: string;
	full_name: string;
	company: string;
	class_name: string;
	notes: string;
	dedication_for: string;
	/** The dedication message (the card message on older orders). */
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
	cancel_reason: string | null;
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
			firstName: row.first_name,
			lastName: row.last_name,
			fullName: row.full_name,
			company: row.company,
			className: row.class_name,
			email: row.email,
			notes: row.notes,
			addDedication: !!(row.dedication_for || row.gift_message),
			dedicationFor: row.dedication_for,
			dedicationMessage: row.gift_message,
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
		cancelReason: row.cancel_reason ?? undefined,
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
 * Inserts the order, checking each bouquet style is still available and
 * taking custom bouquets' flowers and wrappers out of stock, atomically.
 */
export function createOrder(order: NewOrder): Order {
	const db = getDb();
	const isAvailable = db.query(
		`SELECT 1 FROM bouquet_styles
		 WHERE bouquet_id = $productId AND slug = $variantId AND is_available = 1`,
	);
	db.transaction(() => {
		for (const line of order.cart.lines) {
			// Built bouquets are checked against flower and wrapper stock below.
			if (line.productId === CUSTOM_PRODUCT_ID) continue;
			const available = isAvailable.get({
				productId: line.productId,
				variantId: line.variantId,
			});
			if (!available) {
				throw new OrderRuleError(
					`${lineName(line)} isn’t available right now. Remove it from your bag to continue.`,
				);
			}
		}
		const outOfWrapper = adjustWrapperStock(order.cart.lines, -1);
		if (outOfWrapper)
			throw new OrderRuleError(
				`There aren’t enough ${outOfWrapper} wrappers left. Edit your custom bouquet to pick another, or lower the quantity.`,
			);
		const outOfFlower = adjustFlowerStock(order.cart.lines, -1);
		if (outOfFlower)
			throw new OrderRuleError(
				`There aren’t enough ${outOfFlower} left. Edit your custom bouquet to choose fewer, or lower the quantity.`,
			);
		const now = nowIso();
		// Orders are numbered #1, #2, … in the order they were placed. Inside the
		// transaction, so two checkouts can never take the same number.
		const { nextNumber } = db
			.query(
				"SELECT COALESCE(MAX(CAST(number AS INTEGER)), 0) + 1 AS nextNumber FROM orders",
			)
			.get() as { nextNumber: number };
		// The v1 address and delivery columns are NOT NULL, so new orders fill them with ''.
		db.query(
			`INSERT INTO orders (id, number, created_at, stage, stage_updated_at, email, phone, recipient_name,
			   address, city, postal_code, delivery_date, delivery_slot, first_name, last_name, full_name, company, class_name, notes,
			   dedication_for, gift_message, lines, subtotal_cents, delivery_fee_cents, total_cents, currency,
			   payment_method, payment_status, reference_number, proof_file, card_brand, card_last4, customer_id)
			 VALUES ($id, $number, $now, 'new', $now, $email, '', $fullName, '', '', '', '', '', $firstName, $lastName, $fullName,
			   $company, $className, $notes, $dedicationFor, $dedicationMessage, $lines, $subtotal,
			   $deliveryFee, $total, $currency, $method, $status, $reference, $proof, $cardBrand, $cardLast4,
			   $customerId)`,
		).run({
			id: order.id,
			number: String(nextNumber),
			now,
			firstName: order.details.firstName,
			lastName: order.details.lastName,
			fullName: order.details.fullName,
			company: order.details.company,
			className: order.details.className,
			email: order.details.email,
			notes: order.details.notes,
			dedicationFor: order.details.dedicationFor,
			dedicationMessage: order.details.dedicationMessage,
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

export function getOrderByNumber(number: string): Order | undefined {
	const row = getDb()
		.query("SELECT * FROM orders WHERE number = $number")
		.get({ number }) as OrderRow | null;
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
	/** Exact shop-local date the order was placed. */
	date?: string;
	/** Placed on or after this shop-local date. */
	fromDate?: string;
	stages?: OrderStage[];
	needsVerification?: boolean;
	onHold?: boolean;
	search?: string;
	limit?: number;
}

/** Shop-local (Asia/Manila, UTC+8 with no DST) date an order was placed. */
const PLACED_DAY = "date(created_at, '+8 hours')";

/** Newest first. */
export function listOrders(filter: OrderFilter = {}): Order[] {
	const where: string[] = [];
	const params: Record<string, string | number> = {};
	if (filter.date) {
		where.push(`${PLACED_DAY} = $date`);
		params.date = filter.date;
	}
	if (filter.fromDate) {
		where.push(`${PLACED_DAY} >= $fromDate`);
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
	if (filter.onHold) {
		where.push("payment_status = 'on_hold' AND stage != 'cancelled'");
	}
	if (filter.search) {
		where.push(
			`(number LIKE $q OR full_name LIKE $q OR company LIKE $q OR class_name LIKE $q
			  OR dedication_for LIKE $q OR reference_number LIKE $q)`,
		);
		params.q = `%${filter.search.replace(/[%_]/g, "")}%`;
	}
	params.limit = filter.limit ?? 500;
	const rows = getDb()
		.query(
			`SELECT * FROM orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY created_at DESC LIMIT $limit`,
		)
		.all(params) as OrderRow[];
	return toOrders(rows);
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
			// Signature bouquets have no stock count; custom ones give back theirs.
			adjustWrapperStock(order.lines, 1);
			adjustFlowerStock(order.lines, 1);
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

/**
 * The shopper sends the payment for an order that's on hold or wasn't matched,
 * which puts it back in front of staff. Signing in links a guest order.
 */
export function submitPayment(
	id: string,
	payment: {
		method: PaymentMethod;
		referenceNumber: string;
		customerId?: string;
	},
): Order {
	const order = getOrderById(id);
	if (!order) throw new OrderRuleError("Order not found.");
	if (order.stage !== "new" || !isPaymentDue(order.payment.status))
		throw new OrderRuleError("This order doesn’t need a payment right now.");
	getDb()
		.query(
			`UPDATE orders SET payment_method = $method, payment_status = 'pending',
			   reference_number = $reference, payment_reviewed_by = NULL, payment_reviewed_at = NULL,
			   customer_id = COALESCE(customer_id, $customerId)
			 WHERE id = $id`,
		)
		.run({
			id,
			method: payment.method,
			reference: payment.referenceNumber,
			customerId: payment.customerId ?? null,
		});
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
	if (order.stage !== "done")
		throw new OrderRuleError("Add the delivery photo once the order is done.");
	getDb()
		.query("UPDATE orders SET delivery_photo = $file WHERE id = $id")
		.run({ id, file: fileName });
	return {
		order: getOrderById(id) as Order,
		replaced: order.delivery.photoFile,
	};
}
