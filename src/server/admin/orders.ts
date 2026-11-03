import { createServerFn } from "@tanstack/solid-start";
import { validateOrdersSearch } from "~/lib/order-filters";
import {
	type Order,
	type OrderStage,
	PAYMENT_STATUSES,
	WRAPPER_STATUSES,
} from "~/types/order";
import { requireStaff } from "../admin-auth";
import { queryOrderRows } from "../order-rows";
import {
	getOrderById,
	OrderRuleError,
	reviewPayment,
	setDeliveryPhoto,
	setOrderStage,
	setOrderTest,
	setRider,
	setWrapperStatus,
} from "../orders-repo";
import { deleteUpload, saveImage, UploadError } from "../uploads";
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
