import { lineKey } from "~/lib/bouquet-messages";
import { formatRecipeItem } from "~/lib/flowers";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "~/lib/payment";
import { formatPrice, lineName } from "~/lib/product";
import {
	type Order,
	type OrderStage,
	type PaymentStatus,
	STAGE_LABELS,
	WRAPPER_STATUS_LABELS,
	type WrapperStatus,
} from "~/types/order";
import type { RecipeItem } from "~/types/product";

/** Who made a change to an order, and from which page. */
export interface OrderActor {
	type: "staff" | "customer" | "system";
	name: string;
	/** The account that did it, when signed in. */
	userId?: string;
	/** The page it was done from, e.g. `/admin/orders/…`. */
	source?: string;
}

export const SYSTEM_ACTOR: OrderActor = { type: "system", name: "System" };

/** What was done; one action can change several fields. */
export const ORDER_LOG_ACTIONS = {
	placed: "Placed the order",
	stage: "Moved the order",
	payment_review: "Reviewed the payment",
	payment_method: "Changed the payment method",
	payment_sent: "Sent a payment",
	payment_reference: "Set the reference number",
	cancelled: "Cancelled the order",
	bouquet_cancelled: "Cancelled a bouquet",
	customer_edit: "Edited the order",
	staff_edit: "Edited the order",
	test: "Changed test order",
	wrapper: "Updated a wrapper",
	rider: "Set the rider",
	delivery_photo: "Added a delivery photo",
	florist: "Assigned a florist",
	recipe_sync: "Updated from the arrangement",
} as const;
export type OrderLogAction = keyof typeof ORDER_LOG_ACTIONS;

/** The fields the log tracks, as staff read them. */
export const ORDER_LOG_FIELDS = {
	stage: "Stage",
	payment_status: "Payment status",
	payment_method: "Payment method",
	reference_number: "Reference no.",
	amount_paid: "Paid so far",
	total: "Total",
	items: "Bouquets",
	test: "Test order",
	wrapper: "Wrapper",
	rider: "Rider",
	delivery_photo: "Delivery photo",
	name: "Customer name",
	email: "Email",
	class: "Class",
	company: "Company",
	serial: "Serial number",
	notes: "Notes",
	card: "Card",
	bouquet_card: "Card",
	bouquet_note: "Note",
	florist: "Florist",
	recipe: "Flowers",
	wrapper_used: "Wrapper used",
} as const;
export type OrderLogField = keyof typeof ORDER_LOG_FIELDS;

/** One change to one field (or, with no field, an action on its own). */
export interface OrderLogChange {
	field?: OrderLogField;
	from?: string;
	to?: string;
	/** Which bouquet a wrapper change was for. */
	about?: string;
}

/** A row of the log as staff see it. */
export interface OrderLogEntry extends OrderLogChange {
	id: number;
	orderId: string;
	orderNumber?: string;
	at: string;
	actor: OrderActor;
	action: OrderLogAction;
	/** A reason given, e.g. for cancelling or changing the method. */
	reason?: string;
}

const money = (order: Order, value: number | undefined) =>
	value === undefined ? "" : formatPrice(value, order.currency);

const PAYMENT_STATUS_TEXT: Record<PaymentStatus, string> = {
	on_hold: "On hold",
	pending: "Verifying payment",
	rejected: "Rejected",
	verified: "Verified",
	paid: "Paid",
};

/** Each tracked field's value, as text, so before and after can be compared. */
function snapshot(order: Order): [OrderLogField, string][] {
	const d = order.details;
	return [
		["stage", order.stage],
		["payment_status", order.payment.status],
		["payment_method", order.payment.method],
		["reference_number", order.payment.referenceNumber ?? ""],
		["amount_paid", money(order, order.payment.amountPaid)],
		["total", money(order, order.total)],
		["items", String(order.itemCount)],
		["test", order.isTest ? "yes" : "no"],
		[
			"rider",
			[order.delivery.riderName, order.delivery.riderPhone]
				.filter(Boolean)
				.join(" · "),
		],
		["delivery_photo", order.delivery.photoFile ?? ""],
		["name", d.fullName],
		["email", d.email],
		["class", d.className],
		["company", d.company],
		["serial", d.serialNumber],
		["notes", d.notes],
		["card", cardText(d.dedicationFor, d.dedicationMessage)],
	];
}

/** "6 × Roses · Pink, 1 × Misty · Violet (filler)". */
const recipeText = (recipe: RecipeItem[] | undefined) =>
	(recipe ?? []).map(formatRecipeItem).join(", ");

/** A card as one line of the log: "To Ana: Happy birthday!". */
const cardText = (to = "", message = "") =>
	message ? (to ? `To ${to}: ${message}` : message) : to ? `To ${to}` : "";

/**
 * Each bouquet's card and note, keyed by bouquet and which of its kind, so
 * they compare across edits that keep the bouquet.
 */
function bouquetMessages(order: Order) {
	const byUnit = new Map<
		string,
		{ about: string; card: string; note: string; florist: string }
	>();
	for (const line of order.lines) {
		for (let unit = 0; unit < line.quantity; unit++) {
			const message = line.messages?.[unit];
			byUnit.set(`${lineKey(line)}#${unit}`, {
				about:
					line.quantity > 1
						? `${lineName(line)} (${unit + 1} of ${line.quantity})`
						: lineName(line),
				card: cardText(message?.to, message?.message),
				note: message?.note ?? "",
				florist: line.florists?.[unit] ?? "",
			});
		}
	}
	return byUnit;
}

/**
 * What changed between two versions of an order. Wrappers, cards and notes
 * are compared per bouquet; the delivery photo says only that it changed.
 */
export function diffOrders(
	before: Order | undefined,
	after: Order,
	/** A florist's name from their id, so the log reads as names. */
	floristName: (id: string) => string = (id) => id,
): OrderLogChange[] {
	if (!before) return [];
	const old = new Map(snapshot(before));
	const changes: OrderLogChange[] = [];
	for (const [field, value] of snapshot(after)) {
		const was = old.get(field) ?? "";
		if (was === value) continue;
		if (field === "delivery_photo")
			changes.push({ field, from: was ? "set" : "", to: value ? "set" : "" });
		else changes.push({ field, from: was, to: value });
	}
	// Wrappers by bouquet; only lines still in the order are compared.
	after.lines.forEach((line, index) => {
		const previous = before.lines[index];
		if (!previous || previous.variantId !== line.variantId) return;
		const was = previous.wrapperStatus ?? "todo";
		const now = line.wrapperStatus ?? "todo";
		if (was !== now)
			changes.push({
				field: "wrapper",
				from: was,
				to: now,
				about: lineName(line),
			});
	});
	// Flowers by bouquet, e.g. when an arrangement's recipe is brought over.
	after.lines.forEach((line, index) => {
		const previous = before.lines[index];
		if (!previous || lineKey(previous) !== lineKey(line)) return;
		const was = recipeText(previous.recipe);
		const now = recipeText(line.recipe);
		if (was !== now)
			changes.push({
				field: "recipe",
				from: was,
				to: now,
				about: lineName(line),
			});
		if ((previous.wrapperColor ?? "") !== (line.wrapperColor ?? ""))
			changes.push({
				field: "wrapper_used",
				from: previous.wrapperColor ?? "",
				to: line.wrapperColor ?? "",
				about: lineName(line),
			});
	});
	// Cards and notes of bouquets on both versions; a bouquet added or taken
	// off shows in "Bouquets" instead.
	const oldMessages = bouquetMessages(before);
	for (const [key, now] of bouquetMessages(after)) {
		const was = oldMessages.get(key);
		if (!was) continue;
		if (was.card !== now.card)
			changes.push({
				field: "bouquet_card",
				from: was.card,
				to: now.card,
				about: now.about,
			});
		if (was.note !== now.note)
			changes.push({
				field: "bouquet_note",
				from: was.note,
				to: now.note,
				about: now.about,
			});
		if (was.florist !== now.florist)
			changes.push({
				field: "florist",
				from: was.florist ? floristName(was.florist) : "",
				to: now.florist ? floristName(now.florist) : "",
				about: now.about,
			});
	}
	return changes;
}

/** A field's stored value, as staff read it. */
export function formatLogValue(field: OrderLogField | undefined, value = "") {
	if (!value) return "";
	switch (field) {
		case "stage":
			return STAGE_LABELS[value as OrderStage] ?? value;
		case "payment_status":
			return PAYMENT_STATUS_TEXT[value as PaymentStatus] ?? value;
		case "payment_method":
			return PAYMENT_METHOD_LABELS[value as PaymentMethod] ?? value;
		case "wrapper":
			return WRAPPER_STATUS_LABELS[value as WrapperStatus] ?? value;
		case "test":
			return value === "yes" ? "Yes" : "No";
		// Older entries only say a note was there, not what it said.
		case "notes":
		case "delivery_photo":
			return value === "set" ? "Added" : value;
		default:
			return value;
	}
}

/** Where a change was made, from the page's path. */
export function formatLogSource(actor: OrderActor) {
	const path = actor.source;
	if (!path) return actor.type === "system" ? "Automatic" : "—";
	const pages: [RegExp, string][] = [
		[/^\/admin\/orders\/new/, "Admin · Add custom order"],
		[/^\/admin\/orders\/[^/]+\/edit/, "Admin · Edit order"],
		[/^\/admin\/orders\/[^/]+/, "Admin · Order page"],
		[/^\/admin\/orders\/?$/, "Admin · Orders list"],
		[/^\/admin\/signature-bouquets\/arrange/, "Admin · Arrange the shop"],
		[/^\/admin\/signature-bouquets\/[^/]+/, "Admin · Arrangement page"],
		[/^\/admin\/signature-bouquets/, "Admin · Floral arrangements"],
		[/^\/admin\/wrappers\/[^/]+/, "Admin · Wrapper page"],
		[/^\/admin\/wrappers/, "Admin · Wrappers list"],
		[/^\/admin\/suppliers\/[^/]+/, "Admin · Supplier page"],
		[/^\/admin\/flowers/, "Admin · Flowers"],
		[/^\/admin\/florists\/[^/]+/, "Admin · Florist page"],
		[/^\/admin\/florists/, "Admin · Florists list"],
		[/^\/admin\/suppliers/, "Admin · Suppliers list"],
		[/^\/admin\/?$/, "Admin · Board"],
		[/^\/admin/, "Admin"],
		[/^\/checkout/, "Checkout"],
		[/^\/pay\//, "Pay page"],
		[/^\/order\/[^/]+\/edit/, "Edit order page"],
		[/^\/order\//, "Order page"],
		[/^\/active-orders/, "Check your order"],
		[/^\/account/, "My account"],
	];
	return pages.find(([pattern]) => pattern.test(path))?.[1] ?? path;
}

/** "Today, 3:40 PM", "Yesterday, 9:05 AM", or the date, in Manila time. */
export function formatLogTime(at: string, now = new Date()) {
	const zone = "Asia/Manila";
	const day = (date: Date) =>
		date.toLocaleDateString("en-CA", { timeZone: zone });
	const when = new Date(at);
	const time = when.toLocaleTimeString("en-PH", {
		timeZone: zone,
		hour: "numeric",
		minute: "2-digit",
	});
	if (day(when) === day(now)) return `Today, ${time}`;
	if (day(when) === day(new Date(now.getTime() - 86_400_000)))
		return `Yesterday, ${time}`;
	return when.toLocaleString("en-PH", {
		timeZone: zone,
		dateStyle: "medium",
		timeStyle: "short",
	});
}
