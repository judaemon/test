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
	/** Purchasable right now: switched on by staff and with units left. */
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

/** What staff see and edit; the shop only ever receives `Product`. */
export interface AdminVariant extends ProductVariant {
	stockQuantity: number;
	/** Staff switch to pause a color without losing its stock count. */
	isAvailable: boolean;
}

export interface AdminProduct extends Omit<Product, "variants"> {
	isVisible: boolean;
	variants: AdminVariant[];
}
