import { createServerFn } from "@tanstack/solid-start";

import { requireStaff } from "../admin-auth";
import {
	getAdminProduct,
	listAdminProducts,
	type ProductInput,
	saveProduct,
	updateVariantStock,
	type VariantInput,
} from "../catalog-repo";
import { publicUploadUrl, saveImage, UploadError } from "../uploads";
import {
	asRecord,
	bool,
	InputError,
	imageUrl,
	integer,
	money,
	text,
} from "../validate";

export const listInventory = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listAdminProducts();
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
	const images = Array.isArray(source.images)
		? source.images.map(imageUrl)
		: [];
	if (images.length === 0)
		throw new InputError(`${label} needs at least one photo.`);
	if (images.length > 12) throw new InputError(`${label} has too many photos.`);
	return {
		id:
			typeof source.id === "string" && source.id
				? source.id.slice(0, 80)
				: undefined,
		colorName: text(source, "colorName", { label: `${label} name`, max: 40 }),
		sku: text(source, "sku", { label: `${label} SKU`, max: 40 }),
		colorHex,
		price:
			source.price === null || source.price === undefined
				? null
				: money(source, "price", { label: `${label} price` }),
		stockQuantity: integer(source, "stockQuantity", {
			label: `${label} stock`,
			max: 100_000,
		}),
		isAvailable: bool(source, "isAvailable"),
		images,
	};
}

export const saveProductFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const product = asRecord(source.product);
		const rawVariants = Array.isArray(product.variants) ? product.variants : [];
		if (rawVariants.length === 0)
			throw new InputError("Add at least one color.");
		if (rawVariants.length > 20) throw new InputError("Too many colors.");
		const parsed: ProductInput = {
			title: text(product, "title", { label: "Name", max: 120 }),
			description: text(product, "description", {
				label: "Description",
				max: 2000,
				required: false,
			}),
			basePrice: money(product, "basePrice", { label: "Price" }),
			isVisible: bool(product, "isVisible"),
			variants: rawVariants.map(parseVariant),
		};
		const names = parsed.variants.map((v) => v.colorName.toLowerCase());
		if (new Set(names).size !== names.length)
			throw new InputError("Each color needs a different name.");
		return {
			productId: typeof source.productId === "string" ? source.productId : null,
			product: parsed,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
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
