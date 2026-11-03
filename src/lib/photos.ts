/** Width of the card-sized copy kept beside each product photo. */
export const THUMB_WIDTH = 640;

/** Product photos uploaded in the admin: `/uploads/products/<id>`. */
const PRODUCT_PHOTO = /^\/uploads\/products\/([a-z0-9-]+)$/;

/** The id of an uploaded product photo, or undefined for anything else. */
export const productPhotoId = (url: string) => PRODUCT_PHOTO.exec(url)?.[1];

/**
 * Where to load a photo from. Uploaded product photos get an address ending
 * in `.jpg`, which Cloudflare caches (it goes by the extension), and `thumb`
 * asks for the card-sized copy. The server sends the full photo, uncached,
 * while there's no copy yet. Anything else (bundled images) is unchanged.
 */
export function photoSrc<T extends string | undefined>(
	url: T,
	size: "thumb" | "full" = "full",
): T {
	if (!url || !productPhotoId(url)) return url;
	return (size === "thumb" ? `${url}-w${THUMB_WIDTH}.jpg` : `${url}.jpg`) as T;
}

/**
 * A card-sized JPEG of a photo, made in the browser (which already decodes
 * and turns phone photos the right way up). Photos narrower than the card
 * size are only re-compressed.
 */
export async function makeThumbnail(photo: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(photo, {
		imageOrientation: "from-image",
	});
	const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Couldn’t draw the photo.");
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.8),
	);
	if (!blob) throw new Error("Couldn’t make a smaller copy of the photo.");
	return blob;
}
