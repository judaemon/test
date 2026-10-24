export interface ProductVariant {
	/** URL-safe slug, also used as the `?variant=` search param value. */
	id: string;
	sku: string;
	colorName: string;
	/** Solid swatch color. Ignored when `swatchImage` is provided. */
	colorHex?: string;
	/** Optional textured swatch (e.g. a petal close-up). */
	swatchImage?: string;
	/** Overrides `Product.basePrice` when set. */
	price?: number;
	inStock: boolean;
	/** Units left; drives the low-stock message and quantity cap. */
	stockQuantity?: number;
	/** Gallery images specific to this color, in display order. */
	images: string[];
}

export interface Product {
	id: string;
	title: string;
	description: string;
	basePrice: number;
	currency: string;
	variants: ProductVariant[];
}
