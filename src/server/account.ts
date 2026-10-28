import { createServerFn } from "@tanstack/solid-start";
import { isValidMonthDay } from "~/lib/occasions";
import type { CustomerOrder } from "~/types/order";
import {
	AccountRuleError,
	deleteAddress,
	deleteOccasion,
	listAddresses,
	listOccasions,
	saveAddress,
	saveOccasion,
} from "./account-repo";
import { getSessionUser, requireSessionUser } from "./customer-auth";
import { listCustomerOrders, toCustomerOrder } from "./orders-repo";
import { asRecord, bool, InputError, integer, text } from "./validate";

/** For the root route: who's signed in on the shop (null for guests). */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
	getSessionUser(),
);

export const listMyOrders = createServerFn({ method: "GET" }).handler(
	async (): Promise<CustomerOrder[]> => {
		const user = await requireSessionUser();
		return listCustomerOrders(user.id).map(toCustomerOrder);
	},
);

/** Turns repository rule errors into messages the form can show. */
function friendly<T>(action: () => T): T {
	try {
		return action();
	} catch (error) {
		if (error instanceof AccountRuleError) throw new InputError(error.message);
		throw error;
	}
}

const optionalId = (source: Record<string, unknown>) =>
	typeof source.id === "string" && source.id ? source.id.slice(0, 64) : null;

// ── Addresses ───────────────────────────────────────────────────────────

export const listMyAddresses = createServerFn({ method: "GET" }).handler(
	async () => listAddresses((await requireSessionUser()).id),
);

export const saveMyAddress = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const postalCode = text(source, "postalCode", {
			label: "Postal code",
			max: 10,
		});
		if (!/^[A-Za-z0-9 -]{3,10}$/.test(postalCode))
			throw new InputError("That postal code doesn’t look right.");
		return {
			id: optionalId(source),
			address: {
				label: text(source, "label", { label: "Label", max: 30 }),
				recipientName: text(source, "recipientName", {
					label: "Recipient’s name",
					max: 80,
				}),
				address: text(source, "address", { label: "Street address", max: 160 }),
				city: text(source, "city", { label: "City", max: 80 }),
				postalCode,
				isDefault: bool(source, "isDefault"),
			},
		};
	})
	.handler(async ({ data }) => {
		const user = await requireSessionUser();
		return friendly(() => saveAddress(user.id, data.id, data.address));
	});

export const deleteMyAddress = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const user = await requireSessionUser();
		return friendly(() => deleteAddress(user.id, data.id));
	});

// ── Occasions ───────────────────────────────────────────────────────────

export const listMyOccasions = createServerFn({ method: "GET" }).handler(
	async () => listOccasions((await requireSessionUser()).id),
);

export const saveMyOccasion = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const month = integer(source, "month", { label: "Month", min: 1, max: 12 });
		const day = integer(source, "day", { label: "Day", min: 1, max: 31 });
		if (!isValidMonthDay(month, day))
			throw new InputError("That date doesn’t exist.");
		return {
			id: optionalId(source),
			occasion: {
				title: text(source, "title", { label: "Occasion", max: 60 }),
				month,
				day,
				note: text(source, "note", {
					label: "Note",
					max: 200,
					required: false,
				}),
			},
		};
	})
	.handler(async ({ data }) => {
		const user = await requireSessionUser();
		return friendly(() => saveOccasion(user.id, data.id, data.occasion));
	});

export const deleteMyOccasion = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const user = await requireSessionUser();
		return friendly(() => deleteOccasion(user.id, data.id));
	});
