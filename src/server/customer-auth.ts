import { getRequestHeaders } from "@tanstack/solid-start/server";
import type { SessionUser } from "~/types/account";
import { AuthError } from "./admin-auth";
import { getAuth } from "./auth";

/** Whoever is signed in on the shop (customer or staff), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
	const auth = await getAuth();
	const session = await auth.api.getSession({
		headers: new Headers(getRequestHeaders() as HeadersInit),
	});
	if (!session || session.user.banned) return null;
	return {
		id: session.user.id,
		name: session.user.name,
		email: session.user.email,
		isStaff: session.user.role === "admin" || session.user.role === "user",
	};
}

/** Guards every account server function; data is always scoped to this user. */
export async function requireSessionUser() {
	const user = await getSessionUser();
	if (!user) throw new AuthError("Please sign in again.");
	return user;
}
