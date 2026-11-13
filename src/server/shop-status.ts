import { createServerFn } from "@tanstack/solid-start";

import {
	checkWish,
	SHOP_HEADING_MAX,
	SHOP_MESSAGE_MAX,
	type ShopStatus,
	type WishField,
} from "~/lib/shop-status";
import { requireOwner, requireStaff } from "./admin-auth";
import {
	addShopWish,
	deleteShopWish,
	getShopStatus,
	listShopWishes,
	saveShopStatus,
} from "./shop-status-repo";
import { asRecord, text } from "./validate";

/** Admin → Shop: whether it's open, its closed notice, and the names left. */
export const getShopAdminFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return { status: getShopStatus(), wishes: listShopWishes() };
	},
);

/** Opening and closing the shop is the owner's call. */
export const saveShopStatusFn = createServerFn({ method: "POST" })
	.validator((input: unknown): ShopStatus => {
		const source = asRecord(input);
		return {
			closed: source.closed === true,
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
			className: short("className"),
			company: short("company"),
			serialNumber: short("serialNumber"),
			date: short("date"),
			website: short("website"),
		};
	})
	.handler(async ({ data }): Promise<WishResult> => {
		const checked = checkWish(data);
		if (!checked.ok)
			return {
				ok: false,
				message: "Please check the details above.",
				errors: checked.errors,
			};
		const { wish } = checked;
		// Looks fine to a bot, but nothing is kept.
		if (data.website) return { ok: true, name: wish.name };
		if (!getShopStatus().closed)
			return {
				ok: false,
				message: "We’re taking orders again! Order your bouquet in the shop.",
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
