import type { BouquetSize } from "~/lib/sizes";

/** One line of a bouquet's recipe, e.g. 12 × "Roses", or a "Gypsophila" cluster. */
export interface RecipeItem {
	flower: string;
	/** Stems of a counted flower; absent for cluster flowers. */
	count?: number;
	/** For flowers that come in colors, e.g. Roses · "Red". */
	color?: string;
}

/** What a bouquet photo shows, tagged by staff; "" for an untagged extra. */
export type PhotoTag = "front" | "side" | "top" | "size" | "";

export interface ProductVariant {
	/** URL-safe slug, also used as the `?variant=` search param value. */
	id: string;
	sku: string;
	colorName: string;
	/** Solid swatch color. Ignored when `swatchImage` is provided. */
	colorHex?: string;
	/** Second color for two-color choices (e.g. red & white); the swatch splits. */
	colorHex2?: string;
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
	/** What each image shows, by position; missing tags fall back by position. */
	imageTags?: PhotoTag[];
	/** What goes into the bouquet; the stem count is the sum. */
	recipe: RecipeItem[];
	/** Petite, Classic, Impressive or Grand (see the size guide); empty if not set. */
	size?: BouquetSize | "";
	/** e.g. "Kraft brown"; empty if not set. */
	wrapperColor: string;
	/** Backgrounds were AI-enhanced, so the shop shows a note under the photos. */
	aiPhotos?: boolean;
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
