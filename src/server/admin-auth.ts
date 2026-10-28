import { getRequestHeaders } from "@tanstack/solid-start/server";

import { getAuth } from "./auth";

export type StaffRole = "owner" | "staff";

export interface StaffUser {
	id: string;
	name: string;
	email: string;
	role: StaffRole;
}

const STAFF_ROLES: Record<string, StaffRole> = {
	admin: "owner",
	user: "staff",
};

/** The signed-in staff member for this request, or null. */
export async function getStaffUser(): Promise<StaffUser | null> {
	const auth = await getAuth();
	const session = await auth.api.getSession({
		headers: new Headers(getRequestHeaders() as HeadersInit),
	});
	if (!session || session.user.banned) return null;
	// Explicit allow-list: customers (and any unknown role) never get in.
	const role = STAFF_ROLES[session.user.role ?? ""];
	if (!role) return null;
	return {
		id: session.user.id,
		name: session.user.name,
		email: session.user.email,
		role,
	};
}

export class AuthError extends Error {}

/** Guards every admin server function; the UI hiding a button is not enough. */
export async function requireStaff() {
	const user = await getStaffUser();
	if (!user) throw new AuthError("Please sign in again.");
	return user;
}

export async function requireOwner() {
	const user = await requireStaff();
	if (user.role !== "owner")
		throw new AuthError("Only the shop owner can do that.");
	return user;
}
