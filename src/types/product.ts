import type { BouquetSize } from "~/lib/sizes";

/** One line of a bouquet's recipe, e.g. 12 × "Roses". */
export interface RecipeItem {
	flower: string;
	/** How many; absent only on orders placed when fillers came as one cluster. */
	count?: number;
	/** For flowers that come in colors, e.g. Roses · "Red". */
	color?: string;
}

/** What a bouquet photo shows, tagged by staff; "" for an untagged extra. */
export type PhotoTag = "front" | "side" | "top" | "size" | "";

/**
 * One style of a signature bouquet (a "theme" in the shop), e.g. Odette's
 * Pink. Called a variant in code, from when bouquets were products.
 */
export interface ProductVariant {
	/** URL-safe slug, also used as the `?theme=` search param value. */
	id: string;
	/** The bouquet's name, e.g. Odette. */
	sku: string;
	/** The style's name, e.g. Pink. */
	colorName: string;
	/** Solid swatch color. Ignored when `swatchImage` is provided. */
	colorHex?: string;
	/** Second color for two-color choices (e.g. red & white); the swatch splits. */
	colorHex2?: string;
	/** Optional textured swatch (e.g. a petal close-up). */
	swatchImage?: string;
	/** Overrides `Product.basePrice` when set. */
	price?: number;
	/**
	 * Can be ordered right now: marked available by staff. Unavailable
	 * styles still show in the shop but can't go in the bag.
	 */
	inStock: boolean;
	/** Gallery images specific to this color, in display order. */
	images: string[];
	/** What each image shows, by position; missing tags fall back by position. */
	imageTags?: PhotoTag[];
	/** What goes into the bouquet; the stem count is the sum. */
	recipe: RecipeItem[];
	/** The bouquet's size (see the size guide); empty if not set. */
	size?: BouquetSize | "";
	/** The wrapper's name, e.g. "Kraft brown"; empty if not set. */
	wrapperColor: string;
	/** Backgrounds were AI-enhanced, so the shop shows a note under the photos. */
	aiPhotos?: boolean;
}

/** A signature bouquet, e.g. Odette, with its styles. */
export interface Product {
	/** Also its shop link: /products/<id>. */
	id: string;
	/** The bouquet's name, a girl's name. */
	title: string;
	description: string;
	/** The cheapest style. */
	basePrice: number;
	currency: string;
	/** Petite, Classic, Impressive or Grand; empty if not set. */
	size: BouquetSize | "";
	variants: ProductVariant[];
}

/** What staff see and edit; the shop only ever receives `Product`. */
export interface AdminVariant extends ProductVariant {
	/** Staff switch: unavailable styles show in the shop but can't be ordered. */
	isAvailable: boolean;
	/** The wrapper from Admin → Wrappers; `wrapperColor` is its name. */
	wrapperId?: string;
}

export interface AdminProduct extends Omit<Product, "variants"> {
	isVisible: boolean;
	variants: AdminVariant[];
}
