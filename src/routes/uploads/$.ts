import { createFileRoute } from "@tanstack/solid-router";

import {
	PUBLIC_UPLOAD_KINDS,
	readUpload,
	stripExtension,
	type UploadKind,
} from "~/server/uploads";

/**
 * The file asked for: `<id>`, `<id>.jpg` (whatever the stored extension), or a
 * card-sized copy `<id>-w640.jpg`. A copy that hasn't been made yet is stood
 * in for by the full photo.
 */
async function findUpload(kind: UploadKind, fileName: string) {
	const exact = await readUpload(kind, fileName);
	if (exact) return { file: exact, standIn: false };
	const id = stripExtension(fileName);
	const sized = /^([a-z0-9-]+)-w\d+$/.exec(id);
	const original = await readUpload(kind, sized?.[1] ?? id);
	return original ? { file: original, standIn: !!sized } : null;
}

// Product photos and payment QR codes uploaded from the admin, and shoppers'
// reference photos for built bouquets.
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
				const found = await findUpload(kind as UploadKind, fileName);
				if (!found) return new Response("Not found", { status: 404 });
				return new Response(found.file.bytes, {
					headers: {
						"Content-Type": found.file.contentType,
						// Names are random and never reused, so they can be cached
						// forever; a stand-in for a missing copy mustn't be.
						"Cache-Control": found.standIn
							? "no-store"
							: "public, max-age=31536000, immutable",
						"X-Content-Type-Options": "nosniff",
					},
				});
			},
		},
	},
});
