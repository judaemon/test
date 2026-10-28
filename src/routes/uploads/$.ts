import { createFileRoute } from "@tanstack/solid-router";

import {
	PUBLIC_UPLOAD_KINDS,
	readUpload,
	type UploadKind,
} from "~/server/uploads";

// Product photos and payment QR codes uploaded from the admin.
export const Route = createFileRoute("/uploads/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const [kind, fileName, ...rest] = (params._splat ?? "").split("/");
				if (
					rest.length > 0 ||
					!fileName ||
					!PUBLIC_UPLOAD_KINDS.includes(kind as UploadKind)
				) {
					return new Response("Not found", { status: 404 });
				}
				const file = await readUpload(kind as UploadKind, fileName);
				if (!file) return new Response("Not found", { status: 404 });
				return new Response(file.bytes, {
					headers: {
						"Content-Type": file.contentType,
						// Names are random and never reused, so they can be cached forever.
						"Cache-Control": "public, max-age=31536000, immutable",
						"X-Content-Type-Options": "nosniff",
					},
				});
			},
		},
	},
});
