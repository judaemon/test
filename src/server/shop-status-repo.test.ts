import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs on a throwaway database. Never the shop's own. */
process.env.DATABASE_PATH = join(
	mkdtempSync(join(tmpdir(), "oraia-test-")),
	"test.sqlite",
);

let repo: typeof import("./shop-status-repo");
let saveRaw: (value: unknown) => void;

beforeAll(async () => {
	const { getDb } = await import("./db");
	repo = await import("./shop-status-repo");
	saveRaw = (value) =>
		getDb()
			.query(
				`INSERT INTO settings (key, value, updated_at) VALUES ('shop_status', $value, '')
				 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			)
			.run({ value: JSON.stringify(value) });
});

describe("shop status", () => {
	test("statuses saved before view only keep their open or closed", () => {
		saveRaw({ closed: true, heading: "Full", message: "Thanks" });
		expect(repo.getShopStatus().mode).toBe("closed");
		saveRaw({ closed: false, heading: "Full", message: "Thanks" });
		expect(repo.getShopStatus().mode).toBe("open");
	});
	test("view only is kept", () => {
		const saved = repo.saveShopStatus({
			mode: "view",
			heading: "Full",
			message: "Thanks",
		});
		expect(saved.mode).toBe("view");
		expect(repo.getShopStatus().mode).toBe("view");
	});
	test("an unknown mode reads as open", () => {
		saveRaw({ mode: "nope", heading: "Full", message: "Thanks" });
		expect(repo.getShopStatus().mode).toBe("open");
	});
});
