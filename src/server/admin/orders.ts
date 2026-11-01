import { createServerFn } from "@tanstack/solid-start";
import type { Order, OrderStage } from "~/types/order";
import { requireStaff } from "../admin-auth";
import {
	getOrderById,
	listOrders,
	type OrderFilter,
	OrderRuleError,
	reviewPayment,
	setDeliveryPhoto,
	setOrderStage,
	setOrderTest,
	setRider,
} from "../orders-repo";
import { deleteUpload, saveImage, UploadError } from "../uploads";
import { asRecord, InputError, oneOf, text } from "../validate";

const ALL_STAGES = [
	"new",
	"making",
	"done",
	"cancelled",
] as const satisfies readonly OrderStage[];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type OrderActionResult =
	| { ok: true; order: Order }
	| { ok: false; message: string };

export const listAdminOrders = createServerFn({ method: "GET" })
	.validator((input: unknown): OrderFilter => {
		const source = asRecord(input ?? {});
		const date = typeof source.date === "string" ? source.date : undefined;
		const fromDate =
			typeof source.fromDate === "string" ? source.fromDate : undefined;
		return {
			date: date && DATE.test(date) ? date : undefined,
			fromDate: fromDate && DATE.test(fromDate) ? fromDate : undefined,
			stages: Array.isArray(source.stages)
				? source.stages.map((stage) => oneOf(stage, ALL_STAGES, "Stage"))
				: undefined,
			needsVerification: source.needsVerification === true,
			onHold: source.onHold === true,
			test: source.test === "only" ? "only" : undefined,
			search:
				typeof source.search === "string"
					? source.search.trim().slice(0, 80) || undefined
					: undefined,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return listOrders(data);
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
			decision: oneOf(source.decision, ["verified", "rejected"] as const),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		return runAction(() => reviewPayment(data.id, data.decision, user.name));
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
