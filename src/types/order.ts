import type { CheckoutDetails } from "~/lib/checkout";
import type { CardBrand, PaymentMethod } from "~/lib/payment";
import type { PricedCart } from "~/lib/pricing";

/** Board columns, in workflow order. */
export const BOARD_STAGES = ["new", "making", "done"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];
export type OrderStage = BoardStage | "cancelled";

export const STAGE_LABELS: Record<OrderStage, string> = {
	new: "New orders",
	making: "Being made",
	done: "Done",
	cancelled: "Cancelled",
};

/**
 * Card payments are `paid` at checkout. QR payments start `pending` until
 * staff match the reference number, then become `verified` or `rejected`.
 * `on_hold` means the shopper ordered and will send the reference number later.
 */
export type PaymentStatus =
	| "paid"
	| "pending"
	| "verified"
	| "rejected"
	| "on_hold";

export function isPaymentSettled(status: PaymentStatus) {
	return status === "paid" || status === "verified";
}

/** The shopper still has to send a payment: never sent, or it didn't match. */
export function isPaymentDue(status: PaymentStatus) {
	return status === "on_hold" || status === "rejected";
}

/** What shoppers and staff are told about an order, from its stage and payment. */
export type OrderStatus =
	| "on_hold"
	| "verifying"
	| "payment_check"
	| "being_made"
	| "done"
	| "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	on_hold: "On hold",
	verifying: "Verifying payment",
	payment_check: "Needs payment check",
	being_made: "Being made",
	done: "Done",
	cancelled: "Cancelled",
};

export function orderStatus(
	stage: OrderStage,
	payment: PaymentStatus,
): OrderStatus {
	if (stage === "cancelled" || stage === "done") return stage;
	if (stage === "making") return "being_made";
	if (payment === "on_hold") return "on_hold";
	if (payment === "pending") return "verifying";
	if (payment === "rejected") return "payment_check";
	// Paid and waiting for its turn: confirmed, so it's in the queue to be made.
	return "being_made";
}

export interface OrderPayment {
	method: PaymentMethod;
	status: PaymentStatus;
	referenceNumber?: string;
	/** Stored screenshot file name; staff-only. */
	proofFile?: string;
	cardBrand?: CardBrand;
	cardLast4?: string;
	reviewedBy?: string;
	reviewedAt?: string;
}

export interface OrderEvent {
	stage: OrderStage;
	at: string;
}

export interface OrderDelivery {
	riderName?: string;
	riderPhone?: string;
	/** Stored proof-of-delivery photo file name; private to staff + customer. */
	photoFile?: string;
	deliveredAt?: string;
}

export interface Order extends PricedCart {
	id: string;
	number: string;
	createdAt: string;
	stage: OrderStage;
	stageUpdatedAt: string;
	/** Set when the order was placed while signed in to a customer account. */
	customerId?: string;
	details: CheckoutDetails;
	payment: OrderPayment;
	delivery: OrderDelivery;
	/** When each stage was reached, oldest first. */
	events: OrderEvent[];
	/** On older orders the shopper cancelled themselves: their reason. */
	cancelReason?: string;
}

/** A customer's view of their own order: no staff-only details or file names. */
export interface CustomerOrder
	extends Omit<Order, "payment" | "delivery" | "customerId"> {
	payment: Omit<OrderPayment, "proofFile" | "reviewedBy">;
	delivery: Omit<OrderDelivery, "photoFile"> & { hasPhoto: boolean };
}

/**
 * One row of the public Active orders page. It only carries what that page
 * shows: no order id (that's the private link), notes or reference number.
 */
export interface ActiveOrder {
	number: string;
	className: string;
	company: string;
	fullName: string;
	items: string[];
	total: number;
	currency: string;
	status: OrderStatus;
}

/** The customer-facing tracker, in order. Cancelled orders skip it. */
export const TRACKER_STEPS = [
	{ stage: "new", label: "Placed" },
	{ stage: "making", label: "Preparing" },
	{ stage: "done", label: "Delivered" },
] as const satisfies ReadonlyArray<{ stage: BoardStage; label: string }>;

export const ACTIVE_STAGES: OrderStage[] = ["new", "making"];
