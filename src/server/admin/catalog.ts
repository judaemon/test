import { createServerFn } from "@tanstack/solid-start";
import { productPhotoId, THUMB_WIDTH } from "~/lib/photos";
import { flowerCodeKey, isPhotoTag } from "~/lib/product";
import type { RecipeItem } from "~/types/product";
import { requireStaff } from "../admin-auth";
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
import { getCustomSettings } from "../custom-repo";
import { listSizes } from "../sizes-repo";
import {
	deleteUpload,
	listUploads,
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
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		updateStyle(data.productId, data.variantId, data);
		return getAdminProduct(data.productId) ?? null;
	});

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
		await requireStaff();
		setProductVisible(data.productId, data.isVisible);
		return getAdminProduct(data.productId) ?? null;
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
		aiPhotos: bool(source, "aiPhotos"),
		images,
		imageTags,
		recipe: parseRecipe(source.recipe, label),
		wrapperId: wrapperId(source, label),
	};
}

/** A wrapper from Admin → Wrappers, or none. */
function wrapperId(source: Record<string, unknown>, label: string) {
	const id = text(source, "wrapperId", { max: 64, required: false });
	if (id && !getWrapper(id))
		throw new InputError(`${label} wrapper isn’t in the wrapper list.`);
	return id;
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

function parseRecipe(raw: unknown, label: string): RecipeItem[] {
	// The flowers staff keep in Admin → Flowers.
	const settings = getCustomSettings();
	const rows = Array.isArray(raw) ? raw : [];
	if (rows.length > 20)
		throw new InputError(`${label} recipe has too many flowers.`);
	return rows.map((row) => {
		const item = asRecord(row);
		const flower = text(item, "flower", { label: `${label} flower`, max: 40 });
		const option = settings.flowers.find((f) => f.name === flower);
		if (!option)
			throw new InputError(`${label}: “${flower}” isn’t in the flower list.`);
		const parsed: RecipeItem = { flower };
		// Flowers with one color name none; the rest pick one from Flowers.
		if (option.kind.colors) {
			const wanted = text(item, "color", {
				label: `${label} ${flower} color`,
				max: 30,
			}).toLowerCase();
			const color = option.colors.find((c) => c.name.toLowerCase() === wanted);
			if (!color)
				throw new InputError(
					`${label} ${flower} color must be one of ${option.colors.map((c) => c.name).join(", ")}.`,
				);
			parsed.color = color.name;
		}
		parsed.count = integer(item, "count", {
			label: `${label} ${flower} count`,
			min: 1,
			max: 500,
		});
		if (item.filler === true) parsed.filler = true;
		return parsed;
	});
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
			size: product.size
				? oneOf(
						product.size,
						listSizes().map((s) => s.id),
						"Size",
					)
				: "",
			isVisible: bool(product, "isVisible"),
			variants: rawVariants.map(parseVariant),
		};
		return {
			productId: typeof source.productId === "string" ? source.productId : null,
			product: parsed,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
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
		const id = saveProduct(data.productId, data.product);
		return getAdminProduct(id);
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
		await requireStaff();
		reorderProducts(data.ids);
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

export const deleteProductFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		productId: text(asRecord(input), "productId", { max: 80 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		if (!deleteProduct(data.productId))
			throw new InputError("That bouquet was already deleted.");
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
		await requireStaff();
		deleteVariant(data.productId, data.variantId);
		return getAdminProduct(data.productId) ?? null;
	});
