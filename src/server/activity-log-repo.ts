import {
	ACTIVITY_ACTIONS,
	type ActivityAction,
	type ActivityArea,
	type ActivityChange,
	type LogArea,
	type LogEntry,
} from "~/lib/activity-log";
import {
	formatLogValue,
	ORDER_LOG_ACTIONS,
	ORDER_LOG_FIELDS,
	type OrderActor,
	type OrderLogAction,
	type OrderLogField,
} from "~/lib/order-log";
import { addDays, shopDayStartIso } from "~/lib/time";
import { getDb, nowIso } from "./db";

/**
 * Records a change to a wrapper, supplier or arrangement, one row per field.
 * With no changes, one row says what was done (a delete, say).
 */
export function writeActivity(
	area: ActivityArea,
	entity: { id: string | null; name: string },
	actor: OrderActor,
	action: ActivityAction,
	changes: ActivityChange[] = [],
) {
	const insert = getDb().query(
		`INSERT INTO activity_log (at, actor_type, actor_name, actor_id, source, area,
		   entity_id, entity_name, action, field, about, from_value, to_value)
		 VALUES ($at, $type, $name, $actorId, $source, $area,
		   $entityId, $entityName, $action, $field, $about, $from, $to)`,
	);
	const at = nowIso();
	for (const change of changes.length ? changes : [undefined]) {
		insert.run({
			at,
			type: actor.type,
			name: actor.name,
			actorId: actor.userId ?? null,
			source: actor.source ?? null,
			area,
			entityId: entity.id,
			entityName: entity.name,
			action,
			field: change?.field ?? null,
			about: change?.about ?? null,
			from: change?.from ?? null,
			to: change?.to ?? null,
		});
	}
}

interface Row {
	src: "o" | "a";
	id: number;
	at: string;
	actor_type: OrderActor["type"];
	actor_name: string;
	actor_id: string | null;
	source: string | null;
	area: LogArea;
	item_id: string | null;
	item_name: string | null;
	action: string;
	field: string | null;
	about: string | null;
	from_value: string | null;
	to_value: string | null;
	reason: string | null;
}

/** Both logs as one, with the same columns. */
const BOTH = `
	SELECT 'o' AS src, l.id, l.at, l.actor_type, l.actor_name, l.actor_id, l.source,
	  'orders' AS area, l.order_id AS item_id, o.number AS item_name, l.action,
	  l.field, l.about, l.from_value, l.to_value, l.reason
	FROM order_log l LEFT JOIN orders o ON o.id = l.order_id
	UNION ALL
	SELECT 'a', id, at, actor_type, actor_name, actor_id, source, area, entity_id,
	  entity_name, action, field, about, from_value, to_value, NULL
	FROM activity_log`;

function toEntry(row: Row): LogEntry {
	const actor: OrderActor = {
		type: row.actor_type,
		name: row.actor_name,
		...(row.actor_id ? { userId: row.actor_id } : {}),
		...(row.source ? { source: row.source } : {}),
	};
	const base = {
		key: `${row.src}${row.id}`,
		at: row.at,
		actor,
		area: row.area,
		...(row.item_id ? { itemId: row.item_id } : {}),
		...(row.about ? { about: row.about } : {}),
		...(row.reason ? { reason: row.reason } : {}),
	};
	if (row.src === "o") {
		const field = row.field as OrderLogField | null;
		return {
			...base,
			itemName: row.item_name ? `#${row.item_name}` : "Deleted order",
			action: ORDER_LOG_ACTIONS[row.action as OrderLogAction] ?? row.action,
			...(field ? { field: ORDER_LOG_FIELDS[field] ?? field } : {}),
			from: formatLogValue(field ?? undefined, row.from_value ?? ""),
			to: formatLogValue(field ?? undefined, row.to_value ?? ""),
		};
	}
	return {
		...base,
		itemName: row.item_name ?? "",
		action: ACTIVITY_ACTIONS[row.action as ActivityAction] ?? row.action,
		...(row.field ? { field: row.field } : {}),
		from: row.from_value ?? "",
		to: row.to_value ?? "",
	};
}

export interface LogQuery {
	area?: LogArea;
	/** One order, wrapper, supplier or arrangement, by id (with `area`). */
	itemId?: string;
	/** Only this person's changes, by the name shown. */
	actor?: string;
	/** Only changes made by staff, customers or the system. */
	actorType?: OrderActor["type"];
	/**
	 * An order number ("80" or "#80") finds that order's changes; other text
	 * finds it in names, notes and the before and after values.
	 */
	search?: string;
	/** First and last day to include, `YYYY-MM-DD`, Manila time. */
	from?: string;
	to?: string;
	page?: number;
	pageSize?: number;
}

/** Every change, newest first, a page at a time, with who appears in it. */
export function listLogs(query: LogQuery = {}) {
	const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
	const page = Math.max(query.page ?? 1, 1);
	const scope: string[] = [];
	const params: Record<string, string | number> = {};
	if (query.area) {
		scope.push("area = $area");
		params.area = query.area;
		if (query.itemId) {
			scope.push("item_id = $itemId");
			params.itemId = query.itemId;
		}
	}
	const where = (parts: string[]) =>
		parts.length ? `WHERE ${parts.join(" AND ")}` : "";
	const filter = [...scope];
	const filterParams = { ...params };
	if (query.actor) {
		filter.push("actor_name = $actor");
		filterParams.actor = query.actor;
	}
	if (query.actorType) {
		filter.push("actor_type = $actorType");
		filterParams.actorType = query.actorType;
	}
	const search = query.search?.trim();
	const orderNumber = search?.match(/^#?\s*(\d+)$/)?.[1];
	if (orderNumber) {
		filter.push("item_name = $number");
		filterParams.number = orderNumber;
	} else if (search) {
		filter.push(
			`(item_name LIKE $like ESCAPE '\\' OR about LIKE $like ESCAPE '\\'
			  OR from_value LIKE $like ESCAPE '\\' OR to_value LIKE $like ESCAPE '\\')`,
		);
		filterParams.like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
	}
	if (query.from) {
		filter.push("at >= $fromAt");
		filterParams.fromAt = shopDayStartIso(query.from);
	}
	if (query.to) {
		filter.push("at < $toAt");
		filterParams.toAt = shopDayStartIso(addDays(query.to, 1));
	}
	const db = getDb();
	const { n: total } = db
		.query(`SELECT COUNT(*) AS n FROM (${BOTH}) ${where(filter)}`)
		.get(filterParams) as { n: number };
	const rows = db
		.query(
			`SELECT * FROM (${BOTH}) ${where(filter)}
			 ORDER BY at DESC, src, id DESC LIMIT $limit OFFSET $offset`,
		)
		.all({
			...filterParams,
			limit: pageSize,
			offset: (page - 1) * pageSize,
		}) as Row[];
	/** Who appears, with whether they're staff, a customer or the system. */
	const people = db
		.query(
			`SELECT DISTINCT actor_name AS name, actor_type AS type
			 FROM (${BOTH}) ${where(scope)}
			 ORDER BY actor_name COLLATE NOCASE`,
		)
		.all(params) as { name: string; type: OrderActor["type"] }[];
	return {
		entries: rows.map(toEntry),
		total,
		page,
		pageSize,
		pageCount: Math.max(1, Math.ceil(total / pageSize)),
		people,
	};
}
export type LogPage = ReturnType<typeof listLogs>;
