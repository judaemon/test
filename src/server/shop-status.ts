import { createServerFn } from "@tanstack/solid-start";

import {
	checkWish,
	SHOP_HEADING_MAX,
	SHOP_MESSAGE_MAX,
	SHOP_MODES,
	type ShopStatus,
	type WishField,
} from "~/lib/shop-status";
import { requireOwner, requireStaff } from "./admin-auth";
import { currentEvent, eventOrderCount } from "./events-repo";
import {
	addShopWish,
	deleteShopWish,
	getShopStatus,
	listShopWishes,
	saveShopStatus,
} from "./shop-status-repo";
import { asRecord, oneOf, text } from "./validate";

/** Admin → Interested buyers: the names left on the fully booked page. */
export const listShopWishesFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listShopWishes();
	},
);

/** Admin → Shop: how it runs (from the current event), and the names left. */
export const getShopAdminFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		const event = currentEvent();
		return {
			status: getShopStatus(),
			wishes: listShopWishes(),
			event: event
				? {
						id: event.id,
						name: event.name,
						maxOrders: event.maxOrders,
						orders: eventOrderCount(event.id),
					}
				: null,
		};
	},
);

/**
 * The fully booked message is the owner's to change. The mode is kept as
 * sent, but the shop follows the events whatever it says.
 */
export const saveShopStatusFn = createServerFn({ method: "POST" })
	.validator((input: unknown): ShopStatus => {
		const source = asRecord(input);
		return {
			mode: oneOf(source.mode, SHOP_MODES, "Shop mode"),
			heading: text(source, "heading", {
				label: "The heading",
				max: SHOP_HEADING_MAX,
			}),
			message: text(
				{
					message:
						typeof source.message === "string"
							? source.message.replace(/\r\n?/g, "\n")
							: "",
				},
				"message",
				{ label: "The message", max: SHOP_MESSAGE_MAX },
			),
		};
	})
	.handler(async ({ data }) => {
		await requireOwner();
		return saveShopStatus(data);
	});

export type WishResult =
	| { ok: true; name: string }
	| {
			ok: false;
			message: string;
			errors?: Partial<Record<WishField, string>>;
	  };

/**
 * Public, while the shop is closed: someone signifies interest in buying a
 * bouquet at the event (not an order or a reservation). `website` is a field people never see; bots fill it in.
 */
export const addShopWishFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const short = (key: string) =>
			typeof source[key] === "string"
				? (source[key] as string).slice(0, 200)
				: "";
		return {
			name: short("name"),
			company: short("company"),
			serialNumber: short("serialNumber"),
			date: short("date"),
			website: short("website"),
		};
	})
	.handler(async ({ data }): Promise<WishResult> => {
		const status = getShopStatus();
		const checked = checkWish(data, status.days);
		if (!checked.ok)
			return {
				ok: false,
				message: "Please check the details above.",
				errors: checked.errors,
			};
		const { wish } = checked;
		// Looks fine to a bot, but nothing is kept.
		if (data.website) return { ok: true, name: wish.name };
		const { mode } = status;
		if (mode !== "closed")
			return {
				ok: false,
				message:
					mode === "open"
						? "We’re taking orders again! Order your bouquet in the shop."
						: "The event is over. Thank you! Message us to order a bouquet.",
			};
		addShopWish(wish);
		return { ok: true, name: wish.name };
	});

export const deleteShopWishFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => text(asRecord(input), "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		deleteShopWish(data);
		return listShopWishes();
	});
