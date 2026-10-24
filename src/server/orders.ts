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
	type PaymentMethod,
	sniffImageType,
	validateProofFile,
	validateReferenceNumber,
} from "~/lib/payment";
import {
	type CartLine,
	type PricedCart,
	priceCart,
	sanitizeCartLines,
} from "~/lib/pricing";

export interface OrderPayment {
	method: PaymentMethod;
	/** QR payments are settled outside the site and need a manual check. */
	status: "paid" | "pending-verification";
	referenceNumber?: string;
	/** Stored screenshot filename under `.data/payment-proofs/`. */
	proofFile?: string;
	cardBrand?: CardBrand;
	cardLast4?: string;
}

export interface Order extends PricedCart {
	id: string;
	number: string;
	createdAt: string;
	details: CheckoutDetails;
	payment: OrderPayment;
}

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

// In-memory order book: fine for a demo, but orders vanish on restart.
// Swap for a database table before taking real orders.
const orders = new Map<string, Order>();

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
		const serverToday = new Date().toISOString().slice(0, 10);
		// A day of slack lets shoppers west of UTC pick their own "today".
		const fieldErrors = validateCheckoutDetails(data.details, serverToday, {
			allowYesterday: true,
		});

		const method = data.paymentMethod;
		let proofBytes: Uint8Array | undefined;
		let proofExtension: string | undefined;
		if (!isPaymentMethod(method)) {
			fieldErrors.paymentMethod = "Choose how you’d like to pay.";
		} else if (isQrPayment(method)) {
			const referenceError = validateReferenceNumber(data.referenceNumber);
			if (referenceError) fieldErrors.referenceNumber = referenceError;
			const proofError = validateProofFile(data.proof);
			if (proofError) fieldErrors.paymentProof = proofError;
			else if (data.proof) {
				proofBytes = new Uint8Array(await data.proof.arrayBuffer());
				proofExtension = sniffImageType(proofBytes.subarray(0, 12));
				if (!proofExtension)
					fieldErrors.paymentProof = "That file isn’t a readable image.";
			}
		} else if (
			!(data.cardBrand in CARD_BRAND_LABELS) ||
			!/^\d{4}$/.test(data.cardLast4)
		) {
			return { ok: false, message: "Please re-enter your card details." };
		}

		if (hasErrors(fieldErrors)) {
			return {
				ok: false,
				message: "Please check the highlighted fields.",
				fieldErrors,
			};
		}

		const cart = priceCart(data.lines);
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
		const paymentMethod = method as PaymentMethod;
		let payment: OrderPayment;
		if (isQrPayment(paymentMethod)) {
			const proofFile = `${id}.${proofExtension}`;
			await saveProof(proofFile, proofBytes as Uint8Array);
			payment = {
				method: paymentMethod,
				status: "pending-verification",
				referenceNumber: normalizeReferenceNumber(data.referenceNumber),
				proofFile,
			};
		} else {
			// Card details are checked in the browser and only brand + last 4
			// digits arrive here. Charge through a gateway (e.g. PayMongo) before launch.
			payment = {
				method: paymentMethod,
				status: "paid",
				cardBrand: data.cardBrand as CardBrand,
				cardLast4: data.cardLast4,
			};
		}

		orders.set(id, {
			...cart,
			id,
			number: id.slice(0, 8).toUpperCase(),
			createdAt: new Date().toISOString(),
			details: data.details,
			payment,
		});
		return { ok: true, orderId: id };
	});

async function saveProof(filename: string, bytes: Uint8Array) {
	// Imported lazily so Node built-ins stay out of the client bundle.
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const dir = join(process.cwd(), ".data", "payment-proofs");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, filename), bytes);
}

export const getOrder = createServerFn({ method: "GET" })
	.validator((orderId: unknown) => {
		if (typeof orderId !== "string") throw new Error("Invalid order id");
		return orderId;
	})
	.handler(async ({ data }) => orders.get(data) ?? null);
