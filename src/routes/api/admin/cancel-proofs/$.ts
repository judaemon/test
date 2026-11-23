import { createFileRoute } from "@tanstack/solid-router";

import { can } from "~/lib/permissions";
import { getStaffUser } from "~/server/admin-auth";
import { readUpload } from "~/server/uploads";

// Photos staff attach when cancelling an order: staff only.
export const Route = createFileRoute("/api/admin/cancel-proofs/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const user = await getStaffUser();
				if (!user) return new Response("Unauthorized", { status: 401 });
				if (!can(user, "orders.view"))
					return new Response("Forbidden", { status: 403 });
				const file = await readUpload("cancellations", params._splat ?? "");
				if (!file) return new Response("Not found", { status: 404 });
				return new Response(file.bytes, {
					headers: {
						"Content-Type": file.contentType,
						"Cache-Control": "private, no-store",
						"X-Content-Type-Options": "nosniff",
					},
				});
			},
		},
	},
});
