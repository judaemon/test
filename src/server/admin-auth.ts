import { getRequestHeaders } from "@tanstack/solid-start/server";

import {
	can,
	type Permission,
	permissionInfo,
	type RoleRef,
} from "~/lib/permissions";
import { getAuth } from "./auth";
import { accessOfUser } from "./roles-repo";

export interface StaffUser {
	id: string;
	name: string;
	email: string;
	/** Their roles, Owner first. Can be none: then they can only see Account. */
	roles: RoleRef[];
	/** Holds the Owner role: can do everything. */
	isOwner: boolean;
	/** Everything their roles allow together. */
	permissions: Permission[];
	/** Their profile picture's address, when the account has one. */
	image?: string;
}

/**
 * Better-auth's role only says whether an account is staff ("user"; "admin"
 * from before roles) or a customer. What staff can do comes from their
 * roles (Admin → Roles).
 */
export const isStaffAuthRole = (role: string | null | undefined) =>
	role === "user" || role === "admin";

/** The signed-in staff member for this request, or null. */
export async function getStaffUser(): Promise<StaffUser | null> {
	const auth = await getAuth();
	const session = await auth.api.getSession({
		headers: new Headers(getRequestHeaders() as HeadersInit),
	});
	if (!session || session.user.banned) return null;
	// Explicit allow-list: customers (and any unknown role) never get in.
	if (!isStaffAuthRole(session.user.role)) return null;
	return {
		id: session.user.id,
		name: session.user.name,
		email: session.user.email,
		...accessOfUser(session.user.id),
		image: session.user.image || undefined,
	};
}

export class AuthError extends Error {}

/** For things every signed-in staff member can do, like changing their password. */
export async function requireStaff() {
	const user = await getStaffUser();
	if (!user) throw new AuthError("Please sign in again.");
	return user;
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Guards an admin server function: the person needs this permission, or one
 * of these. The UI hiding a button is not enough.
 */
export async function requirePermission(
	...keys: [Permission, ...Permission[]]
) {
	const user = await requireStaff();
	if (!keys.some((key) => can(user, key)))
		throw new AuthError(
			`You don’t have permission to ${lower(permissionInfo(keys[0]).label)}. Ask an owner if you need to.`,
		);
	return user;
}
