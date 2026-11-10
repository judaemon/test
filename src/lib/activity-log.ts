import type { OrderActor } from "~/lib/order-log";

/** What the Logs page can show, as the filter names them. */
export const LOG_AREAS = {
	orders: "Orders",
	bouquets: "Floral arrangements",
	wrappers: "Wrappers",
	suppliers: "Suppliers",
} as const;
export type LogArea = keyof typeof LOG_AREAS;
/** Areas kept in `activity_log`; orders have their own log. */
export type ActivityArea = Exclude<LogArea, "orders">;

export const isLogArea = (value: unknown): value is LogArea =>
	typeof value === "string" && value in LOG_AREAS;

/** What was done to a wrapper, supplier or arrangement. */
export const ACTIVITY_ACTIONS = {
	added: "Added",
	edited: "Edited",
	deleted: "Deleted",
	imported: "Imported from Excel",
	quick_edit: "Quick edit from the list",
	reordered: "Reordered the shop",
	style_deleted: "Deleted a style",
	supplier_deleted: "Its supplier was deleted",
} as const;
export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

/** One field before and after; `about` says which part (a style, say). */
export interface ActivityChange {
	/** The snapshot key it came from; not stored. */
	key?: string;
	field: string;
	about?: string;
	from: string;
	to: string;
}

/**
 * A thing's fields as text, keyed so the same field compares across saves:
 * `name`, or `style:pink:price` for a part of it.
 */
export type ActivitySnapshot = Map<
	string,
	{
		field: string;
		about?: string;
		value: string;
		/** How the value reads in the log, when it isn't the value itself (photos). */
		show?: (value: string) => string;
	}
>;

/** What changed between two snapshots; missing values count as empty. */
export function diffSnapshots(
	before: ActivitySnapshot,
	after: ActivitySnapshot,
): ActivityChange[] {
	const changes: ActivityChange[] = [];
	const keys = new Set([...before.keys(), ...after.keys()]);
	for (const key of keys) {
		const was = before.get(key);
		const now = after.get(key);
		const from = was?.value ?? "";
		const to = now?.value ?? "";
		if (from === to) continue;
		const label = (now ?? was) as NonNullable<typeof now>;
		const show = label.show ?? ((value: string) => value);
		// Shown alike but different underneath (photos swapped): say so.
		const shownTo = show(to);
		changes.push({
			key,
			field: label.field,
			...(label.about ? { about: label.about } : {}),
			from: show(from),
			to:
				from && to && show(from) === shownTo ? `${shownTo} (changed)` : shownTo,
		});
	}
	return changes;
}

/** A row of Admin → Logs, from either log, ready to show. */
export interface LogEntry {
	/** Unique across both logs. */
	key: string;
	at: string;
	actor: OrderActor;
	area: LogArea;
	/** The order, wrapper, supplier or arrangement, if it has a page. */
	itemId?: string;
	/** Its name (or order number) when the change was made. */
	itemName: string;
	action: string;
	field?: string;
	about?: string;
	from: string;
	to: string;
	reason?: string;
}

export const yesNo = (value: boolean) => (value ? "Yes" : "No");
