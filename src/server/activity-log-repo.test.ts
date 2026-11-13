import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs on a throwaway database. Never the shop's own. */
process.env.DATABASE_PATH = join(
	mkdtempSync(join(tmpdir(), "oraia-test-")),
	"test.sqlite",
);

let repo: typeof import("./activity-log-repo");

/** Names only these tests use, so other tests' rows don't count. */
const TAG = `logtest-${Date.now()}`;

beforeAll(async () => {
	const { getDb } = await import("./db");
	repo = await import("./activity-log-repo");
	const add = getDb().query(
		`INSERT INTO activity_log (at, actor_type, actor_name, area, entity_id,
		   entity_name, action, field, from_value, to_value)
		 VALUES ($at, $type, $name, 'wrappers', $id, $entity, 'updated', 'Price',
		   $from, $to)`,
	);
	// 23:30 on Nov 13 in Manila, then 00:30 and 18:00 on Nov 14.
	add.run({
		at: "2026-11-13T15:30:00.000Z",
		type: "staff",
		name: `${TAG} Mia`,
		id: "w1",
		entity: "80",
		from: "100",
		to: "120",
	});
	add.run({
		at: "2026-11-13T16:30:00.000Z",
		type: "staff",
		name: `${TAG} Mia`,
		id: "w2",
		entity: "180",
		from: "5",
		to: `${TAG} 50%_off`,
	});
	add.run({
		at: "2026-11-14T10:00:00.000Z",
		type: "customer",
		name: `${TAG} Ana`,
		id: "w1",
		entity: "80",
		from: "a",
		to: "b",
	});
});

const keys = (query: Parameters<typeof repo.listLogs>[0]) =>
	repo
		.listLogs({ pageSize: 200, ...query })
		.entries.filter((entry) => entry.actor.name.startsWith(TAG));

describe("listLogs filters", () => {
	test("an order number matches that number only, with or without #", () => {
		expect(keys({ search: "80" })).toHaveLength(2);
		expect(keys({ search: "#80" })).toHaveLength(2);
		expect(keys({ search: "180" })).toHaveLength(1);
	});
	test("text matches values, and % or _ are taken literally", () => {
		expect(keys({ search: `${TAG} 50%_off` })).toHaveLength(1);
		expect(keys({ search: `${TAG} 50%xoff` })).toHaveLength(0);
	});
	test("dates are whole days, Manila time", () => {
		expect(keys({ from: "2026-11-14", to: "2026-11-14" })).toHaveLength(2);
		expect(keys({ to: "2026-11-13" })).toHaveLength(1);
		expect(keys({ from: "2026-11-15" })).toHaveLength(0);
	});
	test("by person or by staff and customers", () => {
		expect(keys({ actorType: "staff" })).toHaveLength(2);
		expect(keys({ actorType: "customer" })).toHaveLength(1);
		expect(
			keys({ actor: `${TAG} Mia`, from: "2026-11-14", to: "2026-11-14" }),
		).toHaveLength(1);
	});
});
