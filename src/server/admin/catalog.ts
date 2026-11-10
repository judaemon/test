import { createServerFn } from "@tanstack/solid-start";
import { DEFAULT_ARRANGEMENT } from "~/lib/arrangements";
import { productPhotoId, THUMB_WIDTH } from "~/lib/photos";
import { flowerCodeKey, isPhotoTag, PHOTO_CAPTION_MAX } from "~/lib/product";
import { WATERMARK_VERSION } from "~/lib/watermark";
import type { AdminProduct } from "~/types/product";
import { writeActivity } from "../activity-log-repo";
import { bouquetChanges } from "../activity-snapshots";
import { requireStaff } from "../admin-auth";
import { listArrangementTypes } from "../arrangement-types-repo";
import {
	deleteProduct,
	deleteVariant,
	getAdminProduct,
	listAdminProducts,
	type ProductInput,
	reorderProducts,
	saveProduct,
	setProductVisible,
	updateStyle,
	type VariantInput,
} from "../catalog-repo";
import { cloudflareConfigured, purgePaths } from "../cloudflare-cache";
import { staffActor } from "../order-actor";
import {
	cleanOriginal,
	photosNeedingWatermark,
	recordWatermark,
	replacePhoto,
} from "../photo-watermarks";
import { parseRecipe } from "../recipe-input";
import { listSizes } from "../sizes-repo";
import {
	deleteUpload,
	deleteUploadById,
	listUploads,
	moveUploadById,
	publicUploadUrl,
	readUpload,
	saveImage,
	stripExtension,
	UploadError,
} from "../uploads";
import {
	asRecord,
	bool,
	InputError,
	imageUrl,
	integer,
	money,
	oneOf,
	text,
} from "../validate";
import { getWrapper } from "../wrappers-repo";

export const listInventory = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listAdminProducts();
	},
);

/** Every bouquet's name, so the editor can suggest a free one and warn about repeats. */
export const listFlowerCodes = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listAdminProducts().map((product) => ({
			code: product.title,
			productId: product.id,
		}));
	},
);

export const getAdminProductFn = createServerFn({ method: "GET" })
	.validator((id: unknown) => {
		if (typeof id !== "string") throw new Error("Invalid product id");
		return id;
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return getAdminProduct(data) ?? null;
	});

/** Quick edits from the list of bouquets: a style's availability or price. */
export const updateStyleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			productId: text(source, "productId", { max: 80 }),
			variantId: text(source, "variantId", { max: 80 }),
			...(source.isAvailable === undefined
				? {}
				: { isAvailable: bool(source, "isAvailable") }),
			...(source.price === undefined
				? {}
				: { price: money(source, "price", { label: "Price" }) }),
			...(source.readyStock === undefined
				? {}
				: {
						readyStock: stockCount(source, "readyStock", "Ready-made stock"),
					}),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const before = getAdminProduct(data.productId);
		updateStyle(data.productId, data.variantId, data);
		const after = getAdminProduct(data.productId);
		logBouquet(user, "quick_edit", before, after);
		return after ?? null;
	});

/** Logs what changed on an arrangement, if anything did, and who did it. */
function logBouquet(
	user: Awaited<ReturnType<typeof requireStaff>>,
	action: "added" | "edited" | "quick_edit" | "style_deleted",
	before: AdminProduct | undefined | null,
	after: AdminProduct | undefined | null,
) {
	const product = after ?? before;
	if (!product) return;
	const changes = bouquetChanges(before, after);
	if (action !== "added" && changes.length === 0) return;
	writeActivity(
		"bouquets",
		{ id: product.id, name: product.title },
		staffActor(user),
		action,
		changes,
	);
}

/** Quick edit from the list of bouquets: shows or hides it in the shop. */
export const setProductVisibleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			productId: text(source, "productId", { max: 80 }),
			isVisible: bool(source, "isVisible"),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const before = getAdminProduct(data.productId);
		setProductVisible(data.productId, data.isVisible);
		const after = getAdminProduct(data.productId);
		logBouquet(user, "quick_edit", before, after);
		return after ?? null;
	});

function parseVariant(raw: unknown, index: number): VariantInput {
	const source = asRecord(raw);
	const label = `Style ${index + 1}`;
	const colorHex = text(source, "colorHex", {
		label: `${label} swatch`,
		max: 7,
	});
	if (!/^#[0-9a-fA-F]{6}$/.test(colorHex))
		throw new InputError(`${label} swatch must be a color like #f2a6b8.`);
	// Optional second color for two-color choices.
	const colorHex2 = text(source, "colorHex2", {
		label: `${label} second swatch`,
		max: 7,
		required: false,
	});
	if (colorHex2 && !/^#[0-9a-fA-F]{6}$/.test(colorHex2))
		throw new InputError(
			`${label} second swatch must be a color like #ffffff.`,
		);
	const images = Array.isArray(source.images)
		? source.images.map(imageUrl)
		: [];
	if (images.length === 0)
		throw new InputError(`${label} needs at least one photo.`);
	if (images.length > 12) throw new InputError(`${label} has too many photos.`);
	const rawTags = Array.isArray(source.imageTags) ? source.imageTags : [];
	const imageTags = images.map((_, i) =>
		isPhotoTag(rawTags[i]) ? rawTags[i] : "",
	);
	const rawCaptions = Array.isArray(source.imageCaptions)
		? source.imageCaptions
		: [];
	const imageCaptions = images.map((_, i) => {
		const caption = rawCaptions[i];
		if (typeof caption !== "string") return "";
		const clean = caption.replace(/\s+/g, " ").trim();
		if (clean.length > PHOTO_CAPTION_MAX)
			throw new InputError(
				`${label} photo ${i + 1} caption is too long (${PHOTO_CAPTION_MAX} characters at most).`,
			);
		return clean;
	});
	return {
		id:
			typeof source.id === "string" && source.id
				? source.id.slice(0, 80)
				: undefined,
		colorName: text(source, "colorName", { label: `${label} name`, max: 40 }),
		colorHex,
		colorHex2,
		price: money(source, "price", { label: `${label} price` }),
		isAvailable: bool(source, "isAvailable"),
		readyStock: stockCount(source, "readyStock", `${label} ready-made stock`),
		takesPreorders: bool(source, "takesPreorders"),
		preorderSlots: stockCount(
			source,
			"preorderSlots",
			`${label} pre-order slots`,
		),
		...readyWhen(source, label),
		aiPhotos: bool(source, "aiPhotos"),
		images,
		imageTags,
		imageCaptions,
		recipe: parseRecipe(source.recipe, label),
		wrapperIds: wrapperIds(source, label),
	};
}

/** Wrappers from Admin → Wrappers, used together; none is fine. */
function wrapperIds(source: Record<string, unknown>, label: string) {
	const ids = source.wrapperIds ?? [];
	if (!Array.isArray(ids) || ids.length > 10)
		throw new InputError(`${label} wrappers aren’t valid.`);
	const chosen = new Set<string>();
	for (const id of ids) {
		if (typeof id !== "string" || id.length > 64 || !getWrapper(id))
			throw new InputError(`${label} wrapper isn’t in the wrapper list.`);
		chosen.add(id);
	}
	return [...chosen];
}

/** Bouquets are named after girls, e.g. "Odette", "Mary Ann" or "Corsage 1". */
function bouquetName(source: Record<string, unknown>) {
	const name = text(source, "title", { label: "Name", max: 30 }).replace(
		/\s+/g,
		" ",
	);
	if (!/^\p{L}[\p{L}\p{N} '.-]*$/u.test(name))
		throw new InputError(
			"The name should start with a letter, like Odette or Corsage 1.",
		);
	return name;
}

/** When a style's pre-orders are ready: days after ordering, or a date. */
function readyWhen(source: Record<string, unknown>, label: string) {
	if (source.readyInDays !== null && source.readyInDays !== undefined)
		return {
			readyInDays: integer(source, "readyInDays", {
				label: `${label} pre-order days`,
				min: 1,
				max: 365,
			}),
			readyOn: null,
		};
	const date = text(source, "readyOn", { max: 10, required: false });
	if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
		throw new InputError(`${label} pre-order date must be a date.`);
	return { readyInDays: null, readyOn: date || null };
}

/** A stock count staff may leave blank (null) for no limit. */
function stockCount(
	source: Record<string, unknown>,
	key: string,
	label: string,
) {
	if (source[key] === null || source[key] === undefined) return null;
	return integer(source, key, { label, min: 0, max: 9999 });
}

export const saveProductFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const product = asRecord(source.product);
		const rawVariants = Array.isArray(product.variants) ? product.variants : [];
		if (rawVariants.length === 0)
			throw new InputError("Add at least one style.");
		const parsed: ProductInput = {
			title: bouquetName(product),
			description: text(product, "description", {
				label: "Description",
				max: 2000,
				required: false,
			}),
			arrangement: oneOf(
				product.arrangement ?? DEFAULT_ARRANGEMENT,
				listArrangementTypes().map((type) => type.id),
				"Type",
			),
			size: product.size
				? oneOf(
						product.size,
						listSizes().map((s) => s.id),
						"Size",
					)
				: "",
			isVisible: bool(product, "isVisible"),
			recipe: parseRecipe(product.recipe, "Bouquet"),
			variants: rawVariants.map(parseVariant),
		};
		return {
			productId: typeof source.productId === "string" ? source.productId : null,
			product: parsed,
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const name = flowerCodeKey(data.product.title);
		const other = listAdminProducts().find(
			(product) =>
				product.id !== data.productId && flowerCodeKey(product.title) === name,
		);
		if (other)
			throw new InputError(
				`There’s already a bouquet called “${other.title}”.`,
			);
		const seen = new Set<string>();
		for (const variant of data.product.variants) {
			const key = variant.colorName.trim().toLowerCase();
			if (seen.has(key))
				throw new InputError(
					`There are two styles called “${variant.colorName}”.`,
				);
			seen.add(key);
		}
		const before = data.productId ? getAdminProduct(data.productId) : undefined;
		const id = saveProduct(data.productId, data.product, user.name);
		const after = getAdminProduct(id);
		logBouquet(user, before ? "edited" : "added", before, after);
		return after;
	});

/** Sets the shop's order from every bouquet's id, the first shown first. */
export const reorderProductsFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const ids = asRecord(input).ids;
		if (
			!Array.isArray(ids) ||
			ids.length > 1000 ||
			!ids.every((id) => typeof id === "string")
		)
			throw new InputError("Invalid request.");
		return { ids: ids as string[] };
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		reorderProducts(data.ids);
		writeActivity(
			"bouquets",
			{ id: null, name: "Shop order" },
			staffActor(user),
			"reordered",
		);
		return { ok: true as const };
	});

export const uploadProductImage = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const file = input.get("file");
		if (!(file instanceof File)) throw new InputError("Choose an image.");
		return file;
	})
	.handler(async ({ data }) => {
		await requireStaff();
		try {
			const fileName = await saveImage("products", data);
			return { ok: true as const, url: publicUploadUrl("products", fileName) };
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false as const, message: error.message };
			throw error;
		}
	});

/** A card-sized copy is far smaller than any photo it stands for. */
const THUMB_MAX_BYTES = 1024 * 1024;
const thumbName = (id: string) => `${id}-w${THUMB_WIDTH}`;

/** Saves the card-sized copy of an uploaded product photo (made in the browser). */
export const saveProductThumbnail = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const url = input.get("url");
		const file = input.get("file");
		const id = typeof url === "string" ? productPhotoId(url) : undefined;
		if (!id) throw new InputError("That isn’t an uploaded photo.");
		if (!(file instanceof File)) throw new InputError("Choose an image.");
		if (file.size > THUMB_MAX_BYTES)
			throw new InputError("The smaller copy is too large.");
		return { id, file };
	})
	.handler(async ({ data }) => {
		await requireStaff();
		if (!(await readUpload("products", data.id)))
			return { ok: false as const, message: "That photo was deleted." };
		try {
			const fileName = await saveImage(
				"products",
				data.file,
				thumbName(data.id),
			);
			// Cards ask for `.jpg`; anything else would never be found.
			if (!fileName.endsWith(".jpg")) {
				await deleteUpload("products", fileName);
				return { ok: false as const, message: "Use a JPG for the copy." };
			}
			return { ok: true as const };
		} catch (error) {
			if (error instanceof UploadError)
				return { ok: false as const, message: error.message };
			throw error;
		}
	});

/** Uploaded product photos that don't have a card-sized copy yet. */
export const listPhotosWithoutThumbnails = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireStaff();
	const names = new Set((await listUploads("products")).map(stripExtension));
	return [...names]
		.filter((name) => !/-w\d+$/.test(name) && !names.has(thumbName(name)))
		.map((id) => publicUploadUrl("products", `${id}.jpg`));
});

/** A file from a form, or an error naming what's missing. */
function formFile(form: FormData, key: string, label: string) {
	const file = form.get(key);
	if (!(file instanceof File)) throw new InputError(`Choose ${label}.`);
	return file;
}

/**
 * A signature bouquet photo, watermarked in the browser, with its clean
 * original. The photo is public; the original is kept for staff only, so the
 * watermark can be redone from it.
 */
export const uploadBouquetPhoto = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		return {
			file: formFile(input, "file", "an image"),
			original: formFile(input, "original", "the original image"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		const id = crypto.randomUUID();
		try {
			await saveImage("originals", data.original, id);
			const fileName = await saveImage("products", data.file, id);
			recordWatermark(id, WATERMARK_VERSION);
			return { ok: true as const, url: publicUploadUrl("products", fileName) };
		} catch (error) {
			await deleteUploadById("originals", id);
			if (error instanceof UploadError)
				return { ok: false as const, message: error.message };
			throw error;
		}
	});

/** Bouquet photos that don't have the current watermark yet. */
export const listPhotosToWatermark = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return {
			version: WATERMARK_VERSION,
			...photosNeedingWatermark(WATERMARK_VERSION),
		};
	},
);

/**
 * Swaps a bouquet photo already in use for a watermarked copy (made in the
 * browser from its clean original) and the copy's card-sized version. The
 * copy gets a new id, since photo addresses are cached for good; bouquets
 * move to it and the old id redirects there. The old public photo is deleted
 * and dropped from Cloudflare, so its clean version stops being served.
 */
export const replaceBouquetPhoto = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		if (!(input instanceof FormData)) throw new Error("Expected form data");
		const url = input.get("url");
		const id = typeof url === "string" ? productPhotoId(url) : undefined;
		if (!id) throw new InputError("That isn’t an uploaded photo.");
		const thumb = formFile(input, "thumb", "the smaller copy");
		if (thumb.size > THUMB_MAX_BYTES)
			throw new InputError("The smaller copy is too large.");
		return { id, file: formFile(input, "file", "an image"), thumb };
	})
	.handler(async ({ data }) => {
		await requireStaff();
		const original = await cleanOriginal(data.id);
		if (!original)
			return {
				ok: false as const,
				message: "There’s no clean copy of that photo to watermark.",
			};
		const newId = crypto.randomUUID();
		try {
			await saveImage(
				"originals",
				new File([original.bytes], "original", { type: original.contentType }),
				newId,
			);
			await saveImage("products", data.file, newId);
			const thumbFile = await saveImage(
				"products",
				data.thumb,
				thumbName(newId),
			);
			if (!thumbFile.endsWith(".jpg"))
				throw new UploadError("Use a JPG for the copy.");
		} catch (error) {
			for (const kind of ["originals", "products"] as const)
				await deleteUploadById(kind, newId);
			await deleteUploadById("products", thumbName(newId));
			if (error instanceof UploadError)
				return { ok: false as const, message: error.message };
			throw error;
		}
		replacePhoto(data.id, newId, WATERMARK_VERSION);
		// The clean photo stops being public, but is never thrown away: it moves
		// to the backups (a second clean copy beside the new original). What it
		// replaced, if anything, was an older watermarked copy, which can go.
		await moveUploadById(original.kind, "backups", data.id);
		if (original.kind === "originals")
			await deleteUploadById("products", data.id);
		await deleteUploadById("products", thumbName(data.id));
		if (cloudflareConfigured()) {
			const old = `/uploads/products/${data.id}`;
			await purgePaths([old, `${old}.jpg`, `${old}-w${THUMB_WIDTH}.jpg`]).catch(
				(error) => console.error("Couldn’t purge the old photo:", error),
			);
		}
		return { ok: true as const, url: `/uploads/products/${newId}` };
	});

export const deleteProductFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		productId: text(asRecord(input), "productId", { max: 80 }),
	}))
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const before = getAdminProduct(data.productId);
		if (!before || !deleteProduct(data.productId))
			throw new InputError("That bouquet was already deleted.");
		writeActivity(
			"bouquets",
			{ id: data.productId, name: before.title },
			staffActor(user),
			"deleted",
		);
		return { ok: true as const };
	});

export const deleteVariantFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			productId: text(source, "productId", { max: 80 }),
			variantId: text(source, "variantId", { max: 80 }),
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const before = getAdminProduct(data.productId);
		deleteVariant(data.productId, data.variantId, user.name);
		const after = getAdminProduct(data.productId);
		logBouquet(user, "style_deleted", before, after);
		return after ?? null;
	});
