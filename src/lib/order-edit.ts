import { isChatOrder } from "~/lib/chat-order";
import { SHOP_TIME_ZONE } from "~/lib/time";
import type { OrderStage, PaymentStatus } from "~/types/order";

/** How long after ordering a shopper can still change their order. */
export const ORDER_EDIT_HOURS = 24;

/** The rule, as shown to shoppers wherever it matters. */
export const ORDER_EDIT_RULE = `You can edit your order for ${ORDER_EDIT_HOURS} hours after placing it, as long as you haven’t sent your payment.`;

/** Where to find the Edit button later. */
export const ORDER_EDIT_HOW =
	"To edit, tap Edit order in Check your order or on your order page, then confirm the email you used when you ordered.";

export type OrderEditLock = "payment" | "expired" | "progress";

/**
 * Whether the shopper can still edit: the order is waiting for a payment they
 * chose to send later, and it's within the time limit. Orders staff added from
 * a chat are changed by staff.
 */
export function orderEditState(
	order: {
		createdAt: string;
		stage: OrderStage;
		payment: { status: PaymentStatus };
		lines: { variantId: string }[];
	},
	now = new Date(),
): { editable: boolean; until: string; lock?: OrderEditLock } {
	const until = new Date(
		new Date(order.createdAt).getTime() + ORDER_EDIT_HOURS * 3_600_000,
	);
	const untilIso = until.toISOString();
	if (order.stage !== "new" || isChatOrder(order))
		return { editable: false, until: untilIso, lock: "progress" };
	if (order.payment.status !== "on_hold")
		return { editable: false, until: untilIso, lock: "payment" };
	if (now >= until)
		return { editable: false, until: untilIso, lock: "expired" };
	return { editable: true, until: untilIso };
}

/** Why an order can't be edited, for the shopper. */
export const ORDER_EDIT_LOCKED: Record<OrderEditLock, string> = {
	payment:
		"This order can’t be edited anymore because its payment has been sent.",
	expired: `This order can’t be edited anymore: the ${ORDER_EDIT_HOURS} hours for changes have passed.`,
	progress: "This order can’t be edited anymore.",
};

/** The edit deadline in shop time, e.g. "Nov 6, 5:25 PM". */
export const formatEditDeadline = (until: string) =>
	new Intl.DateTimeFormat("en-US", {
		timeZone: SHOP_TIME_ZONE,
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(until));

/**
 * Whether staff can cancel a single bouquet: the same rule as the shopper's
 * edits, on an order with another bouquet to carry on with.
 */
export function canCancelOneBouquet(
	order: Omit<Parameters<typeof orderEditState>[0], "lines"> & {
		lines: { variantId: string; quantity: number }[];
	},
	now = new Date(),
) {
	const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
	return count > 1 && orderEditState(order, now).editable;
}

const emailKey = (orderId: string) => `oraia:order-email:${orderId}`;

/** Keeps a confirmed email for this browser tab, so a reload doesn't ask again. */
export function rememberOrderEmail(orderId: string, email: string) {
	try {
		window.sessionStorage.setItem(emailKey(orderId), email);
	} catch {
		// Private windows can refuse storage; they'll just be asked again.
	}
}

export function recallOrderEmail(orderId: string) {
	try {
		return window.sessionStorage.getItem(emailKey(orderId)) ?? "";
	} catch {
		return "";
	}
}

export function forgetOrderEmail(orderId: string) {
	try {
		window.sessionStorage.removeItem(emailKey(orderId));
	} catch {
		// Nothing to forget.
	}
}
