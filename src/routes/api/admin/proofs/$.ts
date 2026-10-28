import { createFileRoute } from "@tanstack/solid-router";

import { getStaffUser } from "~/server/admin-auth";
import { readUpload } from "~/server/uploads";

// Payment screenshots contain customers' account details: staff only.
export const Route = createFileRoute("/api/admin/proofs/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!(await getStaffUser()))
					return new Response("Unauthorized", { status: 401 });
				const file = await readUpload("proofs", params._splat ?? "");
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
