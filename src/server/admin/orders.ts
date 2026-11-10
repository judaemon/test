import { createServerFn } from "@tanstack/solid-start";
import {
	attachMessages,
	type BouquetMessageErrors,
	lineKey,
} from "~/lib/bouquet-messages";
import {
	CHAT_MESSAGE_MAX,
	CHAT_PHOTOS_MAX,
	CONTACT_PLATFORM_LABELS,
	CONTACT_PLATFORMS,
	type ContactPlatform,
	isChatOrder,
} from "~/lib/chat-order";
import {
	type CheckoutDetails,
	type FieldErrors,
	hasErrors,
	parseCheckoutDetails,
	validateCheckoutDetails,
} from "~/lib/checkout";
import { CUSTOM_IMAGE, CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import { validateOrdersSearch } from "~/lib/order-filters";
import {
	isMethodAllowedFor,
	isPaymentMethod,
	normalizeReferenceNumber,
	type PaymentMethod,
	validateStaffReferenceNumber,
} from "~/lib/payment";
import type { PricedLine } from "~/lib/pricing";
import {
	BOARD_STAGES,
	CANCEL_REASON_MAX,
	canStartMaking,
	type Order,
	PAYMENT_CHANGE_REASON_MAX,
	PAYMENT_STATUSES,
	WRAPPER_STATUSES,
} from "~/types/order";
import type { RecipeItem } from "~/types/product";
import { requireStaff } from "../admin-auth";
import { getFlorist } from "../florists-repo";
import { staffActor } from "../order-actor";
import { listOrderLog } from "../order-log-repo";
import {
	addOrderNote,
	deleteOrderNote,
	editOrderNote,
	getOrderNote,
	listOrderNotes,
	ORDER_NOTE_MAX,
	type OrderNote,
} from "../order-notes-repo";
import { matchingOrderRows, queryOrderRows } from "../order-rows";
import {
	assignFlorist,
	type BouquetRef,
	cancelBouquet,
	cancelOrder,
	changePaymentMethod,
	createOrder,
	getOrderById,
	OrderRuleError,
	reviewPayment,
	setDeliveryPhoto,
	setOrderStage,
	setOrderTest,
	setReferenceNumber,
	setRider,
	setWrapperStatus,
	statusWithReference,
	updateChatOrder,
	updateShopOrderDetails,
} from "../orders-repo";
import { parseRecipe } from "../recipe-input";
import {
	deleteUpload,
	deleteUploadById,
	publicUploadUrl,
	saveImage,
	UploadError,
} from "../uploads";
import { asRecord, InputError, integer, oneOf, text } from "../validate";
import { getWrapper } from "../wrappers-repo";

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
			stage: oneOf(source.stage, BOARD_STAGES, "Stage"),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		return runAction(() =>
			setOrderStage(data.id, data.stage, staffActor(user)),
		);
	});

/** The order, reason and optional photo that a cancellation or payment change carries. */
function parseReasonForm(input: unknown, maxReason: number) {
	if (!(input instanceof FormData)) throw new Error("Expected form data");
	const proof = input.get("proof");
	const reason = input.get("reason");
	return {
		form: input,
		id: text({ id: input.get("id") }, "id", { max: 64 }),
		// Forms send line breaks as \r\n; the box counted them as one character.
		reason: text(
			{
				reason:
					typeof reason === "string" ? reason.replace(/\r\n?/g, "\n") : "",
			},
			"reason",
			{ label: "A reason", max: maxReason },
		),
		proof: proof instanceof File && proof.size > 0 ? proof : undefined,
	};
}

const parseCancellation = (input: unknown) =>
	parseReasonForm(input, CANCEL_REASON_MAX);

/** Saves the photo, runs the change, and removes the photo if it's refused. */
async function withProof(
	kind: "cancellations" | "proofs",
	proof: File | undefined,
	change: (proofFile: string | undefined) => Order,
): Promise<OrderActionResult> {
	let proofFile: string | undefined;
	try {
		if (proof) proofFile = await saveImage(kind, proof);
	} catch (error) {
		if (error instanceof UploadError)
			return { ok: false, message: error.message };
		throw error;
	}
	try {
		return { ok: true, order: change(proofFile) };
	} catch (error) {
		if (proofFile) await deleteUpload(kind, proofFile);
		if (error instanceof OrderRuleError)
			return { ok: false, message: error.message };
		throw error;
	}
}

/** Cancels the whole order. A reason is required; the photo is optional. */
export const cancelOrderFn = createServerFn({ method: "POST" })
	.validator(parseCancellation)
	.handler(async ({ data }): Promise<OrderActionResult> => {
		const user = await requireStaff();
		return withProof("cancellations", data.proof, (proofFile) =>
			cancelOrder(
				data.id,
				{ reason: data.reason, cancelledBy: user.name, proofFile },
				staffActor(user),
			),
		);
	});

/** Cancels one bouquet from an order; the rest of it carries on. */
export const cancelBouquetFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const parsed = parseCancellation(input);
		return {
			...parsed,
			lineKey: text({ lineKey: parsed.form.get("lineKey") }, "lineKey", {
				max: 300,
			}),
			unit: Number(parsed.form.get("unit")),
		};
	})
	.handler(async ({ data }): Promise<OrderActionResult> => {
		const user = await requireStaff();
		return withProof("cancellations", data.proof, (proofFile) =>
			cancelBouquet(
				data.id,
				{
					lineKey: data.lineKey,
					unit: data.unit,
					reason: data.reason,
					cancelledBy: user.name,
					proofFile,
				},
				staffActor(user),
			),
		);
	});

/**
 * Switches how the order is paid. A reason and a photo as proof are both
 * required, so reports can be trusted; both are staff-only, and the photo is
 * kept with the payment screenshots.
 */
export const changePaymentMethodFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const parsed = parseReasonForm(input, PAYMENT_CHANGE_REASON_MAX);
		const method = parsed.form.get("method");
		if (!isPaymentMethod(method))
			throw new InputError("Choose how the order is paid.");
		if (!parsed.proof)
			throw new InputError("Add a photo of the payment as proof.");
		return { ...parsed, method, proof: parsed.proof };
	})
	.handler(async ({ data }): Promise<OrderActionResult> => {
		const user = await requireStaff();
		return withProof("proofs", data.proof, (proofFile) =>
			changePaymentMethod(
				data.id,
				{
					method: data.method,
					reason: data.reason,
					changedBy: user.name,
					// withProof saved it, as one was required.
					proofFile: proofFile as string,
				},
				staffActor(user),
			),
		);
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
		const user = await requireStaff();
		return runAction(() =>
			setOrderTest(data.id, data.isTest, staffActor(user)),
		);
	});

/** Reads a reference number staff typed; empty means none. Throws if malformed. */
function staffReferenceNumber(value: unknown) {
	const raw = typeof value === "string" ? value : "";
	const problem = validateStaffReferenceNumber(raw);
	if (problem) throw new InputError(problem);
	return normalizeReferenceNumber(raw) || undefined;
}

/** Staff add, fix or remove an order's reference number. */
export const setReferenceNumberFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			referenceNumber: staffReferenceNumber(source.referenceNumber),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		return runAction(() =>
			setReferenceNumber(data.id, data.referenceNumber, staffActor(user)),
		);
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
		return runAction(() =>
			reviewPayment(data.id, data.status, user.name, staffActor(user)),
		);
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
		const user = await requireStaff();
		return runAction(() =>
			setWrapperStatus(data.id, data.line, data.status, staffActor(user)),
		);
	});

/** Most bouquets one "Assign" can change: every bouquet a filter could match. */
const ASSIGN_MAX = 5000;

/** A florist who can be given bouquets, or "" to take bouquets off whoever has them. */
function assignableFlorist(id: string) {
	if (!id) return "";
	const florist = getFlorist(id);
	if (!florist)
		throw new InputError("That florist was deleted. Reload the page.");
	if (!florist.active)
		throw new InputError(
			`${florist.name} is turned off. Turn them on in Florists to give them bouquets.`,
		);
	return florist.id;
}

function assignedMessage(
	result: { changed: number; skipped: number },
	floristId: string,
) {
	const name = floristId ? (getFlorist(floristId)?.name ?? "") : "";
	const count = `${result.changed} ${result.changed === 1 ? "bouquet" : "bouquets"}`;
	return [
		result.changed === 0
			? "Nothing to change."
			: floristId
				? `${count} given to ${name}.`
				: `${count} taken off their florist.`,
		result.skipped
			? `${result.skipped} skipped: cancelled, or no longer on the order.`
			: "",
	]
		.filter(Boolean)
		.join(" ");
}

/** Gives the chosen bouquets (rows of the orders table) to a florist. */
export const assignFloristFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		if (!Array.isArray(source.bouquets) || !source.bouquets.length)
			throw new InputError("Choose at least one bouquet.");
		if (source.bouquets.length > ASSIGN_MAX)
			throw new InputError(`Choose up to ${ASSIGN_MAX} bouquets at a time.`);
		return {
			floristId: text(source, "floristId", { max: 64, required: false }),
			bouquets: source.bouquets.map((item): BouquetRef => {
				const ref = asRecord(item);
				return {
					orderId: text(ref, "orderId", { max: 64 }),
					lineKey: text(ref, "lineKey", { max: 300 }),
					unit: integer(ref, "unit", { label: "Bouquet", min: 0, max: 500 }),
				};
			}),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const floristId = assignableFlorist(data.floristId);
		const result = assignFlorist(data.bouquets, floristId, staffActor(user));
		return { ...result, message: assignedMessage(result, floristId) };
	});

/** Gives every bouquet the orders table's filters match (all pages) to a florist. */
export const assignFloristMatchingFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			floristId: text(source, "floristId", { max: 64, required: false }),
			search: validateOrdersSearch(asRecord(source.search ?? {})),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const floristId = assignableFlorist(data.floristId);
		const rows = matchingOrderRows(data.search).filter(
			(row) => row.order.stage !== "cancelled",
		);
		if (rows.length > ASSIGN_MAX)
			throw new InputError(
				`That's ${rows.length} bouquets. Narrow the filters to ${ASSIGN_MAX} or fewer.`,
			);
		const result = assignFlorist(
			rows.map((row) => ({
				orderId: row.order.id,
				lineKey: lineKey(row.line),
				unit: row.unit,
			})),
			floristId,
			staffActor(user),
		);
		return { ...result, message: assignedMessage(result, floristId) };
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
		const user = await requireStaff();
		return runAction(() => setRider(data.id, data, staffActor(user)));
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
		const user = await requireStaff();
		let fileName: string;
		try {
			fileName = await saveImage("delivery", data.file);
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false, message: error.message };
			throw error;
		}
		try {
			const { order, replaced } = setDeliveryPhoto(
				data.id,
				fileName,
				staffActor(user),
			);
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
	| { ok: false; message: string; fieldErrors?: FieldErrors };

/** Reads the Add / Edit custom order form; throws on anything malformed. */
function parseChatOrderForm(input: unknown) {
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
	const referenceNumber = staffReferenceNumber(field("referenceNumber"));
	if (
		!(CONTACT_PLATFORMS as readonly string[]).includes(field("contactPlatform"))
	)
		throw new InputError("Choose where the customer contacted you.");
	const contactPlatform = field("contactPlatform") as ContactPlatform;
	const photos = input
		.getAll("photos")
		.filter((file): file is File => file instanceof File && file.size > 0);
	// Photos already on the order that staff kept (editing only).
	const keptPhotos = input
		.getAll("keptPhotos")
		.filter((url): url is string => typeof url === "string");
	if (photos.length + keptPhotos.length > CHAT_PHOTOS_MAX)
		throw new InputError(`Add up to ${CHAT_PHOTOS_MAX} photos.`);
	// The same customer details checkout asks for; the message is the notes.
	const details: CheckoutDetails = parseCheckoutDetails({
		...Object.fromEntries(
			[...input.entries()].filter(([, value]) => typeof value === "string"),
		),
		notes: message,
	});
	let recipeRows: unknown = [];
	try {
		recipeRows = JSON.parse(field("recipe") || "[]");
	} catch {
		throw new InputError("Check the flowers.");
	}
	return {
		details,
		// What it's made of, for Reports → Flowers to buy; optional. Checked
		// against Admin → Flowers on the server, in checkChatOrder.
		recipeRows,
		wrapperId: field("wrapperId").slice(0, 64),
		total: Math.round(total * 100) / 100,
		paid: Math.round(paid * 100) / 100,
		method: method as PaymentMethod,
		referenceNumber,
		contactPlatform,
		photos,
		keptPhotos,
	};
}
type ChatOrderForm = ReturnType<typeof parseChatOrderForm>;

/**
 * Checkout's checks on the customer, and the wrapper picked. Returns what's
 * wrong, or the wrapper (null when none was picked). `keepWrapperId` is the
 * wrapper an order being edited already holds, so it isn't "out of stock".
 */
function checkChatOrder(data: ChatOrderForm, keepWrapperId?: string) {
	// A pasted chat runs longer than checkout's notes allow; that's fine here.
	const { notes: _notes, ...fieldErrors } = validateCheckoutDetails(
		data.details,
	);
	if (hasErrors(fieldErrors))
		return {
			problem: {
				ok: false as const,
				message: "Please check the highlighted fields.",
				fieldErrors,
			},
		};
	const wrapper = data.wrapperId ? getWrapper(data.wrapperId) : null;
	if (data.wrapperId && !wrapper)
		return {
			problem: {
				ok: false as const,
				message: "That wrapper was deleted. Pick another.",
			},
		};
	if (wrapper?.stock === 0 && wrapper.id !== keepWrapperId)
		return {
			problem: {
				ok: false as const,
				message: `${wrapper.name} wrappers are out of stock. Pick another, or add stock in Wrappers.`,
			},
		};
	let recipe: RecipeItem[];
	try {
		recipe = parseRecipe(data.recipeRows, "Flowers");
	} catch (error) {
		if (error instanceof InputError)
			return { problem: { ok: false as const, message: error.message } };
		throw error;
	}
	return { wrapper, recipe };
}

/** The order's one bouquet line: the flowers are described in the message. */
function chatOrderLine(
	orderId: string,
	data: ChatOrderForm,
	wrapper: ReturnType<typeof getWrapper>,
	recipe: RecipeItem[],
	photoUrls: string[],
	previous?: PricedLine,
): PricedLine {
	return {
		productId: CUSTOM_PRODUCT_ID,
		variantId: `chat-${orderId}`,
		title: "Custom order",
		colorName: `From ${CONTACT_PLATFORM_LABELS[data.contactPlatform]}`,
		contactPlatform: data.contactPlatform,
		sku: "Custom",
		image: photoUrls[0] ?? CUSTOM_IMAGE,
		...(wrapper
			? { colorHex: wrapper.colorHex, wrapperColor: wrapper.name }
			: {}),
		// How far the wrapper is, while it's still the same wrapper.
		...(previous?.wrapperStatus &&
		previous.custom?.wrapperId === (wrapper?.id ?? "")
			? { wrapperStatus: previous.wrapperStatus }
			: {}),
		// The wrapper, if picked, comes out of stock like a built bouquet's.
		custom: {
			items: [],
			wrapperId: wrapper?.id ?? "",
			...(photoUrls.length ? { referenceImages: photoUrls } : {}),
		},
		...(recipe.length ? { recipe } : {}),
		quantity: 1,
		unitPrice: data.total,
		lineTotal: data.total,
		maxQuantity: 1,
	};
}

/**
 * An order taken in a chat (Messenger, Telegram…), added by staff: the
 * customer's details, their message as its notes, their photos, the wrapper,
 * the agreed total and what they've paid so far.
 */
export const createChatOrderFn = createServerFn({ method: "POST" })
	.validator(parseChatOrderForm)
	.handler(async ({ data }): Promise<ChatOrderResult> => {
		const user = await requireStaff();
		const checked = checkChatOrder(data);
		if (checked.problem) return checked.problem;
		const saved: string[] = [];
		try {
			// Served like shoppers' reference photos, under random names.
			for (const photo of data.photos)
				saved.push(await saveImage("references", photo));
			const id = crypto.randomUUID();
			const line = chatOrderLine(
				id,
				data,
				checked.wrapper,
				checked.recipe,
				saved.map((file) => publicUploadUrl("references", file)),
			);
			const order = createOrder(
				{
					id,
					details: data.details,
					cart: {
						lines: [line],
						subtotal: data.total,
						deliveryFee: 0,
						total: data.total,
						currency: "PHP",
						itemCount: 1,
					},
					payment: {
						method: data.method,
						// Paid in full is settled; anything owing waits like any unpaid
						// order, or for staff to check its reference number.
						status:
							data.paid >= data.total
								? "verified"
								: statusWithReference("on_hold", data.referenceNumber),
						amountPaid: data.paid,
						referenceNumber: data.referenceNumber,
					},
				},
				staffActor(user),
			);
			return { ok: true, id: order.id, number: order.number };
		} catch (error) {
			for (const file of saved) await deleteUpload("references", file);
			if (error instanceof UploadError || error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});

/** A chat order as the Edit custom order form starts from. */
export const getChatOrderAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		const order = getOrderById(data);
		return order && isChatOrder(order) ? order : null;
	});

/** Saves changes to an order staff added from a chat. */
export const updateChatOrderFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const id = input instanceof FormData ? input.get("id") : null;
		if (typeof id !== "string" || !id) throw new InputError("Missing order.");
		return { id, form: parseChatOrderForm(input) };
	})
	.handler(async ({ data }): Promise<ChatOrderResult> => {
		const user = await requireStaff();
		const order = getOrderById(data.id);
		const previous = order?.lines[0];
		if (!order || !previous || !isChatOrder(order))
			return { ok: false, message: "That order can’t be edited here." };
		if (data.form.method !== order.payment.method)
			return {
				ok: false,
				message:
					"Change the payment method with Change payment method on the order page. It needs a reason and proof.",
			};
		const checked = checkChatOrder(data.form, previous.custom?.wrapperId);
		if (checked.problem) return checked.problem;
		const existing = previous.custom?.referenceImages ?? [];
		// Only photos the order already has can be kept.
		const kept = existing.filter((url) => data.form.keptPhotos.includes(url));
		const { paid, total } = data.form;
		// Paid in full settles it; staff's own payment decisions otherwise stand.
		const status =
			paid >= total
				? "verified"
				: statusWithReference(order.payment.status, data.form.referenceNumber);
		if (order.stage !== "new" && !canStartMaking({ status, amountPaid: paid }))
			return {
				ok: false,
				message:
					"This order is already being made. Keep a down payment, or move it back to New orders first.",
			};
		const saved: string[] = [];
		try {
			for (const photo of data.form.photos)
				saved.push(await saveImage("references", photo));
			const updated = updateChatOrder(
				order.id,
				{
					details: data.form.details,
					line: chatOrderLine(
						order.id,
						data.form,
						checked.wrapper,
						checked.recipe,
						[
							...kept,
							...saved.map((file) => publicUploadUrl("references", file)),
						],
						previous,
					),
					payment: {
						method: data.form.method,
						status,
						amountPaid: paid,
						referenceNumber: data.form.referenceNumber,
					},
				},
				staffActor(user),
			);
			// Photos staff removed are gone from the order; delete their files.
			for (const url of existing.filter((u) => !kept.includes(u))) {
				const name = url.split("/").pop();
				if (name) await deleteUploadById("references", name);
			}
			return { ok: true, id: updated.id, number: updated.number };
		} catch (error) {
			for (const file of saved) await deleteUpload("references", file);
			if (error instanceof UploadError || error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});

export type ShopOrderEditResult =
	| { ok: true }
	| {
			ok: false;
			message: string;
			fieldErrors?: FieldErrors;
			bouquetErrors?: Record<string, BouquetMessageErrors>;
	  };

/**
 * Staff change a shop order's customer, its notes and its cards, at any stage
 * before it's cancelled. Bouquets, prices and payment stay as they are; the
 * order log records each change and who made it.
 */
export const updateShopOrderFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			details: source.details,
			messages: source.messages,
		};
	})
	.handler(async ({ data }): Promise<ShopOrderEditResult> => {
		const user = await requireStaff();
		const order = getOrderById(data.id);
		if (!order) return { ok: false, message: "Order not found." };
		if (isChatOrder(order))
			return { ok: false, message: "Edit this order in its own form." };
		const parsed = parseCheckoutDetails(data.details);
		// The delivery date isn't on this form, and may be past by now.
		const fieldErrors = validateCheckoutDetails({
			...parsed,
			deliveryDate: "",
		});
		if (!isMethodAllowedFor(order.payment.method, parsed.className))
			fieldErrors.className =
				"Cash payment is for cadets only. Change the payment method first.";
		if (hasErrors(fieldErrors))
			return {
				ok: false,
				message: "Please check the highlighted fields.",
				fieldErrors,
			};
		const details: CheckoutDetails = {
			...parsed,
			deliveryDate: order.details.deliveryDate,
		};
		// Cards and notes go on the bouquets the order has; nothing else changes.
		const withMessages = attachMessages(
			order.lines.map(({ messages: _old, ...line }) => line),
			data.messages,
		);
		if (Object.keys(withMessages.errors).length > 0)
			return {
				ok: false,
				message: "Please check the cards and notes.",
				bouquetErrors: withMessages.errors,
			};
		try {
			updateShopOrderDetails(
				order.id,
				{ details, lines: withMessages.lines },
				staffActor(user),
			);
			return { ok: true };
		} catch (error) {
			if (error instanceof OrderRuleError)
				return { ok: false, message: error.message };
			throw error;
		}
	});

/** The order log, newest first: one order's, or every order's. */
export const listOrderLogFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const source = asRecord(input ?? {});
		const page = Number(source.page ?? 1);
		const pageSize = Number(source.pageSize ?? 50);
		return {
			orderId: text(source, "orderId", { max: 64, required: false }),
			actor: text(source, "actor", { max: 120, required: false }),
			page: Number.isInteger(page) && page > 0 ? page : 1,
			pageSize: Number.isInteger(pageSize) ? pageSize : 50,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return listOrderLog({
			orderId: data.orderId || undefined,
			actor: data.actor || undefined,
			page: data.page,
			pageSize: data.pageSize,
		});
	});

export type OrderNotesResult =
	| { ok: true; notes: OrderNote[] }
	| { ok: false; message: string };

/** Staff's notes on an order: never shown to the customer. */
export const listOrderNotesFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => text(asRecord(input), "orderId", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return listOrderNotes(data);
	});

const noteBody = (source: Record<string, unknown>) => {
	const raw = typeof source.body === "string" ? source.body : "";
	// Forms send line breaks as \r\n; the box counted them as one character.
	return text({ body: raw.replace(/\r\n?/g, "\n") }, "body", {
		label: "The note",
		max: ORDER_NOTE_MAX,
	});
};

export const addOrderNoteFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			orderId: text(source, "orderId", { max: 64 }),
			body: noteBody(source),
		};
	})
	.handler(async ({ data }): Promise<OrderNotesResult> => {
		const user = await requireStaff();
		if (!getOrderById(data.orderId))
			return { ok: false, message: "Order not found." };
		addOrderNote(data.orderId, data.body, { id: user.id, name: user.name });
		return { ok: true, notes: listOrderNotes(data.orderId) };
	});

/** Staff change their own notes only. */
export const editOrderNoteFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return { id: text(source, "id", { max: 64 }), body: noteBody(source) };
	})
	.handler(async ({ data }): Promise<OrderNotesResult> => {
		const user = await requireStaff();
		const note = getOrderNote(data.id);
		if (!note) return { ok: false, message: "That note was deleted." };
		if (note.authorId !== user.id)
			return { ok: false, message: "You can only edit your own notes." };
		editOrderNote(data.id, data.body);
		return { ok: true, notes: listOrderNotes(note.orderId) };
	});

/** Staff delete their own notes; the owner can delete any. */
export const deleteOrderNoteFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => text(asRecord(input), "id", { max: 64 }))
	.handler(async ({ data }): Promise<OrderNotesResult> => {
		const user = await requireStaff();
		const note = getOrderNote(data);
		if (!note) return { ok: false, message: "That note was already deleted." };
		if (note.authorId !== user.id && user.role !== "owner")
			return {
				ok: false,
				message: "Only the shop owner can delete someone else’s note.",
			};
		deleteOrderNote(data);
		return { ok: true, notes: listOrderNotes(note.orderId) };
	});
