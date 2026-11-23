import { createFileRoute } from "@tanstack/solid-router";

import { canAny } from "~/lib/permissions";
import { getStaffUser } from "~/server/admin-auth";
import { cleanOriginal } from "~/server/photo-watermarks";

// The clean, unwatermarked version of a bouquet photo, by its id, for staff
// re-stamping photos in the admin. Never public: the shop only shows the
// watermarked copy.
export const Route = createFileRoute("/api/admin/photo-originals/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const user = await getStaffUser();
				if (!user) return new Response("Unauthorized", { status: 401 });
				// For re-stamping watermarks on the arrangement pages.
				if (!canAny(user, ["catalog.arrangements", "catalog.originals"]))
					return new Response("Forbidden", { status: 403 });
				const id = params._splat ?? "";
				const file = /^[a-z0-9-]+$/.test(id) ? await cleanOriginal(id) : null;
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
