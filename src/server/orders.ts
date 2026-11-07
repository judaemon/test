import { createServerFn } from "@tanstack/solid-start";
import {
	attachMessages,
	type BouquetMessageErrors,
	lineKey,
} from "~/lib/bouquet-messages";
import {
	type CheckoutDetails,
	type FieldErrors,
	hasErrors,
	parseCheckoutDetails,
	validateCheckoutDetails,
} from "~/lib/checkout";
import { ORDER_EDIT_LOCKED, orderEditState } from "~/lib/order-edit";
import {
	CARD_BRAND_LABELS,
	type CardBrand,
	isMethodAllowedFor,
	isPaymentMethod,
	isQrPayment,
	normalizeReferenceNumber,
	validateReferenceNumber,
} from "~/lib/payment";
import {
	type CartLine,
	type PricedLine,
	priceCart,
	roundMoney,
	sanitizeCartLines,
} from "~/lib/pricing";
import { lineName, MAX_PER_ORDER } from "~/lib/product";
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
import { shopActor } from "./order-actor";
import {
	createOrder,
	findOrders,
	getOrderById,
	getOrderByNumber,
	type NewOrder,
	OrderRuleError,
	submitPayment,
	toCustomerOrder,
	updateCustomerOrder,
} from "./orders-repo";
import { getPaymentAccount, listPaymentAccounts } from "./payments-repo";
import { deleteUpload, saveImage, UploadError } from "./uploads";

export type PlaceOrderResult =
	| { ok: true; orderId: string; number: string }
	| {
			ok: false;
			message: string;
			fieldErrors?: FieldErrors;
			/** Problems with bouquets' cards and notes, by `unitKey`. */
			bouquetErrors?: Record<string, BouquetMessageErrors>;
	  };

interface PlaceOrderInput {
	lines: CartLine[];
	/** Each bouquet's card and note, by `lineKey`: one entry per unit. */
	messages: unknown;
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
		let messages: unknown = {};
		try {
			messages = JSON.parse(text("messages") || "{}");
		} catch {
			messages = {};
		}
		return {
			lines,
			messages,
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
		} else if (!isMethodAllowedFor(method, data.details.className)) {
			fieldErrors.paymentMethod =
				"Cash is for cadets only. Choose another way to pay.";
		} else if (method === "cash") {
			// Paid in person; nothing else to check.
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
							? `${lineName(unavailable)} isn’t available right now. Remove it from your bag to continue.`
							: `You can order up to ${unavailable.maxQuantity} of ${lineName(unavailable)} right now. Lower the quantity to continue.`,
			};
		}

		const withMessages = attachMessages(cart.lines, data.messages);
		if (Object.keys(withMessages.errors).length > 0) {
			return {
				ok: false,
				message: "Please check the cards and notes.",
				bouquetErrors: withMessages.errors,
			};
		}
		cart.lines = withMessages.lines;

		const id = crypto.randomUUID();
		let payment: NewOrder["payment"];
		if (method === "cash") {
			// Staff verify the order once the cash is in hand.
			payment = { method, status: "on_hold" };
		} else if (isQrPayment(method) && data.referenceLater) {
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
			const order = createOrder(
				{
					id,
					details: data.details,
					cart,
					payment,
					// Staff often order for someone else, so it isn't theirs to track.
					customerId: customer && !customer.isStaff ? customer.id : undefined,
				},
				shopActor(customer, data.details.fullName),
			);
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
			const owned = !!viewer && order.customerId === viewer.id;
			const customer = toCustomerOrder(order);
			return {
				...customer,
				// The email is what proves an order is yours when editing, so having
				// the link doesn't reveal it. `confirmOrderEmail` gives it back.
				details: {
					...customer.details,
					email: owned ? customer.details.email : "",
				},
				// Lets the page offer "Track this order" only to its owner.
				ownedByViewer: owned,
			};
		},
	);

/** Wrong emails allowed per order before it stops checking for a while. */
const EMAIL_TRIES = 5;
const EMAIL_LOCK_MS = 15 * 60_000;
const emailFailures = new Map<string, { count: number; until: number }>();

/**
 * Checks the email typed for an order. Returns what's wrong, or null if it
 * matches. Limited per order, so emails can't be guessed one after another.
 */
function emailProblem(order: Order, typed: string) {
	const now = Date.now();
	const failures = emailFailures.get(order.id);
	if (failures && failures.until > now && failures.count >= EMAIL_TRIES)
		return "Too many tries. Wait 15 minutes, or message us with your order number.";
	if (!order.details.email)
		return "This order has no email on it. Message us with your order number to change it.";
	if (typed.trim().toLowerCase() === order.details.email.trim().toLowerCase()) {
		emailFailures.delete(order.id);
		return null;
	}
	emailFailures.set(order.id, {
		count: failures && failures.until > now ? failures.count + 1 : 1,
		until: now + EMAIL_LOCK_MS,
	});
	return "That email doesn’t match this order. Check the spelling, or message us with your order number.";
}

/** Step one of a shopper's edit: the email the order was placed with. */
export const confirmOrderEmail = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source =
			typeof input === "object" && input !== null
				? (input as Record<string, unknown>)
				: {};
		const number = source.number;
		return {
			id: typeof source.id === "string" ? source.id : undefined,
			number: isOrderNumber(number) ? number : undefined,
			email: typeof source.email === "string" ? source.email.slice(0, 254) : "",
		};
	})
	.handler(
		async ({
			data,
		}): Promise<
			| { ok: true; orderId: string; email: string }
			| { ok: false; message: string }
		> => {
			const order = data.id
				? getOrderById(data.id)
				: data.number
					? getOrderByNumber(data.number)
					: undefined;
			if (!order) return { ok: false, message: "Order not found." };
			const state = orderEditState(order);
			if (!state.editable)
				return {
					ok: false,
					message: ORDER_EDIT_LOCKED[state.lock ?? "progress"],
				};
			const problem = emailProblem(order, data.email);
			if (problem) return { ok: false, message: problem };
			return { ok: true, orderId: order.id, email: order.details.email };
		},
	);

export type UpdateMyOrderResult =
	| { ok: true }
	| {
			ok: false;
			message: string;
			fieldErrors?: FieldErrors;
			bouquetErrors?: Record<string, BouquetMessageErrors>;
	  };

/**
 * The shopper edits their order, having confirmed its email (or being signed
 * in to the account it's on). The browser only says which
 * bouquets and how many: those already on the order keep the price they were
 * ordered at, and new ones are priced from the catalog.
 */
export const updateMyOrder = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source =
			typeof input === "object" && input !== null
				? (input as Record<string, unknown>)
				: {};
		if (typeof source.id !== "string") throw new Error("Invalid order id");
		return {
			id: source.id,
			confirmedEmail:
				typeof source.confirmedEmail === "string"
					? source.confirmedEmail.slice(0, 254)
					: "",
			details: source.details,
			items: Array.isArray(source.items) ? (source.items as unknown[]) : [],
			messages: source.messages,
		};
	})
	.handler(async ({ data }): Promise<UpdateMyOrderResult> => {
		const order = getOrderById(data.id);
		if (!order) return { ok: false, message: "Order not found." };
		const viewer = await getSessionUser();
		// Everyone confirms the order's email, except its signed-in owner. The check
		// is repeated here because this is what changes the order.
		if (!order.customerId || order.customerId !== viewer?.id) {
			const problem = emailProblem(order, data.confirmedEmail);
			if (problem) return { ok: false, message: problem };
		}
		const parsed = parseCheckoutDetails(data.details);
		// Older orders' order-wide card and note aren't on this form: keep them.
		const details: CheckoutDetails = {
			...parsed,
			notes: order.details.notes,
			addDedication: order.details.addDedication,
			dedicationFor: order.details.dedicationFor,
			dedicationMessage: order.details.dedicationMessage,
		};
		const fieldErrors = validateCheckoutDetails(details);
		if (!isMethodAllowedFor(order.payment.method, details.className))
			fieldErrors.className =
				"Cash payment is for cadets only. Keep your cadet class, or contact us to change how you pay.";
		if (hasErrors(fieldErrors))
			return {
				ok: false,
				message: "Please check the highlighted fields.",
				fieldErrors,
			};
		const seen = new Set<string>();
		const lines: PricedLine[] = [];
		for (const raw of data.items) {
			const item = (raw ?? {}) as Record<string, unknown>;
			const { productId, variantId, quantity } = item;
			if (
				typeof productId !== "string" ||
				typeof variantId !== "string" ||
				!Number.isInteger(quantity) ||
				(quantity as number) < 1 ||
				(quantity as number) > MAX_PER_ORDER
			)
				return { ok: false, message: "Please check the quantities." };
			const key = lineKey({ productId, variantId });
			if (seen.has(key))
				return { ok: false, message: "Please check your bouquets." };
			seen.add(key);
			const count = quantity as number;
			const kept = order.lines.find((line) => lineKey(line) === key);
			if (kept) {
				const { messages: _old, ...line } = kept;
				lines.push({
					...line,
					quantity: count,
					lineTotal: roundMoney(line.unitPrice * count),
				});
				continue;
			}
			// A different bouquet: priced from the catalog, like at checkout. Built
			// bouquets can't be swapped to, as they're designed in the builder.
			const [priced] = priceCart(
				[{ productId, variantId, quantity: count }],
				listPublicProducts(),
			).lines;
			if (!priced)
				return { ok: false, message: "That bouquet isn’t available anymore." };
			if (priced.problem)
				return {
					ok: false,
					message:
						priced.problem === "over-stock"
							? `There aren’t enough ${lineName(priced)} left. Lower the quantity to continue.`
							: `${lineName(priced)} isn’t available right now. Choose another bouquet.`,
				};
			lines.push(priced);
		}
		if (lines.length === 0)
			return { ok: false, message: "An order needs at least one bouquet." };
		const withMessages = attachMessages(lines, data.messages);
		if (Object.keys(withMessages.errors).length > 0)
			return {
				ok: false,
				message: "Please check the cards and notes.",
				bouquetErrors: withMessages.errors,
			};
		try {
			updateCustomerOrder(
				order.id,
				{ details, lines: withMessages.lines },
				shopActor(viewer, order.details.fullName),
			);
			return { ok: true };
		} catch (error) {
			if (error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});

/**
 * The public "Check your order" search. Rows carry the public order number
 * only, never the private order id, and no contact details.
 */
export const findOrdersFn = createServerFn({ method: "GET" })
	.validator((query: unknown) =>
		typeof query === "string" ? query.slice(0, 120) : "",
	)
	.handler(async ({ data }): Promise<ActiveOrder[]> => {
		const rows = findOrders(data).map((order) => ({
			number: order.number,
			createdAt: order.createdAt,
			className: order.details.className,
			company: order.details.company,
			fullName: order.details.fullName,
			items: order.lines.map((line) => ({
				name: lineName(line),
				quantity: line.quantity,
				image: line.image,
				total: line.lineTotal,
			})),
			total: order.total,
			currency: order.currency,
			stage: order.stage,
			status: orderStatus(order.stage, order.payment.status),
			paymentMethod: order.payment.method,
			paymentStatus: order.payment.status,
			...(() => {
				const state = orderEditState(order);
				return {
					canEdit: state.editable,
					editUntil: state.until,
				};
			})(),
			...(order.stage === "cancelled" && order.cancelReason
				? { cancelReason: order.cancelReason }
				: {}),
			cancelledBouquets: order.cancelledBouquets.map(({ name, reason }) => ({
				name,
				reason,
			})),
		}));
		// Orders still in progress first; the rest stay newest first.
		const finished = (row: ActiveOrder) =>
			Number(row.status === "done" || row.status === "cancelled");
		return rows.sort((a, b) => finished(a) - finished(b));
	});

/** A signed-in shopper can claim a guest order that has their surname. */
function claimsOrder(order: Order, viewerName: string) {
	const surname = (
		order.details.lastName || order.details.fullName
	).toLowerCase();
	return !!surname && viewerName.toLowerCase().includes(surname);
}

export interface PayableOrder {
	number: string;
	total: number;
	currency: string;
	items: string[];
	status: OrderStatus;
	/** Whether a payment can be sent at all. */
	due: boolean;
	method: PaymentAccount["method"];
	/** Filled in only while a payment is due. */
	paymentAccounts: PaymentAccount[];
	/** The shopper can still edit it, instead of paying right now. */
	canEdit: boolean;
}

/** QR methods only: there's no card form on the pay page. */
const qrAccounts = () =>
	listPaymentAccounts().filter(
		(account) => account.enabled && isQrPayment(account.method),
	);

const isOrderNumber = (value: unknown): value is string =>
	typeof value === "string" && /^\d{1,9}$/.test(value);

/**
 * Anyone who finds an order can send a payment for it: staff check every
 * reference number against the money received before it counts.
 */
export const getPayableOrder = createServerFn({ method: "GET" })
	.validator((number: unknown) => {
		if (!isOrderNumber(number)) throw new Error("Invalid order number");
		return number;
	})
	.handler(async ({ data }): Promise<PayableOrder | null> => {
		const order = getOrderByNumber(data);
		if (!order || order.stage === "cancelled") return null;
		const due = order.stage === "new" && isPaymentDue(order.payment.status);
		return {
			number: order.number,
			total: order.total,
			currency: order.currency,
			items: order.lines.map((line) => `${line.quantity} × ${lineName(line)}`),
			status: orderStatus(order.stage, order.payment.status),
			due,
			method: order.payment.method,
			paymentAccounts: due ? qrAccounts() : [],
			canEdit: orderEditState(order).editable,
		};
	});

export type SubmitPaymentResult =
	| { ok: true }
	| { ok: false; message: string; fieldErrors?: FieldErrors };

/** The shopper sends a reference number, and a screenshot if they like. */
export const submitOrderPayment = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const number = input.get("number");
		if (!isOrderNumber(number)) throw new Error("Invalid order number");
		const text = (key: string) => {
			const value = input.get(key);
			return typeof value === "string" ? value : "";
		};
		const proof = input.get("proof");
		return {
			number,
			method: text("method"),
			referenceNumber: text("referenceNumber"),
			proof: proof instanceof File && proof.size > 0 ? proof : undefined,
		};
	})
	.handler(async ({ data }): Promise<SubmitPaymentResult> => {
		const order = getOrderByNumber(data.number);
		if (!order) return { ok: false, message: "Order not found." };
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
		if (order.stage !== "new" || !isPaymentDue(order.payment.status))
			return { ok: false, message: "This order doesn’t need a payment now." };
		let proofFile: string | undefined;
		try {
			if (data.proof) proofFile = await saveImage("proofs", data.proof);
			const viewer = await getSessionUser();
			const customerId =
				viewer &&
				!viewer.isStaff &&
				!order.customerId &&
				claimsOrder(order, viewer.name)
					? viewer.id
					: undefined;
			submitPayment(
				order.id,
				{
					method: account.method,
					referenceNumber: normalizeReferenceNumber(data.referenceNumber),
					proofFile,
					customerId,
				},
				shopActor(viewer, order.details.fullName),
			);
			// A new payment replaces one that didn't match.
			if (order.payment.proofFile)
				await deleteUpload("proofs", order.payment.proofFile);
			return { ok: true };
		} catch (error) {
			if (proofFile) await deleteUpload("proofs", proofFile);
			if (error instanceof OrderRuleError || error instanceof UploadError)
				return { ok: false, message: error.message };
			throw error;
		}
	});
