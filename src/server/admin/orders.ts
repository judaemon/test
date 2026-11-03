import { createServerFn } from "@tanstack/solid-start";
import { CHAT_MESSAGE_MAX, CHAT_PHOTOS_MAX } from "~/lib/chat-order";
import { parseCheckoutDetails } from "~/lib/checkout";
import { CUSTOM_IMAGE, CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import { validateOrdersSearch } from "~/lib/order-filters";
import { isPaymentMethod, type PaymentMethod } from "~/lib/payment";
import {
	type Order,
	type OrderStage,
	PAYMENT_STATUSES,
	WRAPPER_STATUSES,
} from "~/types/order";
import { requireStaff } from "../admin-auth";
import { queryOrderRows } from "../order-rows";
import {
	createOrder,
	getOrderById,
	OrderRuleError,
	reviewPayment,
	setDeliveryPhoto,
	setOrderStage,
	setOrderTest,
	setRider,
	setWrapperStatus,
} from "../orders-repo";
import {
	deleteUpload,
	publicUploadUrl,
	saveImage,
	UploadError,
} from "../uploads";
import { asRecord, InputError, integer, oneOf, text } from "../validate";

const ALL_STAGES = [
	"new",
	"making",
	"done",
	"cancelled",
] as const satisfies readonly OrderStage[];

export type OrderActionResult =
	| { ok: true; order: Order }
	| { ok: false; message: string };

/** The orders table: one page of bouquet rows, and every filter's counts. */
export const listAdminOrderRows = createServerFn({ method: "GET" })
	.validator((input: unknown) => validateOrdersSearch(asRecord(input ?? {})))
	.handler(async ({ data }) => {
		await requireStaff();
		return queryOrderRows(data);
	});

export const getAdminOrder = createServerFn({ method: "GET" })
	.validator((id: unknown) => {
		if (typeof id !== "string") throw new Error("Invalid order id");
		return id;
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return getOrderById(data) ?? null;
	});

async function runAction(action: () => Order): Promise<OrderActionResult> {
	try {
		return { ok: true, order: action() };
	} catch (error) {
		if (error instanceof OrderRuleError)
			return { ok: false, message: error.message };
		throw error;
	}
}

export const moveOrder = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			stage: oneOf(source.stage, ALL_STAGES, "Stage"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return runAction(() => setOrderStage(data.id, data.stage));
	});

export const markOrderTest = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			isTest: source.isTest === true,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return runAction(() => setOrderTest(data.id, data.isTest));
	});

export const reviewOrderPayment = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			status: oneOf(source.status, PAYMENT_STATUSES, "Payment status"),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		return runAction(() => reviewPayment(data.id, data.status, user.name));
	});

export const updateWrapperStatus = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			line: integer(source, "line", { label: "Bouquet", min: 0, max: 500 }),
			status: oneOf(source.status, WRAPPER_STATUSES, "Wrapper status"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return runAction(() => setWrapperStatus(data.id, data.line, data.status));
	});

export const assignRider = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const phone = text(source, "riderPhone", {
			label: "Rider’s phone",
			max: 20,
			required: false,
		});
		if (phone && !/^\+?[\d\s().-]{7,20}$/.test(phone))
			throw new InputError("Use a mobile number like 0917 123 4567.");
		return {
			id: text(source, "id", { max: 64 }),
			name: text(source, "riderName", {
				label: "Rider’s name",
				max: 60,
				required: false,
			}),
			phone,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return runAction(() => setRider(data.id, data));
	});

export const uploadDeliveryPhoto = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const id = input.get("id");
		const file = input.get("file");
		if (typeof id !== "string" || !id) throw new InputError("Missing order.");
		if (!(file instanceof File)) throw new InputError("Choose a photo.");
		return { id, file };
	})
	.handler(async ({ data }): Promise<OrderActionResult> => {
		await requireStaff();
		let fileName: string;
		try {
			fileName = await saveImage("delivery", data.file);
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false, message: error.message };
			throw error;
		}
		try {
			const { order, replaced } = setDeliveryPhoto(data.id, fileName);
			if (replaced) await deleteUpload("delivery", replaced);
			return { ok: true, order };
		} catch (error) {
			await deleteUpload("delivery", fileName);
			if (error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});

export type ChatOrderResult =
	| { ok: true; id: string; number: string }
	| { ok: false; message: string };

/**
 * An order taken in a chat (Messenger, Telegram…), added by staff: the
 * customer's message as its notes, their photos, the agreed total and what
 * they've paid so far. It holds no flowers or wrappers from stock.
 */
export const createChatOrderFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const field = (key: string) => {
			const value = input.get(key);
			return typeof value === "string" ? value : "";
		};
		const message = field("message").trim();
		if (!message) throw new InputError("Paste the customer’s message.");
		if (message.length > CHAT_MESSAGE_MAX)
			throw new InputError(
				`Keep the message under ${CHAT_MESSAGE_MAX.toLocaleString()} characters.`,
			);
		const total = Number(field("total"));
		if (!Number.isFinite(total) || total <= 0)
			throw new InputError("Enter the order’s total.");
		if (total > 1_000_000) throw new InputError("The total is too large.");
		const paid = field("paid").trim() === "" ? 0 : Number(field("paid"));
		if (!Number.isFinite(paid) || paid < 0)
			throw new InputError("Paid so far must be zero or more.");
		if (paid > total)
			throw new InputError("Paid so far can’t be more than the total.");
		const method = field("method");
		if (!isPaymentMethod(method))
			throw new InputError("Choose how the customer pays.");
		const photos = input
			.getAll("photos")
			.filter((file): file is File => file instanceof File && file.size > 0);
		if (photos.length > CHAT_PHOTOS_MAX)
			throw new InputError(`Add up to ${CHAT_PHOTOS_MAX} photos.`);
		return {
			message,
			total: Math.round(total * 100) / 100,
			paid: Math.round(paid * 100) / 100,
			method: method as PaymentMethod,
			photos,
		};
	})
	.handler(async ({ data }): Promise<ChatOrderResult> => {
		await requireStaff();
		const saved: string[] = [];
		try {
			// Served like shoppers' reference photos, under random names.
			for (const photo of data.photos)
				saved.push(await saveImage("references", photo));
			const id = crypto.randomUUID();
			const photoUrls = saved.map((file) =>
				publicUploadUrl("references", file),
			);
			const order = createOrder({
				id,
				details: parseCheckoutDetails({ notes: data.message }),
				cart: {
					lines: [
						{
							productId: CUSTOM_PRODUCT_ID,
							variantId: `chat-${id}`,
							title: "Custom order",
							colorName: "From chat",
							sku: "Custom",
							image: photoUrls[0] ?? CUSTOM_IMAGE,
							// No flowers or wrapper: they're described in the message.
							custom: {
								items: [],
								wrapperId: "",
								...(photoUrls.length ? { referenceImages: photoUrls } : {}),
							},
							quantity: 1,
							unitPrice: data.total,
							lineTotal: data.total,
							maxQuantity: 1,
						},
					],
					subtotal: data.total,
					deliveryFee: 0,
					total: data.total,
					currency: "PHP",
					itemCount: 1,
				},
				payment: {
					method: data.method,
					// Paid in full is settled; anything owing waits like any unpaid order.
					status: data.paid >= data.total ? "verified" : "on_hold",
					amountPaid: data.paid,
				},
			});
			return { ok: true, id: order.id, number: order.number };
		} catch (error) {
			for (const file of saved) await deleteUpload("references", file);
			if (error instanceof UploadError || error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});
