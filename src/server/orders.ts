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
	validateProofFile,
	validateReferenceNumber,
} from "~/lib/payment";
import { type CartLine, priceCart, sanitizeCartLines } from "~/lib/pricing";
import { shopNow } from "~/lib/time";
import type { CustomerOrder } from "~/types/order";
import { listPublicProducts } from "./catalog-repo";
import { getSessionUser } from "./customer-auth";
import {
	createOrder,
	getOrderById,
	type NewOrder,
	OrderRuleError,
	toCustomerOrder,
} from "./orders-repo";
import { getPaymentAccount, listPaymentAccounts } from "./payments-repo";
import { deleteUpload, saveImage, UploadError } from "./uploads";

export type PlaceOrderResult =
	| { ok: true; orderId: string }
	| { ok: false; message: string; fieldErrors?: FieldErrors };

interface PlaceOrderInput {
	lines: CartLine[];
	details: CheckoutDetails;
	paymentMethod: string;
	referenceNumber: string;
	proof: File | null;
	cardBrand: string;
	cardLast4: string;
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
		const proof = input.get("paymentProof");
		return {
			lines,
			details: parseCheckoutDetails(Object.fromEntries(input.entries())),
			paymentMethod: text("paymentMethod"),
			referenceNumber: text("referenceNumber"),
			proof: proof instanceof File ? proof : null,
			cardBrand: text("cardBrand"),
			cardLast4: text("cardLast4"),
		};
	})
	.handler(async ({ data }): Promise<PlaceOrderResult> => {
		const fieldErrors = validateCheckoutDetails(data.details, shopNow());

		const method =
			isPaymentMethod(data.paymentMethod) &&
			getPaymentAccount(data.paymentMethod)?.enabled
				? data.paymentMethod
				: null;
		if (!method) {
			fieldErrors.paymentMethod = "Choose how you’d like to pay.";
		} else if (isQrPayment(method)) {
			const referenceError = validateReferenceNumber(data.referenceNumber);
			if (referenceError) fieldErrors.referenceNumber = referenceError;
			const proofError = validateProofFile(data.proof);
			if (proofError) fieldErrors.paymentProof = proofError;
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
		const cart = priceCart(data.lines, listPublicProducts());
		if (cart.lines.length === 0) {
			return { ok: false, message: "Your bag is empty." };
		}
		const unavailable = cart.lines.find((line) => line.problem);
		if (unavailable) {
			return {
				ok: false,
				message:
					unavailable.problem === "sold-out"
						? `${unavailable.colorName} just sold out. Remove it from your bag to continue.`
						: `Only ${unavailable.maxQuantity} of ${unavailable.colorName} available. Lower the quantity to continue.`,
			};
		}

		const id = crypto.randomUUID();
		let payment: NewOrder["payment"];
		if (isQrPayment(method)) {
			let proofFile: string;
			try {
				proofFile = await saveImage("proofs", data.proof as File, id);
			} catch (error) {
				if (!(error instanceof UploadError)) throw error;
				return {
					ok: false,
					message: "Please check the highlighted fields.",
					fieldErrors: { paymentProof: "That file isn’t a readable image." },
				};
			}
			payment = {
				method,
				status: "pending",
				referenceNumber: normalizeReferenceNumber(data.referenceNumber),
				proofFile,
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
			createOrder({
				id,
				details: data.details,
				cart,
				payment,
				customerId: customer?.id,
			});
		} catch (error) {
			if (payment.proofFile) await deleteUpload("proofs", payment.proofFile);
			if (error instanceof OrderRuleError) {
				return { ok: false, message: error.message };
			}
			throw error;
		}
		return { ok: true, orderId: id };
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
