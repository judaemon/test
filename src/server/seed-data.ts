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
				sku: "BQ-ROSE-18-RED",
				colorName: "Red Velvet",
				colorHex: "#a51c34",
				price: 3499,
				inStock: true,
				isAvailable: true,
				stockQuantity: 24,
				images: gallery("red-velvet"),
			},
			{
				id: "pastel-pink",
				sku: "BQ-ROSE-18-PNK",
				colorName: "Pastel Pink",
				colorHex: "#f2a6b8",
				inStock: true,
				isAvailable: true,
				stockQuantity: 12,
				images: gallery("pastel-pink"),
			},
			{
				id: "cream-white",
				sku: "BQ-ROSE-18-CRM",
				colorName: "Cream White",
				colorHex: "#f4ecd9",
				inStock: true,
				isAvailable: true,
				stockQuantity: 3,
				images: gallery("cream-white"),
			},
			{
				id: "sunset-coral",
				sku: "BQ-ROSE-18-CRL",
				colorName: "Sunset Coral",
				colorHex: "#f27a5c",
				price: 3299,
				inStock: false,
				isAvailable: true,
				stockQuantity: 0,
				images: gallery("sunset-coral"),
			},
		],
	},
];

// SAMPLE DETAILS — replace from Admin → Payments with ORAIA's real accounts.
export const seedPaymentAccounts: PaymentAccount[] = [
	{
		method: "card",
		enabled: true,
		label: "Credit / Debit card",
		accountName: "",
		accountNumber: "",
		bankName: "",
		qrImage: "",
		steps: [],
	},
	{
		method: "gcash",
		enabled: true,
		label: "GCash",
		accountName: "ORAIA Flowers",
		accountNumber: "0917 000 0000",
		bankName: "",
		qrImage: "/images/payments/gcash-qr.svg",
		steps: [
			"Open GCash and tap Pay QR.",
			"Scan the code, or save it and tap Upload QR.",
			"Pay the exact amount, then screenshot the receipt.",
		],
	},
	{
		method: "maya",
		enabled: true,
		label: "Maya",
		accountName: "ORAIA Flowers",
		accountNumber: "0918 000 0000",
		bankName: "",
		qrImage: "/images/payments/maya-qr.svg",
		steps: [
			"Open Maya and tap Scan to Pay.",
			"Scan the code, or save it and upload it from your gallery.",
			"Pay the exact amount, then screenshot the receipt.",
		],
	},
	{
		method: "bank",
		enabled: true,
		label: "Bank transfer",
		accountName: "ORAIA Flowers Trading",
		accountNumber: "0000 0000 0000",
		bankName: "BDO Unibank",
		qrImage: "/images/payments/bank-qr.svg",
		steps: [
			"Open your banking app and choose QR Ph / InstaPay.",
			"Scan the code, or transfer to the account details below.",
			"Send the exact amount, then screenshot the confirmation.",
		],
	},
];
