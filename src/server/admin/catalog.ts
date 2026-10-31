import { createServerFn } from "@tanstack/solid-start";
import { findFlowerKind } from "~/lib/custom-bouquet";
import { flowerCodeKey, isPhotoTag } from "~/lib/product";
import { BOUQUET_SIZES } from "~/lib/sizes";
import type { RecipeItem } from "~/types/product";
import { requireStaff } from "../admin-auth";
import {
	deleteProduct,
	deleteVariant,
	getAdminProduct,
	listAdminProducts,
	type ProductInput,
	saveProduct,
	updateVariantStock,
	type VariantInput,
} from "../catalog-repo";
import { getCustomSettings } from "../custom-repo";
import { publicUploadUrl, saveImage, UploadError } from "../uploads";
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

export const listInventory = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listAdminProducts();
	},
);

/** Every style in the shop, so the editor can warn about repeats. */
export const listFlowerCodes = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listAdminProducts().flatMap((product) =>
			product.variants.map((variant) => ({
				code: variant.sku,
				owner: `${product.title} · ${variant.colorName}`,
				productId: product.id,
			})),
		);
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

export const updateStock = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			productId: text(source, "productId", { max: 80 }),
			variantId: text(source, "variantId", { max: 80 }),
			stockQuantity:
				source.stockQuantity === undefined
					? undefined
					: integer(source, "stockQuantity", { label: "Stock", max: 100_000 }),
			isAvailable:
				source.isAvailable === undefined
					? undefined
					: bool(source, "isAvailable"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		updateVariantStock(data.productId, data.variantId, data);
		return getAdminProduct(data.productId) ?? null;
	});

function parseVariant(raw: unknown, index: number): VariantInput {
	const source = asRecord(raw);
	const label = `Color ${index + 1}`;
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
		sku: flowerCode(source, label),
		colorHex,
		colorHex2,
		price: money(source, "price", { label: `${label} price` }),
		stockQuantity: integer(source, "stockQuantity", {
			label: `${label} stock`,
			max: 100_000,
		}),
		isAvailable: bool(source, "isAvailable"),
		aiPhotos: bool(source, "aiPhotos"),
		images,
		imageTags,
		recipe: parseRecipe(source.recipe, label),
		wrapperColor: text(source, "wrapperColor", {
			label: `${label} wrapper color`,
			max: 40,
			required: false,
		}),
		size: source.size
			? oneOf(
					source.size,
					BOUQUET_SIZES.map((s) => s.id),
					`${label} size`,
				)
			: "",
	};
}

/** Flower codes are girls' names, e.g. "Bianca" or "Mary Ann". */
function flowerCode(source: Record<string, unknown>, label: string) {
	const code = text(source, "sku", { label: `${label} style`, max: 30 });
	if (!/^\p{L}[\p{L} '.-]*$/u.test(code))
		throw new InputError(
			`${label} style should be a name, like Bianca — letters only.`,
		);
	return code;
}

function parseRecipe(raw: unknown, label: string): RecipeItem[] {
	// Includes flowers staff added in Custom bouquets.
	const settings = getCustomSettings();
	const rows = Array.isArray(raw) ? raw : [];
	if (rows.length > 20)
		throw new InputError(`${label} recipe has too many flowers.`);
	return rows.map((row) => {
		const item = asRecord(row);
		const flower = text(item, "flower", { label: `${label} flower`, max: 40 });
		const kind = findFlowerKind(flower, settings);
		if (!kind)
			throw new InputError(`${label}: “${flower}” isn’t in the flower list.`);
		const parsed: RecipeItem = { flower };
		if (kind.colors) {
			const color = text(item, "color", {
				label: `${label} ${flower} color`,
				max: 30,
			});
			if (kind.colors !== true && !kind.colors.includes(color))
				throw new InputError(
					`${label} ${flower} color must be ${kind.colors.join(" or ")}.`,
				);
			parsed.color = color;
		}
		// Cluster flowers (Gypsophila and the like) are never counted.
		if (kind.counted)
			parsed.count = integer(item, "count", {
				label: `${label} ${flower} count`,
				min: 1,
				max: 500,
			});
		return parsed;
	});
}

export const saveProductFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const product = asRecord(source.product);
		const rawVariants = Array.isArray(product.variants) ? product.variants : [];
		if (rawVariants.length === 0)
			throw new InputError("Add at least one color.");
		const variants = rawVariants.map(parseVariant);
		const parsed: ProductInput = {
			title: text(product, "title", { label: "Name", max: 120 }),
			description: text(product, "description", {
				label: "Description",
				max: 2000,
				required: false,
			}),
			// Prices are set per color; the product's is its cheapest ("From …").
			basePrice: Math.min(...variants.map((v) => v.price)),
			isVisible: bool(product, "isVisible"),
			variants,
		};
		return {
			productId: typeof source.productId === "string" ? source.productId : null,
			product: parsed,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		// A style (flower code) belongs to one product; colors sharing it within
		// that product are the style's colors, and each can only appear once.
		const taken = new Map<string, string>();
		for (const product of listAdminProducts()) {
			if (product.id === data.productId) continue;
			for (const variant of product.variants)
				taken.set(
					flowerCodeKey(variant.sku),
					`${product.title} · ${variant.colorName}`,
				);
		}
		const seen = new Set<string>();
		for (const variant of data.product.variants) {
			const key = flowerCodeKey(variant.sku);
			const owner = taken.get(key);
			if (owner)
				throw new InputError(
					`The style “${variant.sku}” is already used by ${owner}.`,
				);
			const color = `${key}::${variant.colorName.trim().toLowerCase()}`;
			if (seen.has(color))
				throw new InputError(
					`Style “${variant.sku}” already has a color called “${variant.colorName}”.`,
				);
			seen.add(color);
		}
		const id = saveProduct(data.productId, data.product);
		return getAdminProduct(id);
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

export const deleteProductFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		productId: text(asRecord(input), "productId", { max: 80 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		if (!deleteProduct(data.productId))
			throw new InputError("That product was already deleted.");
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
