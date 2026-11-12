import { createServerFn } from "@tanstack/solid-start";

import {
	cleanWishName,
	SHOP_HEADING_MAX,
	SHOP_MESSAGE_MAX,
	type ShopStatus,
	WISH_NAME_MAX,
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
	| { ok: false; message: string };

/**
 * Public, while the shop is closed: someone leaves their name for a bouquet
 * at the event. `website` is a field people never see; bots fill it in.
 */
export const addShopWishFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			name: typeof source.name === "string" ? source.name.slice(0, 200) : "",
			website: typeof source.website === "string" ? source.website : "",
		};
	})
	.handler(async ({ data }): Promise<WishResult> => {
		const name = cleanWishName(data.name);
		if (!name)
			return {
				ok: false,
				message: `Please enter your name (up to ${WISH_NAME_MAX} characters).`,
			};
		// Looks fine to a bot, but nothing is kept.
		if (data.website) return { ok: true, name };
		if (!getShopStatus().closed)
			return {
				ok: false,
				message: "We’re taking orders again! Order your bouquet in the shop.",
			};
		addShopWish(name);
		return { ok: true, name };
	});

export const deleteShopWishFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => text(asRecord(input), "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		deleteShopWish(data);
		return listShopWishes();
	});
