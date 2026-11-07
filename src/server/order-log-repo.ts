import type {
	OrderActor,
	OrderLogAction,
	OrderLogChange,
	OrderLogEntry,
	OrderLogField,
} from "~/lib/order-log";
import { getDb, nowIso } from "./db";

interface LogRow {
	id: number;
	order_id: string;
	order_number: string | null;
	at: string;
	actor_type: OrderActor["type"];
	actor_name: string;
	actor_id: string | null;
	source: string | null;
	action: OrderLogAction;
	field: OrderLogField | null;
	from_value: string | null;
	to_value: string | null;
	about: string | null;
	reason: string | null;
}

const toEntry = (row: LogRow): OrderLogEntry => ({
	id: row.id,
	orderId: row.order_id,
	orderNumber: row.order_number ?? undefined,
	at: row.at,
	actor: {
		type: row.actor_type,
		name: row.actor_name,
		userId: row.actor_id ?? undefined,
		source: row.source ?? undefined,
	},
	action: row.action,
	field: row.field ?? undefined,
	from: row.from_value ?? undefined,
	to: row.to_value ?? undefined,
	about: row.about ?? undefined,
	reason: row.reason ?? undefined,
});

/**
 * Records what an action changed, one row per field. An action that changed
 * none of the tracked fields (a rider saved the same) still gets one row.
 */
export function writeOrderLog(
	orderId: string,
	actor: OrderActor,
	action: OrderLogAction,
	changes: OrderLogChange[],
	reason?: string,
) {
	const insert = getDb().query(
		`INSERT INTO order_log (order_id, at, actor_type, actor_name, actor_id, source,
		   action, field, from_value, to_value, about, reason)
		 VALUES ($orderId, $at, $type, $name, $actorId, $source,
		   $action, $field, $from, $to, $about, $reason)`,
	);
	const at = nowIso();
	for (const change of changes.length ? changes : [{}]) {
		insert.run({
			orderId,
			at,
			type: actor.type,
			name: actor.name,
			actorId: actor.userId ?? null,
			source: actor.source ?? null,
			action,
			field: change.field ?? null,
			from: change.from ?? null,
			to: change.to ?? null,
			about: change.about ?? null,
			reason: reason ?? null,
		});
	}
}

export interface OrderLogQuery {
	orderId?: string;
	/** Only this person's changes, by the name shown. */
	actor?: string;
	page?: number;
	pageSize?: number;
}

/** Newest first, a page at a time, with the people who appear in it. */
export function listOrderLog(query: OrderLogQuery = {}) {
	const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
	const page = Math.max(query.page ?? 1, 1);
	const where: string[] = [];
	const params: Record<string, string | number> = {};
	if (query.orderId) {
		where.push("l.order_id = $orderId");
		params.orderId = query.orderId;
	}
	const scope = where.length ? `WHERE ${where.join(" AND ")}` : "";
	if (query.actor) {
		where.push("l.actor_name = $actor");
		params.actor = query.actor;
	}
	const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
	const db = getDb();
	const { n: total } = db
		.query(`SELECT COUNT(*) AS n FROM order_log l ${filter}`)
		.get(params) as { n: number };
	const rows = db
		.query(
			`SELECT l.*, o.number AS order_number FROM order_log l
			 LEFT JOIN orders o ON o.id = l.order_id
			 ${filter} ORDER BY l.id DESC LIMIT $limit OFFSET $offset`,
		)
		.all({
			...params,
			limit: pageSize,
			offset: (page - 1) * pageSize,
		}) as LogRow[];
	const people = (
		db
			.query(
				`SELECT DISTINCT l.actor_name AS name FROM order_log l ${scope}
				 ORDER BY l.actor_name`,
			)
			.all(query.orderId ? { orderId: query.orderId } : {}) as {
			name: string;
		}[]
	).map((row) => row.name);
	return {
		entries: rows.map(toEntry),
		total,
		page,
		pageSize,
		pageCount: Math.max(1, Math.ceil(total / pageSize)),
		people,
	};
}
export type OrderLogPage = ReturnType<typeof listOrderLog>;
