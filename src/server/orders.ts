import { createServerFn } from "@tanstack/solid-start";
import {
	type CheckoutDetails,
	type FieldErrors,
	hasErrors,
	parseCheckoutDetails,
	validateCheckoutDetails,
} from "~/lib/checkout";
import {
	CARD_BRAND_LABELS,
	type CardBrand,
	isPaymentMethod,
	isQrPayment,
	normalizeReferenceNumber,
	validateReferenceNumber,
} from "~/lib/payment";
import { type CartLine, priceCart, sanitizeCartLines } from "~/lib/pricing";
import { styleLabel } from "~/lib/product";
import {
	type ActiveOrder,
	type CustomerOrder,
	isPaymentDue,
	type Order,
	type OrderStatus,
	orderStatus,
} from "~/types/order";
import type { PaymentAccount } from "~/types/payment";
import { listPublicProducts } from "./catalog-repo";
import { getCustomSettings } from "./custom-repo";
import { getSessionUser } from "./customer-auth";
import {
	createOrder,
	getOrderById,
	getOrderByNumber,
	listOrders,
	type NewOrder,
	OrderRuleError,
	submitPayment,
	toCustomerOrder,
} from "./orders-repo";
import { getPaymentAccount, listPaymentAccounts } from "./payments-repo";

export type PlaceOrderResult =
	| { ok: true; orderId: string; number: string }
	| { ok: false; message: string; fieldErrors?: FieldErrors };

interface PlaceOrderInput {
	lines: CartLine[];
	details: CheckoutDetails;
	paymentMethod: string;
	referenceNumber: string;
	/** "To follow": the reference number comes later, so the order waits on hold. */
	referenceLater: boolean;
	cardBrand: string;
	cardLast4: string;
	noCancellationAccepted: boolean;
}

/** Payment methods the shop currently accepts, with their QR details. */
export const getCheckoutConfig = createServerFn({ method: "GET" }).handler(
	async () => ({
		paymentAccounts: listPaymentAccounts().filter((account) => account.enabled),
	}),
);

export const placeOrder = createServerFn({ method: "POST" })
	.validator((input: unknown): PlaceOrderInput => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const text = (key: string) => {
			const value = input.get(key);
			return typeof value === "string" ? value.trim() : "";
		};
		let lines: CartLine[] = [];
		try {
			lines = sanitizeCartLines(JSON.parse(text("lines") || "[]"));
		} catch {
			lines = [];
		}
		return {
			lines,
			details: parseCheckoutDetails(Object.fromEntries(input.entries())),
			paymentMethod: text("paymentMethod"),
			referenceNumber: text("referenceNumber"),
			referenceLater: text("referenceLater") === "true",
			cardBrand: text("cardBrand"),
			cardLast4: text("cardLast4"),
			noCancellationAccepted: text("noCancellationAccepted") === "true",
		};
	})
	.handler(async ({ data }): Promise<PlaceOrderResult> => {
		if (!data.noCancellationAccepted) {
			return {
				ok: false,
				message: "Please confirm that orders can’t be cancelled.",
			};
		}
		const fieldErrors = validateCheckoutDetails(data.details);

		const method =
			isPaymentMethod(data.paymentMethod) &&
			getPaymentAccount(data.paymentMethod)?.enabled
				? data.paymentMethod
				: null;
		if (!method) {
			fieldErrors.paymentMethod = "Choose how you’d like to pay.";
		} else if (isQrPayment(method)) {
			const referenceError = validateReferenceNumber(data.referenceNumber);
			if (referenceError && !data.referenceLater)
				fieldErrors.referenceNumber = referenceError;
		} else if (
			!(data.cardBrand in CARD_BRAND_LABELS) ||
			!/^\d{4}$/.test(data.cardLast4)
		) {
			return { ok: false, message: "Please re-enter your card details." };
		}
		if (!method || hasErrors(fieldErrors)) {
			return {
				ok: false,
				message: "Please check the highlighted fields.",
				fieldErrors,
			};
		}

		// Prices and availability always come from the database, never the client.
		const cart = priceCart(
			data.lines,
			listPublicProducts(),
			getCustomSettings(),
		);
		if (cart.lines.length === 0) {
			return { ok: false, message: "Your bag is empty." };
		}
		const unavailable = cart.lines.find((line) => line.problem);
		if (unavailable) {
			return {
				ok: false,
				message:
					unavailable.problem === "unavailable"
						? `Your custom bouquet can’t be made as built: ${unavailable.problemText} Remove it and build it again.`
						: unavailable.problem === "sold-out"
							? `${unavailable.colorName} just sold out. Remove it from your bag to continue.`
							: `Only ${unavailable.maxQuantity} of ${unavailable.colorName} available. Lower the quantity to continue.`,
			};
		}

		const id = crypto.randomUUID();
		let payment: NewOrder["payment"];
		if (isQrPayment(method) && data.referenceLater) {
			payment = { method, status: "on_hold" };
		} else if (isQrPayment(method)) {
			// Staff match the reference number against the account's history.
			payment = {
				method,
				status: "pending",
				referenceNumber: normalizeReferenceNumber(data.referenceNumber),
			};
		} else {
			// Card details are checked in the browser and only brand + last 4
			// digits arrive here. Charge through a gateway (e.g. PayMongo) before launch.
			payment = {
				method: "card",
				status: "paid",
				cardBrand: data.cardBrand as CardBrand,
				cardLast4: data.cardLast4,
			};
		}

		try {
			// Signed-in shoppers can track the order from their account.
			const customer = await getSessionUser();
			const order = createOrder({
				id,
				details: data.details,
				cart,
				payment,
				customerId: customer?.id,
			});
			return { ok: true, orderId: id, number: order.number };
		} catch (error) {
			if (error instanceof OrderRuleError) {
				return { ok: false, message: error.message };
			}
			throw error;
		}
	});

/** The shopper's view of an order: no staff notes or stored file names. */
export const getOrder = createServerFn({ method: "GET" })
	.validator((orderId: unknown) => {
		if (typeof orderId !== "string") throw new Error("Invalid order id");
		return orderId;
	})
	.handler(
		async ({
			data,
		}): Promise<(CustomerOrder & { ownedByViewer: boolean }) | null> => {
			const order = getOrderById(data);
			if (!order) return null;
			const viewer = await getSessionUser();
			return {
				...toCustomerOrder(order),
				// Lets the page offer "Track this order" only to its owner.
				ownedByViewer: !!viewer && order.customerId === viewer.id,
			};
		},
	);

/**
 * Every order that isn't cancelled, for the public Active orders page. Rows
 * carry the public order number only, never the private order id.
 */
export const listActiveOrders = createServerFn({ method: "GET" }).handler(
	async (): Promise<ActiveOrder[]> => {
		const orders = listOrders({
			stages: ["new", "making", "done"],
			limit: 2000,
		});
		const rows = orders.map((order) => ({
			number: order.number,
			className: order.details.className,
			company: order.details.company,
			fullName: order.details.fullName,
			items: order.lines.map(
				(line) => `${line.quantity} × ${line.title} · ${styleLabel(line)}`,
			),
			total: order.total,
			currency: order.currency,
			status: orderStatus(order.stage, order.payment.status),
		}));
		// Finished orders drop to the bottom; the rest stay newest first.
		return rows.sort(
			(a, b) => Number(a.status === "done") - Number(b.status === "done"),
		);
	},
);

type PayAccess = "allowed" | "sign-in" | "not-yours";

/**
 * The public list shows every order, so paying needs more than a number: the
 * private link (kept by the device that ordered), or the matching account. An
 * unlinked guest order can be claimed by an account with the same surname.
 */
async function payAccess(order: Order, key?: string): Promise<PayAccess> {
	if (key && key === order.id) return "allowed";
	const viewer = await getSessionUser();
	if (!viewer) return "sign-in";
	if (order.customerId) {
		return order.customerId === viewer.id ? "allowed" : "not-yours";
	}
	const surname = (
		order.details.lastName || order.details.fullName
	).toLowerCase();
	return surname && viewer.name.toLowerCase().includes(surname)
		? "allowed"
		: "not-yours";
}

export interface PayableOrder {
	number: string;
	total: number;
	currency: string;
	items: string[];
	status: OrderStatus;
	/** Whether a payment can be sent at all. */
	due: boolean;
	access: PayAccess;
	method: PaymentAccount["method"];
	/** Filled in only for someone allowed to pay. */
	paymentAccounts: PaymentAccount[];
}

/** QR methods only: there's no card form on the pay page. */
const qrAccounts = () =>
	listPaymentAccounts().filter(
		(account) => account.enabled && isQrPayment(account.method),
	);

function payInput(input: unknown) {
	if (typeof input !== "object" || input === null)
		throw new Error("Invalid request");
	const { number, key } = input as Record<string, unknown>;
	if (typeof number !== "string" || !/^\d{1,9}$/.test(number))
		throw new Error("Invalid order number");
	return { number, key: typeof key === "string" ? key : undefined };
}

export const getPayableOrder = createServerFn({ method: "GET" })
	.validator(payInput)
	.handler(async ({ data }): Promise<PayableOrder | null> => {
		const order = getOrderByNumber(data.number);
		if (!order || order.stage === "cancelled") return null;
		const due = order.stage === "new" && isPaymentDue(order.payment.status);
		const access = due ? await payAccess(order, data.key) : "not-yours";
		return {
			number: order.number,
			total: order.total,
			currency: order.currency,
			items: order.lines.map(
				(line) => `${line.quantity} × ${line.title} · ${styleLabel(line)}`,
			),
			status: orderStatus(order.stage, order.payment.status),
			due,
			access,
			method: order.payment.method,
			paymentAccounts: access === "allowed" ? qrAccounts() : [],
		};
	});

export type SubmitPaymentResult =
	| { ok: true }
	| { ok: false; message: string; fieldErrors?: FieldErrors };

/** The shopper sends the reference number for an order on hold. */
export const submitOrderPayment = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const { method, referenceNumber } = input as Record<string, unknown>;
		return {
			...payInput(input),
			method: typeof method === "string" ? method : "",
			referenceNumber:
				typeof referenceNumber === "string" ? referenceNumber : "",
		};
	})
	.handler(async ({ data }): Promise<SubmitPaymentResult> => {
		const order = getOrderByNumber(data.number);
		if (!order) return { ok: false, message: "Order not found." };
		const access = await payAccess(order, data.key);
		if (access !== "allowed")
			return { ok: false, message: "Sign in to pay for this order." };
		const account = qrAccounts().find((a) => a.method === data.method);
		if (!account)
			return {
				ok: false,
				message: "Choose how you paid.",
				fieldErrors: { paymentMethod: "Choose how you paid." },
			};
		const referenceError = validateReferenceNumber(data.referenceNumber);
		if (referenceError)
			return {
				ok: false,
				message: "Please check the highlighted fields.",
				fieldErrors: { referenceNumber: referenceError },
			};
		try {
			const viewer = await getSessionUser();
			submitPayment(order.id, {
				method: account.method,
				referenceNumber: normalizeReferenceNumber(data.referenceNumber),
				customerId: viewer?.id,
			});
			return { ok: true };
		} catch (error) {
			if (error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});
