import {
	type ActivityChange,
	type ActivitySnapshot,
	diffSnapshots,
	yesNo,
} from "~/lib/activity-log";
import { type CustomWrapper, wrapperColors } from "~/lib/custom-bouquet";
import { formatPrice } from "~/lib/product";
import type { AdminProduct, RecipeItem } from "~/types/product";
import { listArrangementTypes } from "./arrangement-types-repo";
import { listSizes } from "./sizes-repo";
import type { Supplier } from "./suppliers-repo";
import { listSuppliers } from "./suppliers-repo";

/** Fields of a snapshot, for the common case of no `about`. */
function fields(
	entries: [key: string, field: string, value: string][],
): ActivitySnapshot {
	return new Map(entries.map(([key, field, value]) => [key, { field, value }]));
}

const peso = (amount: number) =>
	amount === 0 ? "Free" : formatPrice(amount, "PHP");
const count = (value: number | undefined | null, none: string) =>
	value === undefined || value === null ? none : String(value);
const photo = (value: string) => (value ? "Photo" : "");

/** "12 Roses · Red, 3 Gypsophila (filler)". */
const recipeText = (recipe: RecipeItem[]) =>
	recipe
		.map((item) =>
			`${item.count ?? ""} ${item.flower}${item.color ? ` · ${item.color}` : ""}${item.filler ? " (filler)" : ""}`.trim(),
		)
		.join(", ");

/** Supplier names by id, as they are now. */
export function supplierNames() {
	return new Map(listSuppliers().map((s) => [s.id, s.name]));
}

export function wrapperSnapshot(
	wrapper: CustomWrapper | null | undefined,
	names = supplierNames(),
): ActivitySnapshot {
	if (!wrapper) return new Map();
	const snapshot = fields([
		["name", "Name", wrapper.name],
		["code", "Code", wrapper.code ?? ""],
		["colors", "Colors", wrapperColors(wrapper).join(", ")],
		["price", "Price", peso(wrapper.price)],
		["stock", "Stock on hand", count(wrapper.stock, "Not counted")],
		["stockActual", "Stock actual", count(wrapper.stockActual, "")],
		["enabled", "Offered in the builder", yesNo(wrapper.enabled)],
		[
			"suppliers",
			"Suppliers",
			(wrapper.supplierIds ?? [])
				.map((id) => names.get(id) ?? "Deleted supplier")
				.join(", "),
		],
	]);
	snapshot.set("image", {
		field: "Photo",
		value: wrapper.image ?? "",
		show: photo,
	});
	return snapshot;
}

/** What changed on a wrapper; a new one lists only its suppliers. */
export function wrapperChanges(
	before: CustomWrapper | null | undefined,
	after: CustomWrapper | null | undefined,
	names = supplierNames(),
): ActivityChange[] {
	const changes = diffSnapshots(
		wrapperSnapshot(before, names),
		wrapperSnapshot(after, names),
	);
	return before ? changes : changes.filter((c) => c.field === "Suppliers");
}

export function supplierSnapshot(
	supplier: Supplier | null | undefined,
): ActivitySnapshot {
	if (!supplier) return new Map();
	return fields([
		["name", "Name", supplier.name],
		["contactName", "Contact person", supplier.contactName],
		["phone", "Phone", supplier.phone],
		["email", "Email", supplier.email],
		["notes", "Notes", supplier.notes],
	]);
}

export function bouquetSnapshot(
	product: AdminProduct | null | undefined,
): ActivitySnapshot {
	if (!product) return new Map();
	const types = new Map(listArrangementTypes().map((t) => [t.id, t.name]));
	const sizes = new Map(listSizes().map((s) => [s.id, s.name]));
	const snapshot = fields([
		["title", "Name", product.title],
		["description", "Description", product.description],
		[
			"arrangement",
			"Type",
			types.get(product.arrangement) ?? product.arrangement,
		],
		[
			"size",
			"Size",
			product.size ? (sizes.get(product.size) ?? product.size) : "",
		],
		["visible", "Shown in the shop", yesNo(product.isVisible)],
		["recipe", "Flowers", recipeText(product.recipe)],
	]);
	for (const style of product.variants) {
		const set = (
			key: string,
			field: string,
			value: string,
			show?: (value: string) => string,
		) =>
			snapshot.set(`style:${style.id}:${key}`, {
				field,
				about: style.colorName,
				value,
				...(show ? { show } : {}),
			});
		set("name", "Style", style.colorName);
		set(
			"swatch",
			"Swatch",
			[style.colorHex, style.colorHex2].filter(Boolean).join(" + "),
		);
		set("price", "Price", style.price === undefined ? "" : peso(style.price));
		set("available", "Available", yesNo(style.isAvailable));
		set("readyStock", "Ready-made stock", count(style.readyStock, "No limit"));
		set("preorders", "Takes pre-orders", yesNo(style.takesPreorders));
		set(
			"preorderSlots",
			"Pre-order slots",
			style.takesPreorders ? count(style.preorderSlots, "No limit") : "",
		);
		set(
			"ready",
			"Pre-orders ready",
			style.readyInDays
				? `${style.readyInDays} days after ordering`
				: (style.readyOn ?? ""),
		);
		set("ai", "AI-enhanced photos", yesNo(!!style.aiPhotos));
		set("photos", "Photos", style.images.join("|"), (value) => {
			const n = value ? value.split("|").length : 0;
			return n ? `${n} photo${n === 1 ? "" : "s"}` : "";
		});
		set(
			"captions",
			"Photo captions",
			(style.imageCaptions ?? []).filter(Boolean).join(" / "),
		);
		set("wrappers", "Wrappers", style.wrapperColor);
		set(
			"recipe",
			"Flowers",
			style.hasOwnRecipe ? recipeText(style.recipe) : "Same as the arrangement",
		);
	}
	return snapshot;
}

/**
 * What changed on an arrangement; a new one logs only that it was added. Style
 * ids are slugs without colons, so `style:<id>:<part>` splits cleanly.
 */
export function bouquetChanges(
	before: AdminProduct | null | undefined,
	after: AdminProduct | null | undefined,
) {
	if (!before) return [];
	const had = new Set(before.variants.map((style) => style.id));
	const has = new Set(after?.variants.map((style) => style.id));
	// A style added or taken off is one row, not one per field.
	return diffSnapshots(bouquetSnapshot(before), bouquetSnapshot(after)).filter(
		(change) => {
			const [, id, part] = change.key?.split(":") ?? [];
			if (!id || (had.has(id) && has.has(id))) return true;
			return part === "name";
		},
	);
}
