import type { PaymentAccount } from "~/types/payment";
import type { AdminProduct } from "~/types/product";

// Starting catalog, written to the database the first time it's created.
// After that, products are managed from the admin.

const gallery = (variantId: string) =>
	["front", "top", "detail", "vase"].map(
		(view) => `/images/bouquets/${variantId}-${view}.svg`,
	);

export const seedProducts: AdminProduct[] = [
	{
		id: "signature-rose-bouquet",
		title: "Signature Hand-Tied Rose Bouquet",
		description:
			"Eighteen premium long-stem roses, hand-tied by our florists and wrapped in textured paper with a satin ribbon. Each bouquet is cut to order and arrives in a hydration pack so it stays fresh for up to 7 days.",
		basePrice: 2999,
		currency: "PHP",
		isVisible: true,
		variants: [
			{
				id: "red-velvet",
				sku: "Scarlett",
				colorName: "Red Velvet",
				colorHex: "#a51c34",
				price: 3499,
				inStock: true,
				isAvailable: true,
				stockQuantity: 24,
				images: gallery("red-velvet"),
				recipe: [
					{ flower: "Roses", count: 18, color: "Red" },
					{ flower: "Gypsophila" },
				],
				wrapperColor: "Black",
				size: "classic",
			},
			{
				id: "pastel-pink",
				sku: "Rosie",
				colorName: "Pastel Pink",
				colorHex: "#f2a6b8",
				inStock: true,
				isAvailable: true,
				stockQuantity: 12,
				images: gallery("pastel-pink"),
				recipe: [
					{ flower: "Roses", count: 18, color: "Pink" },
					{ flower: "Aster", color: "Violet" },
				],
				wrapperColor: "Blush pink",
				size: "classic",
			},
			{
				id: "cream-white",
				sku: "Bianca",
				colorName: "Cream White",
				colorHex: "#f4ecd9",
				inStock: true,
				isAvailable: true,
				stockQuantity: 3,
				images: gallery("cream-white"),
				recipe: [
					{ flower: "Roses", count: 18, color: "Cream" },
					{ flower: "Eucalyptus" },
				],
				wrapperColor: "Kraft brown",
				size: "classic",
			},
			{
				id: "sunset-coral",
				sku: "Coral",
				colorName: "Sunset Coral",
				colorHex: "#f27a5c",
				price: 3299,
				inStock: false,
				isAvailable: true,
				stockQuantity: 0,
				images: gallery("sunset-coral"),
				recipe: [
					{ flower: "Tulips", count: 10 },
					{ flower: "Carnations", count: 8, color: "Coral" },
				],
				wrapperColor: "Ivory",
				size: "classic",
			},
		],
	},
];

// ORAIA's accounts. Add the QR codes from Admin → Payments; until then
// checkout shows the account details only.
export const seedPaymentAccounts: PaymentAccount[] = [
	{
		method: "bank",
		enabled: true,
		label: "Bank transfer",
		accountName: "Lennie Lou Judaya",
		accountNumber: "11114626063",
		bankName: "Maribank",
		qrImage: "",
		steps: [
			"Open your banking app and transfer to the Maribank account below.",
			"Send the exact amount, then enter the reference number below.",
		],
	},
	{
		method: "gcash",
		enabled: true,
		label: "GCash",
		accountName: "Lennie Lou Judaya",
		accountNumber: "0976 037 6638",
		bankName: "",
		qrImage: "",
		steps: [
			"Open GCash and tap Send Money.",
			"Send to the GCash number below.",
			"Pay the exact amount, then enter the reference number below.",
		],
	},
	{
		method: "maya",
		enabled: false,
		label: "Maya",
		accountName: "",
		accountNumber: "",
		bankName: "",
		qrImage: "",
		steps: [],
	},
	{
		method: "card",
		enabled: false,
		label: "Credit / Debit card",
		accountName: "",
		accountNumber: "",
		bankName: "",
		qrImage: "",
		steps: [],
	},
];
