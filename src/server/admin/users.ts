import { createServerFn } from "@tanstack/solid-start";
import { requireStaff } from "../admin-auth";
import { getDb } from "../db";

export interface ShopUser {
	id: string;
	name: string;
	email: string;
	createdAt: string;
	/** Orders placed while signed in. */
	orders: number;
	lastOrderAt: string | null;
}

/** Everyone who made an account on the shop, newest first. Staff aren't here. */
export const listShopUsers = createServerFn({ method: "GET" }).handler(
	async (): Promise<ShopUser[]> => {
		await requireStaff();
		return getDb()
			.query(
				`SELECT u.id, u.name, u.email, u.createdAt AS createdAt,
				        COUNT(o.id) AS orders, MAX(o.created_at) AS lastOrderAt
				   FROM "user" u
				   LEFT JOIN orders o ON o.customer_id = u.id
				  WHERE coalesce(u.role, 'customer') NOT IN ('admin', 'user')
				  GROUP BY u.id
				  ORDER BY u.createdAt DESC`,
			)
			.all() as ShopUser[];
	},
);
