import type { CheckoutDetails } from "~/lib/checkout";
import type { CardBrand, PaymentMethod } from "~/lib/payment";
import type { PricedCart } from "~/lib/pricing";

/** Board columns, in workflow order. */
export const BOARD_STAGES = ["new", "making", "delivering", "done"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];
export type OrderStage = BoardStage | "cancelled";

export const STAGE_LABELS: Record<OrderStage, string> = {
	new: "New orders",
	making: "Being made",
	delivering: "On the delivery bike",
	done: "Done",
	cancelled: "Cancelled",
};

/**
 * Card payments are `paid` at checkout. QR payments start `pending` until
 * staff check the screenshot, then become `verified` or `rejected`.
 */
export type PaymentStatus = "paid" | "pending" | "verified" | "rejected";

export function isPaymentSettled(status: PaymentStatus) {
	return status === "paid" || status === "verified";
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
}

/** A customer's view of their own order: no staff-only details or file names. */
export interface CustomerOrder
	extends Omit<Order, "payment" | "delivery" | "customerId"> {
	payment: Omit<OrderPayment, "proofFile" | "reviewedBy">;
	delivery: Omit<OrderDelivery, "photoFile"> & { hasPhoto: boolean };
}

/** The customer-facing tracker, in order. Cancelled orders skip it. */
export const TRACKER_STEPS = [
	{ stage: "new", label: "Placed" },
	{ stage: "making", label: "Preparing" },
	{ stage: "delivering", label: "Out for delivery" },
	{ stage: "done", label: "Delivered" },
] as const satisfies ReadonlyArray<{ stage: BoardStage; label: string }>;

export const ACTIVE_STAGES: OrderStage[] = ["new", "making", "delivering"];
