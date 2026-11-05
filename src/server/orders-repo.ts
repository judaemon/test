import { hasContent, lineKey } from "~/lib/bouquet-messages";
import type { CheckoutDetails } from "~/lib/checkout";
import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import {
	ORDER_EDIT_HOURS,
	ORDER_EDIT_LOCKED,
	orderEditState,
} from "~/lib/order-edit";
import {
	type CardBrand,
	normalizeReferenceNumber,
	type PaymentMethod,
} from "~/lib/payment";
import type { PricedCart, PricedLine } from "~/lib/pricing";
import { lineName } from "~/lib/product";
import {
	type BoardStage,
	type CancelledBouquet,
	type CustomerOrder,
	canStartMaking,
	isPaymentDue,
	isPaymentSettled,
	type Order,
	type OrderEvent,
	type OrderPayment,
	type OrderStage,
	type PaymentStatus,
	type WrapperStatus,
} from "~/types/order";
import { adjustStyleStock } from "./catalog-repo";
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
	serial_number: string;
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
	cancelled_by: string | null;
	cancel_proof: string | null;
	customer_edited_at: string | null;
	cancelled_bouquets: string;
	is_test: number;
	amount_paid_cents: number | null;
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
			serialNumber: row.serial_number,
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
			...(row.amount_paid_cents === null
				? {}
				: { amountPaid: fromCents(row.amount_paid_cents) }),
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
		cancelledBy: row.cancelled_by ?? undefined,
		cancelProof: row.cancel_proof ?? undefined,
		customerEditedAt: row.customer_edited_at ?? undefined,
		cancelledBouquets: JSON.parse(row.cancelled_bouquets) as CancelledBouquet[],
		isTest: row.is_test === 1,
	};
}

/** Strips staff-only details before an order goes to its customer. */
export function toCustomerOrder(order: Order): CustomerOrder {
	const {
		customerId: _customer,
		isTest: _isTest,
		payment: { proofFile: _proof, reviewedBy: _reviewer, ...payment },
		delivery: { photoFile, ...delivery },
		cancelledBy: _cancelledBy,
		cancelProof: _cancelProof,
		cancelledBouquets,
		...rest
	} = order;
	return {
		...rest,
		cancelledBouquets: cancelledBouquets.map(
			({ cancelledBy: _by, proofFile: _file, ...bouquet }) => bouquet,
		),
		payment,
		delivery: { ...delivery, hasPhoto: !!photoFile },
	};
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
		const outOfStyle = adjustStyleStock(order.cart.lines, -1);
		if (outOfStyle)
			throw new OrderRuleError(
				`There aren’t enough ${lineName(outOfStyle)} left. Lower the quantity to continue.`,
			);
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
			   address, city, postal_code, delivery_date, delivery_slot, first_name, last_name, full_name, company, serial_number, class_name, notes,
			   dedication_for, gift_message, lines, subtotal_cents, delivery_fee_cents, total_cents, currency,
			   payment_method, payment_status, reference_number, proof_file, card_brand, card_last4, customer_id,
			   amount_paid_cents)
			 VALUES ($id, $number, $now, 'new', $now, $email, '', $fullName, '', '', '', '', '', $firstName, $lastName, $fullName,
			   $company, $serialNumber, $className, $notes, $dedicationFor, $dedicationMessage, $lines, $subtotal,
			   $deliveryFee, $total, $currency, $method, $status, $reference, $proof, $cardBrand, $cardLast4,
			   $customerId, $amountPaid)`,
		).run({
			id: order.id,
			number: String(nextNumber),
			now,
			firstName: order.details.firstName,
			lastName: order.details.lastName,
			fullName: order.details.fullName,
			company: order.details.company,
			serialNumber: order.details.serialNumber,
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
			amountPaid:
				order.payment.amountPaid === undefined
					? null
					: toCents(order.payment.amountPaid),
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

/**
 * Marks an order as a test or a real order. A test order holds no flowers or
 * wrappers, so its stock goes back, and is taken again if it's unmarked.
 * Cancelled orders have already given theirs back.
 */
export function setOrderTest(id: string, isTest: boolean): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		if (order.isTest === isTest) return;
		if (order.stage !== "cancelled") {
			const direction = isTest ? 1 : -1;
			const outOfStyle = adjustStyleStock(order.lines, direction);
			const short =
				(outOfStyle && lineName(outOfStyle)) ??
				adjustWrapperStock(order.lines, direction) ??
				adjustFlowerStock(order.lines, direction);
			if (short)
				throw new OrderRuleError(
					`There isn’t enough ${short} in stock to make this a real order.`,
				);
		}
		db.query("UPDATE orders SET is_test = $isTest WHERE id = $id").run({
			id,
			isTest: isTest ? 1 : 0,
		});
	})();
	return getOrderById(id) as Order;
}

/** Shortest thing the public order search will look up. */
export const ORDER_SEARCH_MIN = 3;

/**
 * Orders for the public "Check your order" page, newest first: a whole email,
 * a whole serial number (with or without "C-"), a whole payment reference
 * number, or a name, where each word typed starts a word of the name. Order
 * numbers aren't searched: they run 1, 2, 3…, so anyone could read through
 * every order.
 */
export function findOrders(query: string): Order[] {
	const text = query.trim().toLowerCase();
	if (text.length < ORDER_SEARCH_MIN) return [];
	const params: Record<string, string> = { email: text };
	const matches = ["lower(email) = $email"];
	const reference = normalizeReferenceNumber(text);
	if (reference.length >= ORDER_SEARCH_MIN) {
		matches.push("upper(reference_number) = upper($reference)");
		params.reference = reference;
	}
	const serial = /^(?:c\s*-?\s*)?(\d+)$/.exec(text)?.[1];
	if (serial) {
		matches.push("serial_number = $serial");
		params.serial = serial;
	}
	const words = text.replace(/,/g, " ").split(/\s+/).filter(Boolean);
	if (!text.includes("@") && !serial) {
		matches.push(
			`(${words
				.map((word, i) => {
					params[`word${i}`] = `% ${word.replace(/[\\%_]/g, "\\$&")}%`;
					return `' ' || lower(full_name) LIKE $word${i} ESCAPE '\\'`;
				})
				.join(" AND ")})`,
		);
	}
	const rows = getDb()
		.query(
			`SELECT * FROM orders WHERE ${matches.join(" OR ")}
			 ORDER BY created_at DESC LIMIT 30`,
		)
		.all(params) as OrderRow[];
	return toOrders(rows);
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
	/** Only test orders, or leave them out. */
	test?: "only" | "exclude";
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
	if (filter.test) where.push(`is_test = ${filter.test === "only" ? 1 : 0}`);
	if (filter.search) {
		where.push(
			`(number LIKE $q OR full_name LIKE $q OR company LIKE $q OR class_name LIKE $q
			  OR dedication_for LIKE $q OR reference_number LIKE $q
			  OR EXISTS (SELECT 1 FROM json_each(lines) AS line, json_each(line.value, '$.messages') AS card
			             WHERE json_extract(card.value, '$.to') LIKE $q))`,
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
 * their payment is verified. Cancelling has its own step: `cancelOrder`.
 */
export function setOrderStage(id: string, stage: BoardStage): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		if (order.stage === stage) return;
		if (order.stage === "cancelled")
			throw new OrderRuleError("Cancelled orders can’t be moved.");
		if (stage !== "new") {
			if (!canStartMaking(order.payment)) {
				throw new OrderRuleError(
					order.payment.status === "rejected"
						? "This payment was rejected. Sort it out with the customer, then verify it."
						: "Verify the payment first.",
				);
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

/**
 * The shopper edits their own order: details, cards and notes, and which
 * bouquets and how many. The rule is checked here, in the transaction, so a payment sent or a deadline passed
 * while the page was open still stops it. Stock follows the new quantities.
 */
export function updateCustomerOrder(
	id: string,
	update: { details: CheckoutDetails; lines: PricedLine[] },
): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		const state = orderEditState(order);
		if (!state.editable)
			throw new OrderRuleError(ORDER_EDIT_LOCKED[state.lock ?? "progress"]);
		const before = (line: PricedLine) =>
			order.lines.find(
				(old) =>
					old.productId === line.productId && old.variantId === line.variantId,
			)?.quantity ?? 0;
		for (const line of update.lines) {
			if (line.productId === CUSTOM_PRODUCT_ID || line.quantity <= before(line))
				continue;
			const available = db
				.query(
					`SELECT 1 FROM bouquet_styles
					 WHERE bouquet_id = $productId AND slug = $variantId AND is_available = 1`,
				)
				.get({ productId: line.productId, variantId: line.variantId });
			if (!available)
				throw new OrderRuleError(
					`${lineName(line)} isn’t available right now. Choose another bouquet.`,
				);
		}
		// A test order holds no stock. Failing partway rolls all of this back.
		if (!order.isTest) {
			adjustStyleStock(order.lines, 1);
			adjustWrapperStock(order.lines, 1);
			adjustFlowerStock(order.lines, 1);
			const short = adjustStyleStock(update.lines, -1);
			if (short)
				throw new OrderRuleError(
					`There aren’t enough ${lineName(short)} left. Lower the quantity to continue.`,
				);
			const wrapper = adjustWrapperStock(update.lines, -1);
			if (wrapper)
				throw new OrderRuleError(
					`There aren’t enough ${wrapper} wrappers left. Lower the quantity to continue.`,
				);
			const flower = adjustFlowerStock(update.lines, -1);
			if (flower)
				throw new OrderRuleError(
					`There aren’t enough ${flower} left. Lower the quantity to continue.`,
				);
		}
		const subtotal = update.lines.reduce(
			(sum, line) => sum + toCents(line.lineTotal),
			0,
		);
		db.query(
			`UPDATE orders SET email = $email, recipient_name = $fullName, first_name = $firstName,
			   last_name = $lastName, full_name = $fullName, company = $company,
			   serial_number = $serialNumber, class_name = $className, lines = $lines,
			   subtotal_cents = $subtotal, total_cents = $subtotal + delivery_fee_cents,
			   customer_edited_at = $now
			 WHERE id = $id`,
		).run({
			id,
			email: update.details.email,
			firstName: update.details.firstName,
			lastName: update.details.lastName,
			fullName: update.details.fullName,
			company: update.details.company,
			serialNumber: update.details.serialNumber,
			className: update.details.className,
			lines: JSON.stringify(update.lines),
			subtotal,
			now: nowIso(),
		});
	})();
	return getOrderById(id) as Order;
}

/**
 * Staff cancel one bouquet: it goes back in stock and off the total, its card
 * and note go with it, and the rest of the order carries on. Only while the
 * shopper could still edit the order: within the time limit and before payment.
 */
export function cancelBouquet(
	id: string,
	cancellation: {
		lineKey: string;
		unit: number;
		reason: string;
		cancelledBy: string;
		proofFile?: string;
	},
): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		const state = orderEditState(order);
		if (!state.editable)
			throw new OrderRuleError(
				`A single bouquet can only be cancelled within ${ORDER_EDIT_HOURS} hours and before payment is sent. You can still cancel the whole order.`,
			);
		const line = order.lines.find(
			(candidate) => lineKey(candidate) === cancellation.lineKey,
		);
		if (
			!line ||
			!Number.isInteger(cancellation.unit) ||
			cancellation.unit < 0 ||
			cancellation.unit >= line.quantity
		)
			throw new OrderRuleError("That bouquet isn’t on this order anymore.");
		if (order.itemCount <= 1)
			throw new OrderRuleError(
				"This is the order’s only bouquet. Cancel the whole order instead.",
			);
		// A test order holds no stock.
		if (!order.isTest) {
			const one = [{ ...line, quantity: 1 }];
			adjustStyleStock(one, 1);
			adjustWrapperStock(one, 1);
			adjustFlowerStock(one, 1);
		}
		const lines = order.lines.flatMap((candidate) => {
			if (candidate !== line) return [candidate];
			if (candidate.quantity === 1) return [];
			const { messages, ...rest } = candidate;
			const kept = messages?.filter((_, unit) => unit !== cancellation.unit);
			return [
				{
					...rest,
					quantity: candidate.quantity - 1,
					lineTotal: fromCents(
						toCents(candidate.unitPrice) * (candidate.quantity - 1),
					),
					...(kept?.some(hasContent) ? { messages: kept } : {}),
				},
			];
		});
		const subtotal = lines.reduce(
			(sum, candidate) => sum + toCents(candidate.lineTotal),
			0,
		);
		const cancelled: CancelledBouquet = {
			name: lineName(line),
			...(line.image ? { image: line.image } : {}),
			price: line.unitPrice,
			reason: cancellation.reason,
			at: nowIso(),
			cancelledBy: cancellation.cancelledBy,
			...(cancellation.proofFile ? { proofFile: cancellation.proofFile } : {}),
		};
		db.query(
			`UPDATE orders SET lines = $lines, subtotal_cents = $subtotal,
			   total_cents = $subtotal + delivery_fee_cents,
			   cancelled_bouquets = $cancelled
			 WHERE id = $id`,
		).run({
			id,
			lines: JSON.stringify(lines),
			subtotal,
			cancelled: JSON.stringify([...order.cancelledBouquets, cancelled]),
		});
	})();
	return getOrderById(id) as Order;
}

/**
 * Staff cancel an order, saying why (and optionally attaching a photo). Its
 * bouquets go back in stock. Finished orders can't be cancelled.
 */
export function cancelOrder(
	id: string,
	cancellation: { reason: string; cancelledBy: string; proofFile?: string },
): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		if (order.stage === "cancelled")
			throw new OrderRuleError("This order was already cancelled.");
		if (order.stage === "done")
			throw new OrderRuleError("Done orders can’t be cancelled.");
		// A test order already gave its stock back when it was marked.
		if (!order.isTest) {
			adjustStyleStock(order.lines, 1);
			adjustWrapperStock(order.lines, 1);
			adjustFlowerStock(order.lines, 1);
		}
		const now = nowIso();
		db.query(
			`UPDATE orders SET stage = 'cancelled', stage_updated_at = $now,
			   delivered_at = NULL, cancel_reason = $reason,
			   cancelled_by = $cancelledBy, cancel_proof = $proofFile
			 WHERE id = $id`,
		).run({
			id,
			now,
			reason: cancellation.reason,
			cancelledBy: cancellation.cancelledBy,
			proofFile: cancellation.proofFile ?? null,
		});
		addEvent(id, "cancelled", now);
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
		proofFile?: string;
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
			   reference_number = $reference, proof_file = $proof,
			   payment_reviewed_by = NULL, payment_reviewed_at = NULL,
			   customer_id = COALESCE(customer_id, $customerId)
			 WHERE id = $id`,
		)
		.run({
			id,
			method: payment.method,
			reference: payment.referenceNumber,
			proof: payment.proofFile ?? null,
			customerId: payment.customerId ?? null,
		});
	return getOrderById(id) as Order;
}

/** Staff set a payment's status; going back to unreviewed clears the reviewer. */
export function reviewPayment(
	id: string,
	status: PaymentStatus,
	reviewer: string,
): Order {
	const order = getOrderById(id);
	if (!order) throw new OrderRuleError("Order not found.");
	if (order.payment.method === "card")
		throw new OrderRuleError("Card payments don’t need review.");
	if (order.stage === "cancelled")
		throw new OrderRuleError("This order was cancelled.");
	if (!isPaymentSettled(status) && order.stage !== "new")
		throw new OrderRuleError(
			"This order is already being made. Move it back to New first.",
		);
	const reviewed = status !== "pending" && status !== "on_hold";
	getDb()
		.query(
			`UPDATE orders SET payment_status = $status, payment_reviewed_by = $reviewer,
			 payment_reviewed_at = $now WHERE id = $id`,
		)
		.run({
			id,
			status,
			reviewer: reviewed ? reviewer : null,
			now: reviewed ? nowIso() : null,
		});
	return getOrderById(id) as Order;
}

/** Records how far the wrapper of one of the order's bouquets has got. */
/**
 * Replaces the details, bouquet line, total and payment of an order staff
 * added from a chat. A changed wrapper goes back to stock and the new one is
 * taken, unless the order holds no stock (test or cancelled).
 */
export function updateChatOrder(
	id: string,
	update: {
		details: CheckoutDetails;
		line: PricedLine;
		payment: Pick<OrderPayment, "method" | "status" | "amountPaid">;
	},
): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		if (order.stage === "cancelled")
			throw new OrderRuleError("Cancelled orders can’t be changed.");
		const lines = [update.line];
		if (!order.isTest) {
			adjustWrapperStock(order.lines, 1);
			const short = adjustWrapperStock(lines, -1);
			if (short)
				throw new OrderRuleError(
					`${short} wrappers are out of stock. Pick another, or add stock in Wrappers.`,
				);
		}
		const total = toCents(update.line.lineTotal);
		db.query(
			`UPDATE orders SET email = $email, recipient_name = $fullName, first_name = $firstName,
			   last_name = $lastName, full_name = $fullName, company = $company,
			   serial_number = $serialNumber, class_name = $className, notes = $notes,
			   dedication_for = $dedicationFor, gift_message = $dedicationMessage, lines = $lines,
			   subtotal_cents = $total, total_cents = $total, payment_method = $method,
			   payment_status = $status, amount_paid_cents = $amountPaid
			 WHERE id = $id`,
		).run({
			id,
			email: update.details.email,
			firstName: update.details.firstName,
			lastName: update.details.lastName,
			fullName: update.details.fullName,
			company: update.details.company,
			serialNumber: update.details.serialNumber,
			className: update.details.className,
			notes: update.details.notes,
			dedicationFor: update.details.dedicationFor,
			dedicationMessage: update.details.dedicationMessage,
			lines: JSON.stringify(lines),
			total,
			method: update.payment.method,
			status: update.payment.status,
			amountPaid:
				update.payment.amountPaid === undefined
					? null
					: toCents(update.payment.amountPaid),
		});
	})();
	return getOrderById(id) as Order;
}

export function setWrapperStatus(
	id: string,
	lineIndex: number,
	status: WrapperStatus,
): Order {
	const db = getDb();
	db.transaction(() => {
		const order = getOrderById(id);
		if (!order) throw new OrderRuleError("Order not found.");
		if (order.stage === "cancelled")
			throw new OrderRuleError("This order was cancelled.");
		if (!order.lines[lineIndex])
			throw new OrderRuleError("That bouquet isn’t on this order.");
		const lines = order.lines.map((line, index) =>
			index === lineIndex ? { ...line, wrapperStatus: status } : line,
		);
		db.query("UPDATE orders SET lines = $lines WHERE id = $id").run({
			id,
			lines: JSON.stringify(lines),
		});
	})();
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
