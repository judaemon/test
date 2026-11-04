import type { PhotoTag, Product, ProductVariant } from "~/types/product";

export const LOW_STOCK_THRESHOLD = 5;
export const MAX_PER_ORDER = 10;

/** Most units of a variant one bag may hold; 0 when it can't be bought. */
/** Compares flower codes: "mary  ann" and "Mary Ann" are the same code. */
export const flowerCodeKey = (code: string) =>
	code.trim().replace(/\s+/g, " ").toLowerCase();

/** "Bianca · White" for a line; built bouquets have no style to name. */
export function styleLabel(line: { sku: string; colorName: string }) {
	return line.sku && line.sku !== "Custom"
		? `${line.sku} · ${line.colorName}`
		: line.colorName;
}

/**
 * A line's full name: "Odette · Cream". Lines from before bouquets had their
 * own pages also name the product: "Roses · Althea · White".
 */
export function lineName(line: {
	title: string;
	sku: string;
	colorName: string;
}) {
	const style = styleLabel(line);
	return flowerCodeKey(line.title) === flowerCodeKey(line.sku)
		? style
		: `${line.title} · ${style}`;
}

/** Most of one style per order: what's left, up to 10; none while unavailable. */
export function getMaxQuantity(variant: ProductVariant) {
	if (!variant.inStock) return 0;
	return Math.min(MAX_PER_ORDER, variant.stock ?? MAX_PER_ORDER);
}

/**
 * What the shop says about a style's availability: "Sold out", "Pre-order
 * closed" or "Unavailable" when it can't be ordered, otherwise "5 left",
 * "Pre-order · 5 slots left" or "Pre-order"; empty for a plain style.
 */
export function stockLabel(variant: ProductVariant) {
	if (!variant.inStock) {
		if (variant.stock !== 0) return "Unavailable";
		return variant.preorder ? "Pre-order closed" : "Sold out";
	}
	if (variant.stock === undefined) return variant.preorder ? "Pre-order" : "";
	if (!variant.preorder) return `${variant.stock} left`;
	return `Pre-order · ${variant.stock} ${variant.stock === 1 ? "slot" : "slots"} left`;
}

export function getVariantPrice(product: Product, variant: ProductVariant) {
	return variant.price ?? product.basePrice;
}

/**
 * What a bouquet costs at least, among the themes that can be ordered (all of
 * them if none can), and whether some cost more: ₱1,200, or "From ₱1,200".
 */
export function startingPrice(product: Product) {
	const open = product.variants.filter((variant) => variant.inStock);
	const prices = (open.length ? open : product.variants).map((variant) =>
		getVariantPrice(product, variant),
	);
	if (!prices.length) return { amount: product.basePrice, varies: false };
	const amount = Math.min(...prices);
	return { amount, varies: prices.some((price) => price !== amount) };
}

/**
 * Resolves the variant named in the URL. Unknown or missing ids fall back to
 * the first in-stock variant so a stale shared link still lands somewhere
 * useful.
 */
export function resolveVariant(
	product: Product,
	variantId: string | undefined,
): ProductVariant {
	return (
		product.variants.find((variant) => variant.id === variantId) ??
		product.variants.find((variant) => variant.inStock) ??
		product.variants[0]
	);
}

export function formatPrice(amount: number, currency: string) {
	// Whole amounts read cleaner without centavos: ₱2,999 rather than ₱2,999.00.
	const fractionDigits = Number.isInteger(amount) ? 0 : 2;
	return new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency,
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(amount);
}

/** The tags staff can give a bouquet photo: the shop's name and a short one for the editor. */
export const PHOTO_TAGS: { value: PhotoTag; label: string; short: string }[] = [
	{ value: "front", label: "Front view", short: "Front" },
	{ value: "side", label: "Side view", short: "Side" },
	{ value: "top", label: "Top view", short: "Top" },
	{ value: "size", label: "Size reference", short: "Size ref." },
	{ value: "", label: "No tag", short: "No tag" },
];

export const isPhotoTag = (value: unknown): value is PhotoTag =>
	PHOTO_TAGS.some((tag) => tag.value === value);

/**
 * What a photo shows. Photos added before they could be tagged were placed
 * by position: front first, then top.
 */
export function photoTag(variant: ProductVariant, index: number): PhotoTag {
	const tag = variant.imageTags?.[index];
	if (tag !== undefined) return tag;
	return (["front", "top"] as const)[index] ?? "";
}

/** A bouquet's photos with what each one shows. */
export function bouquetPhotos(variant: ProductVariant) {
	return variant.images.map((src, index) => {
		const tag = photoTag(variant, index);
		return {
			src,
			label: tag
				? (PHOTO_TAGS.find((t) => t.value === tag)?.label ?? "")
				: "More photos",
		};
	});
}

/** CSS background for a swatch: one color, or split diagonally for two. */
export function swatchBackground(color?: string, color2?: string) {
	return swatchColors([color, color2].filter((c) => !!c) as string[]);
}

/** One color as it is, two split diagonally, more in equal slices from the middle. */
export function swatchColors(colors: string[]) {
	if (colors.length === 0) return "transparent";
	if (colors.length === 1) return colors[0] as string;
	if (colors.length === 2)
		return `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
	const slice = 100 / colors.length;
	const stops = colors.map(
		(color, i) => `${color} ${slice * i}% ${slice * (i + 1)}%`,
	);
	return `conic-gradient(${stops.join(", ")})`;
}
