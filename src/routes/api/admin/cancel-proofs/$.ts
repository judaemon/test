import { createFileRoute } from "@tanstack/solid-router";

import { getStaffUser } from "~/server/admin-auth";
import { readUpload } from "~/server/uploads";

// Photos staff attach when cancelling an order: staff only.
export const Route = createFileRoute("/api/admin/cancel-proofs/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!(await getStaffUser()))
					return new Response("Unauthorized", { status: 401 });
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
