import type { BouquetSize } from "~/lib/sizes";
import type { PaymentAccount } from "~/types/payment";
import type { RecipeItem } from "~/types/product";

// Starting catalog, written to the database the first time it's created.
// After that, signature bouquets are managed from the admin.

const gallery = (variantId: string) =>
	["front", "top", "detail", "vase"].map(
		(view) => `/images/bouquets/${variantId}-${view}.svg`,
	);

export interface SeedBouquet {
	id: string;
	/** A girl's name. */
	name: string;
	description: string;
	size: BouquetSize | "";
	isVisible: boolean;
	styles: {
		slug: string;
		name: string;
		colorHex: string;
		price: number;
		/** Unavailable styles show in the shop but can't be ordered. */
		isAvailable: boolean;
		images: string[];
		/** Flowers and colors by name, as in Admin → Flowers. */
		recipe: RecipeItem[];
		/** A wrapper's name, as in Admin → Wrappers. */
		wrapper: string;
	}[];
}

const ROSES_DESCRIPTION =
	"Eighteen premium long-stem roses, hand-tied by our florists and wrapped in textured paper with a satin ribbon. Each bouquet is cut to order and arrives in a hydration pack so it stays fresh for up to 7 days.";

export const seedBouquets: SeedBouquet[] = [
	{
		id: "scarlett",
		name: "Scarlett",
		description: ROSES_DESCRIPTION,
		size: "classic",
		isVisible: true,
		styles: [
			{
				slug: "red-velvet",
				name: "Red Velvet",
				colorHex: "#a51c34",
				price: 3499,
				isAvailable: true,
				images: gallery("red-velvet"),
				recipe: [
					{ flower: "Roses", count: 18, color: "Red" },
					{ flower: "Gypsophila", count: 1 },
				],
				wrapper: "Black",
			},
		],
	},
	{
		id: "rosie",
		name: "Rosie",
		description: ROSES_DESCRIPTION,
		size: "classic",
		isVisible: true,
		styles: [
			{
				slug: "pastel-pink",
				name: "Pastel Pink",
				colorHex: "#f2a6b8",
				price: 2999,
				isAvailable: true,
				images: gallery("pastel-pink"),
				recipe: [
					{ flower: "Roses", count: 18, color: "Pink" },
					{ flower: "Aster", count: 1, color: "Violet" },
				],
				wrapper: "Blush pink",
			},
		],
	},
	{
		id: "bianca",
		name: "Bianca",
		description: ROSES_DESCRIPTION,
		size: "classic",
		isVisible: true,
		styles: [
			{
				slug: "cream-white",
				name: "Cream White",
				colorHex: "#f4ecd9",
				price: 2999,
				isAvailable: true,
				images: gallery("cream-white"),
				recipe: [
					{ flower: "Roses", count: 18, color: "Cream" },
					{ flower: "Eucalyptus", count: 1 },
				],
				wrapper: "Kraft brown",
			},
		],
	},
	{
		id: "coral",
		name: "Coral",
		description: ROSES_DESCRIPTION,
		size: "classic",
		isVisible: true,
		styles: [
			{
				slug: "sunset-coral",
				name: "Sunset Coral",
				colorHex: "#f27a5c",
				price: 3299,
				isAvailable: false,
				images: gallery("sunset-coral"),
				recipe: [
					{ flower: "Tulips", count: 10 },
					{ flower: "Carnations", count: 8, color: "Coral" },
				],
				wrapper: "Ivory",
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
