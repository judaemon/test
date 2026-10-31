import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sniffImageType } from "~/lib/payment";

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? ".data/uploads";

/**
 * Public kinds are served at `/uploads/<kind>/<file>`. Payment proofs are
 * staff-only; delivery photos are for staff and the order's customer.
 */
export type UploadKind = "products" | "payments" | "proofs" | "delivery";
export const PUBLIC_UPLOAD_KINDS: UploadKind[] = ["products", "payments"];

/** Phone photos can be large; cropped uploads come in far smaller. */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const FILE_NAME = /^[a-z0-9-]+\.(png|jpg|webp)$/;
const FILE_ID = /^[a-z0-9-]+$/;
const CONTENT_TYPES = {
	png: "image/png",
	jpg: "image/jpeg",
	webp: "image/webp",
} as const;

export class UploadError extends Error {}

/**
 * Validates an uploaded image by its bytes (not its name or claimed type)
 * and stores it under a random name. Returns the stored file name.
 */
export async function saveImage(
	kind: UploadKind,
	file: File,
	name: string = crypto.randomUUID(),
) {
	if (file.size === 0) throw new UploadError("The file is empty.");
	if (file.size > IMAGE_MAX_BYTES)
		throw new UploadError("Keep images under 20 MB.");
	const bytes = new Uint8Array(await file.arrayBuffer());
	const extension = sniffImageType(bytes.subarray(0, 12));
	if (!extension) throw new UploadError("Use a PNG, JPG or WEBP image.");
	const fileName = `${name}.${extension}`;
	const dir = join(UPLOAD_ROOT, kind);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, fileName), bytes);
	return fileName;
}

/**
 * URLs leave off the extension: Vite's dev server answers any `*.png` request
 * itself (404) before it reaches the app, which would hide uploads in dev.
 */
export function publicUploadUrl(kind: UploadKind, fileName: string) {
	return `/uploads/${kind}/${stripExtension(fileName)}`;
}

export function stripExtension(fileName: string) {
	return fileName.replace(/\.(png|jpg|webp)$/, "");
}

/** Reads an upload by id (`abc-123`) or stored file name (`abc-123.png`). */
export async function readUpload(kind: UploadKind, name: string) {
	// Strict patterns rule out path traversal like "../../.env".
	const candidates = FILE_NAME.test(name)
		? [name]
		: FILE_ID.test(name)
			? Object.keys(CONTENT_TYPES).map((ext) => `${name}.${ext}`)
			: [];
	for (const fileName of candidates) {
		try {
			const bytes = await readFile(join(UPLOAD_ROOT, kind, fileName));
			const extension = fileName.split(".").pop() as keyof typeof CONTENT_TYPES;
			return { bytes, contentType: CONTENT_TYPES[extension] };
		} catch {
			// Try the next extension.
		}
	}
	return null;
}

export async function deleteUpload(kind: UploadKind, fileName: string) {
	if (!FILE_NAME.test(fileName)) return;
	await rm(join(UPLOAD_ROOT, kind, fileName), { force: true });
}
