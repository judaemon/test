import { createFileRoute } from "@tanstack/solid-router";
import { zipSync } from "fflate";

import { productPhotoId } from "~/lib/photos";
import { shopNow } from "~/lib/time";
import { getStaffUser } from "~/server/admin-auth";
import { listAdminProducts } from "~/server/catalog-repo";
import { cleanOriginal } from "~/server/photo-watermarks";
import { listUploads, readUpload, stripExtension } from "~/server/uploads";

const EXTENSIONS: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

/** Safe in a zip path on any computer. */
const safeName = (name: string) =>
	name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Untitled";

/**
 * Every signature bouquet photo without its watermark, as a zip, for the
 * owner to keep off the server: `<bouquet>/<style> <n>.jpg`, plus clean
 * originals no bouquet uses any more under `Not in use/`.
 */
export const Route = createFileRoute("/api/admin/photo-backup")({
	server: {
		handlers: {
			GET: async () => {
				const user = await getStaffUser();
				if (user?.role !== "owner")
					return new Response("Only the shop owner can do that.", {
						status: 403,
					});

				const files: Record<string, Uint8Array> = {};
				const used = new Set<string>();
				for (const product of listAdminProducts()) {
					for (const variant of product.variants) {
						for (const [index, url] of variant.images.entries()) {
							const id = productPhotoId(url);
							if (!id) continue;
							used.add(id);
							const clean = await cleanOriginal(id);
							if (!clean) continue;
							const ext = EXTENSIONS[clean.contentType] ?? "jpg";
							files[
								`${safeName(product.title)}/${safeName(variant.colorName)} ${index + 1}.${ext}`
							] = new Uint8Array(clean.bytes);
						}
					}
				}
				for (const name of await listUploads("originals")) {
					const id = stripExtension(name);
					if (used.has(id)) continue;
					const file = await readUpload("originals", name);
					if (file) files[`Not in use/${name}`] = new Uint8Array(file.bytes);
				}

				// Photos are already compressed; storing them is as small and far faster.
				const zip = zipSync(files, { level: 0 });
				return new Response(zip, {
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": `attachment; filename="oraia-original-photos-${shopNow().date}.zip"`,
						"Cache-Control": "private, no-store",
					},
				});
			},
		},
	},
});
