import { createServerFn } from "@tanstack/solid-start";
import { getRequestIP } from "@tanstack/solid-start/server";

import { publicUploadUrl, saveImage, UploadError } from "./uploads";

export type ReferenceUploadResult =
	| { ok: true; url: string }
	| { ok: false; message: string };

/** Uploads per visitor per hour; anyone can upload, so this caps the disk use. */
const UPLOADS_PER_HOUR = 20;
const recentUploads = new Map<string, number[]>();

function underUploadLimit(visitor: string) {
	const hourAgo = Date.now() - 60 * 60 * 1000;
	const times = (recentUploads.get(visitor) ?? []).filter((t) => t > hourAgo);
	if (times.length >= UPLOADS_PER_HOUR) return false;
	times.push(Date.now());
	recentUploads.set(visitor, times);
	return true;
}

/** A shopper's photo of a look they like, for a bouquet they're building. */
export const uploadReferenceImage = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const file = input.get("file");
		if (!(file instanceof File)) throw new Error("Expected a file");
		return file;
	})
	.handler(async ({ data }): Promise<ReferenceUploadResult> => {
		if (!underUploadLimit(getRequestIP({ xForwardedFor: true }) ?? "unknown"))
			return {
				ok: false,
				message: "That’s a lot of photos. Please try again in a while.",
			};
		try {
			const fileName = await saveImage("references", data);
			return { ok: true, url: publicUploadUrl("references", fileName) };
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false, message: error.message };
			throw error;
		}
	});
