import type { CheckoutDetails } from "~/lib/checkout";
import type { CardBrand, PaymentMethod } from "~/lib/payment";
import type { PricedCart } from "~/lib/pricing";

/** Board columns, in workflow order. */
export const BOARD_STAGES = ["new", "making", "done"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];
export type OrderStage = BoardStage | "cancelled";

/** Longest reason staff can give for cancelling an order. */
export const CANCEL_REASON_MAX = 500;

/** Longest reason staff can give for changing an order's payment method. */
export const PAYMENT_CHANGE_REASON_MAX = 500;

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
export const PAYMENT_STATUSES = [
	"on_hold",
	"pending",
	"rejected",
	"verified",
	"paid",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentSettled(status: PaymentStatus) {
	return status === "paid" || status === "verified";
}

/**
 * Whether staff can start making the order: paid, or (for orders added from a
 * chat) a deposit is in, with the rest due on the day.
 */
export function canStartMaking(payment: {
	status: PaymentStatus;
	amountPaid?: number;
}) {
	return isPaymentSettled(payment.status) || (payment.amountPaid ?? 0) > 0;
}

/** The shopper still has to send a payment: never sent, or it didn't match. */
export function isPaymentDue(status: PaymentStatus) {
	return status === "on_hold" || status === "rejected";
}

/** How far staff are with a bouquet's wrapper; lines without one read as `todo`. */
export const WRAPPER_STATUSES = ["todo", "in_progress", "made"] as const;
export type WrapperStatus = (typeof WRAPPER_STATUSES)[number];

export const WRAPPER_STATUS_LABELS: Record<WrapperStatus, string> = {
	todo: "Not started",
	in_progress: "In progress",
	made: "Made",
};

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
	/** Orders added from a chat: what the customer paid so far, e.g. a deposit. */
	amountPaid?: number;
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

/** One bouquet staff cancelled from an order, and why. */
export interface CancelledBouquet {
	name: string;
	image?: string;
	price: number;
	reason: string;
	at: string;
	/** Staff only, like the photo. */
	cancelledBy?: string;
	/** Stored photo staff attached; staff only. */
	proofFile?: string;
}

/** Staff switched how an order is paid, and why. Staff only. */
export interface PaymentMethodChange {
	from: PaymentMethod;
	to: PaymentMethod;
	reason: string;
	changedBy: string;
	at: string;
	/** Stored photo staff attached, kept with the payment screenshots. */
	proofFile?: string;
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
	/**
	 * Why it was cancelled. Staff give one with `cancelledBy` set; on older orders
	 * without it, the shopper cancelled themselves and this is their reason.
	 */
	cancelReason?: string;
	/** The staff member who cancelled the order. */
	cancelledBy?: string;
	/** Stored photo staff attached when cancelling; staff-only. */
	cancelProof?: string;
	/** When the shopper last edited the order themselves. */
	customerEditedAt?: string;
	/** Single bouquets staff cancelled; the rest of the order carries on. */
	cancelledBouquets: CancelledBouquet[];
	/** Each time staff changed the payment method, oldest first. */
	paymentMethodChanges: PaymentMethodChange[];
	/** Marked by staff: left out of reports, and holds no stock. */
	isTest: boolean;
}

/** A customer's view of their own order: no staff-only details or file names. */
export interface CustomerOrder
	extends Omit<
		Order,
		| "payment"
		| "delivery"
		| "customerId"
		| "isTest"
		| "cancelledBy"
		| "cancelProof"
		| "cancelledBouquets"
		| "paymentMethodChanges"
	> {
	cancelledBouquets: Omit<CancelledBouquet, "cancelledBy" | "proofFile">[];
	payment: Omit<OrderPayment, "proofFile" | "reviewedBy">;
	delivery: Omit<OrderDelivery, "photoFile"> & { hasPhoto: boolean };
}

/**
 * One row of the public Active orders page. It only carries what that page
 * shows: no order id (that's the private link), notes or reference number.
 */
/** An order as the public "Check your order" search shows it. */
export interface ActiveOrder {
	number: string;
	createdAt: string;
	className: string;
	company: string;
	fullName: string;
	items: {
		name: string;
		quantity: number;
		image?: string;
		total: number;
	}[];
	total: number;
	currency: string;
	stage: OrderStage;
	status: OrderStatus;
	paymentMethod: PaymentMethod;
	paymentStatus: PaymentStatus;
	/** Why it was cancelled; not who did it, or the photo. */
	cancelReason?: string;
	/** Single bouquets cancelled from it, and why. */
	cancelledBouquets: { name: string; reason: string }[];
	/** Still within the rules for the shopper to edit it, and until when. */
	canEdit: boolean;
	editUntil: string;
}

/** The customer-facing tracker, in order. Cancelled orders skip it. */
export const TRACKER_STEPS = [
	{ stage: "new", label: "Placed" },
	{ stage: "making", label: "Preparing" },
	{ stage: "done", label: "Delivered" },
] as const satisfies ReadonlyArray<{ stage: BoardStage; label: string }>;

export const ACTIVE_STAGES: OrderStage[] = ["new", "making"];
