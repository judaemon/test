import { getRequestHeaders } from "@tanstack/solid-start/server";

import type { OrderActor } from "~/lib/order-log";
import type { SessionUser } from "~/types/account";
import type { StaffUser } from "./admin-auth";

/** The page a request came from, by its path; the browser sends it as the referrer. */
function requestSource(): string | undefined {
	const referer = new Headers(getRequestHeaders() as HeadersInit).get(
		"referer",
	);
	if (!referer) return undefined;
	try {
		return new URL(referer).pathname.slice(0, 200);
	} catch {
		return undefined;
	}
}

/** A staff member making a change in Admin. */
export function staffActor(user: StaffUser): OrderActor {
	return {
		type: "staff",
		name: user.name,
		userId: user.id,
		source: requestSource(),
	};
}

/**
 * Whoever changed the order from the shop: the signed-in account if there is
 * one (staff ordering for someone count as staff), else the name on the order.
 */
export function shopActor(
	viewer: SessionUser | null,
	nameOnOrder: string,
): OrderActor {
	return {
		type: viewer?.isStaff ? "staff" : "customer",
		name: viewer?.name || nameOnOrder || "Customer",
		userId: viewer?.id,
		source: requestSource(),
	};
}
