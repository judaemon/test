import type { Database } from "bun:sqlite";

const REASON = "Was a test order.";

/**
 * The shop stops keeping test orders apart: each one becomes a cancelled
 * order, so it's out of the totals the same way. Marking it a test already
 * gave its stock back, so stock stays as it is. Each change is on the
 * order's history; ones already cancelled keep their reason.
 */
export function testsToCancelled(db: Database) {
	const now = new Date().toISOString();
	const tests = db
		.query("SELECT id, stage FROM orders WHERE is_test = 1")
		.all() as { id: string; stage: string }[];
	const log = db.query(
		`INSERT INTO order_log (order_id, at, actor_type, actor_name, actor_id, source,
		   action, field, from_value, to_value, about, reason)
		 VALUES ($id, $now, 'system', 'System', NULL, NULL, $action, $field, $from, $to, NULL, $reason)`,
	);
	for (const order of tests) {
		db.query("UPDATE orders SET is_test = 0 WHERE id = $id").run({
			id: order.id,
		});
		log.run({
			id: order.id,
			now,
			action: "test",
			field: "test",
			from: "yes",
			to: "no",
			reason: REASON,
		});
		if (order.stage === "cancelled") continue;
		db.query(
			`UPDATE orders SET stage = 'cancelled', stage_updated_at = $now,
			   delivered_at = NULL, cancel_reason = $reason, cancelled_by = 'System'
			 WHERE id = $id`,
		).run({ id: order.id, now, reason: REASON });
		db.query(
			"INSERT INTO order_events (order_id, stage, at) VALUES ($id, 'cancelled', $now)",
		).run({ id: order.id, now });
		log.run({
			id: order.id,
			now,
			action: "cancelled",
			field: "stage",
			from: order.stage,
			to: "cancelled",
			reason: REASON,
		});
	}
}
