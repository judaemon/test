import { DEFAULT_ARRANGEMENT } from "~/lib/arrangements";
import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import { floristOf } from "~/lib/florists";
import { preorderNote } from "~/lib/product";
import {
	canStartMaking,
	isPaymentSettled,
	type OrderStage,
	type PaymentStatus,
} from "~/types/order";
import type { RecipeItem } from "~/types/product";
import { listArrangementTypes } from "./arrangement-types-repo";
import { getDb } from "./db";
import type { Florist } from "./florists-repo";
import { listOrders } from "./orders-repo";
import { currentPhotoUrl } from "./photo-watermarks";

/** A card or note to go with one bouquet. */
export interface FloristCard {
	to: string;
	message: string;
}

/** Paid in full, a deposit in, being checked, not sent yet, or rejected. */
export type FloristPayment =
	| "paid"
	| "deposit"
	| "verifying"
	| "unpaid"
	| "rejected";

function floristPayment(payment: {
	status: PaymentStatus;
	amountPaid?: number;
}): FloristPayment {
	if (isPaymentSettled(payment.status)) return "paid";
	if ((payment.amountPaid ?? 0) > 0) return "deposit";
	if (payment.status === "pending") return "verifying";
	return payment.status === "rejected" ? "rejected" : "unpaid";
}

/** One bouquet a florist is to make, with what they need to make it. */
export interface FloristBouquet {
	/** Unique on the sheet: order, line and which of its kind. */
	key: string;
	orderNumber: string;
	/** Staff only: to link the order. Left out of the florist's own link. */
	orderId?: string;
	placedAt: string;
	stage: OrderStage;
	/** Not paid yet, so it might not go ahead. */
	waitingForPayment: boolean;
	/** Where the order's payment is, in words a florist reads at a glance. */
	payment: FloristPayment;
	isTest: boolean;
	/** `YYYY-MM-DD`, when the customer chose one. */
	deliveryDate?: string;
	customer: {
		name: string;
		company: string;
		className: string;
		serialNumber: string;
	};
	code: string;
	title: string;
	colorName: string;
	image?: string;
	/** Built or chat bouquets: the photos of the look the customer wants. */
	referenceImages: string[];
	custom: boolean;
	typeName: string;
	/** The arrangement's section on the sheet ("Custom bouquets", "Corsages"…), and its place: custom first, then as in Admin → Arrangement types. */
	typeGroup: string;
	typeRank: number;
	sizeName: string;
	wrapper: string;
	preorder: string;
	recipe: RecipeItem[];
	/** Which of the line's bouquets this is (from 0), and how many there are. */
	unit: number;
	quantity: number;
	card?: FloristCard;
	/** The customer's note for this bouquet. */
	note: string;
	/** Older orders: one card and note for the whole order. */
	orderCard?: FloristCard;
	orderNote: string;
}

export interface FloristWork {
	florist: { id: string; name: string; phone: string; notes: string };
	bouquets: FloristBouquet[];
	/** Their finished bouquets, left out unless asked for. */
	doneCount: number;
	/** A photo per flower: "Flower|Color", and "Flower|" for the flower's own. */
	flowerPhotos: Record<string, string>;
	generatedAt: string;
}

/** Every flower's photo, for recipes: by "Flower|Color" and "Flower|". */
export function flowerPhotoMap() {
	const rows = getDb()
		.query(
			`SELECT f.name AS flower, f.image AS flowerImage, c.name AS color, c.image AS colorImage
			 FROM flowers f LEFT JOIN flower_colors c ON c.flower_id = f.id`,
		)
		.all() as {
		flower: string;
		flowerImage: string;
		color: string | null;
		colorImage: string | null;
	}[];
	const photos: Record<string, string> = {};
	for (const row of rows) {
		if (row.flowerImage) photos[`${row.flower}|`] = row.flowerImage;
		const photo = row.colorImage || row.flowerImage;
		if (row.color && photo) photos[`${row.flower}|${row.color}`] = photo;
	}
	return photos;
}

/**
 * The bouquets given to a florist that are still to be made (and, if asked,
 * the ones already done), oldest order first. Cancelled orders never show.
 * `forStaff` adds what only staff see: order links and test orders.
 */
export function floristWork(
	florist: Florist,
	options: { includeDone: boolean; forStaff: boolean },
): FloristWork {
	const typeList = listArrangementTypes();
	const types = new Map(typeList.map((t) => [t.id, t.name]));
	const groups = new Map(
		typeList.map((t, rank) => [t.id, { name: t.pluralName || t.name, rank }]),
	);
	const bouquets: FloristBouquet[] = [];
	let doneCount = 0;
	const orders = listOrders({
		limit: 1_000_000,
		test: options.forStaff ? undefined : "exclude",
	});
	for (const order of orders) {
		if (order.stage === "cancelled") continue;
		const d = order.details;
		order.lines.forEach((line, index) => {
			for (let unit = 0; unit < line.quantity; unit++) {
				if (floristOf(line, unit) !== florist.id) continue;
				if (order.stage === "done") {
					doneCount += 1;
					if (!options.includeDone) continue;
				}
				const message = line.messages?.[unit];
				const custom = line.productId === CUSTOM_PRODUCT_ID;
				// Orders from before arrangement types are bouquets, as in the catalog.
				const arrangement = line.arrangement || DEFAULT_ARRANGEMENT;
				const group = custom
					? { name: "Custom bouquets", rank: -1 }
					: (groups.get(arrangement) ?? {
							name: "Other",
							rank: typeList.length,
						});
				bouquets.push({
					key: `${order.id}|${index}|${unit}`,
					orderNumber: order.number,
					...(options.forStaff ? { orderId: order.id } : {}),
					placedAt: order.createdAt,
					stage: order.stage,
					waitingForPayment: !canStartMaking(order.payment),
					payment: floristPayment(order.payment),
					isTest: order.isTest,
					...(d.deliveryDate ? { deliveryDate: d.deliveryDate } : {}),
					customer: {
						name: d.lastName ? `${d.lastName}, ${d.firstName}` : d.fullName,
						company: d.company,
						className: d.className,
						serialNumber: d.serialNumber,
					},
					code: line.sku,
					title: line.title,
					colorName: line.colorName,
					...(line.image ? { image: currentPhotoUrl(line.image) } : {}),
					referenceImages: line.custom?.referenceImages ?? [],
					custom,
					typeName: custom ? "Custom bouquet" : (types.get(arrangement) ?? ""),
					typeGroup: group.name,
					typeRank: group.rank,
					sizeName: line.sizeName ?? "",
					wrapper: line.wrapperColor ?? "",
					preorder: preorderNote(line),
					recipe: line.recipe ?? [],
					unit,
					quantity: line.quantity,
					...(message?.message || message?.to
						? { card: { to: message.to, message: message.message } }
						: {}),
					note: message?.note ?? "",
					...(d.addDedication && (d.dedicationMessage || d.dedicationFor)
						? {
								orderCard: {
									to: d.dedicationFor,
									message: d.dedicationMessage,
								},
							}
						: {}),
					orderNote: d.notes,
				});
			}
		});
	}
	bouquets.sort(
		(a, b) =>
			Number(a.orderNumber) - Number(b.orderNumber) ||
			a.placedAt.localeCompare(b.placedAt) ||
			a.key.localeCompare(b.key),
	);
	return {
		florist: {
			id: florist.id,
			name: florist.name,
			phone: florist.phone,
			notes: florist.notes,
		},
		bouquets,
		doneCount,
		flowerPhotos: flowerPhotoMap(),
		generatedAt: new Date().toISOString(),
	};
}
