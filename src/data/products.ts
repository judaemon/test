import type { Product } from "~/types/product";

const gallery = (variantId: string) =>
	["front", "top", "detail", "vase"].map(
		(view) => `/images/bouquets/${variantId}-${view}.svg`,
	);

export const products: Product[] = [
	{
		id: "signature-rose-bouquet",
		title: "Signature Hand-Tied Rose Bouquet",
		description:
			"Eighteen premium long-stem roses, hand-tied by our florists and wrapped in textured paper with a satin ribbon. Each bouquet is cut to order and arrives in a hydration pack so it stays fresh for up to 7 days.",
		basePrice: 54.99,
		currency: "USD",
		variants: [
			{
				id: "red-velvet",
				sku: "BQ-ROSE-18-RED",
				colorName: "Red Velvet",
				colorHex: "#a51c34",
				price: 59.99,
				inStock: true,
				stockQuantity: 24,
				images: gallery("red-velvet"),
			},
			{
				id: "pastel-pink",
				sku: "BQ-ROSE-18-PNK",
				colorName: "Pastel Pink",
				colorHex: "#f2a6b8",
				inStock: true,
				stockQuantity: 12,
				images: gallery("pastel-pink"),
			},
			{
				id: "cream-white",
				sku: "BQ-ROSE-18-CRM",
				colorName: "Cream White",
				colorHex: "#f4ecd9",
				inStock: true,
				stockQuantity: 3,
				images: gallery("cream-white"),
			},
			{
				id: "sunset-coral",
				sku: "BQ-ROSE-18-CRL",
				colorName: "Sunset Coral",
				colorHex: "#f27a5c",
				price: 57.99,
				inStock: false,
				stockQuantity: 0,
				images: gallery("sunset-coral"),
			},
		],
	},
];

export function getProduct(productId: string): Product | undefined {
	return products.find((product) => product.id === productId);
}
