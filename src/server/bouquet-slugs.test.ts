import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Runs on a throwaway database, never the shop's own. Always set: .env names
 * the real one, and bun loads it for tests too.
 */
process.env.DATABASE_PATH = join(
	mkdtempSync(join(tmpdir(), "oraia-test-")),
	"test.sqlite",
);

let slugs: typeof import("./bouquet-slugs");
let db: ReturnType<typeof import("./db").getDb>;

beforeAll(async () => {
	db = (await import("./db")).getDb();
	slugs = await import("./bouquet-slugs");
});

/** Adds a bouquet the way it was before links followed names. */
function addBouquet(id: string, name: string) {
	db.query(
		`INSERT INTO signature_bouquets (id, name, description, is_visible, sort, created_at, updated_at)
		 VALUES ($id, $name, '', 1, 999, '2026-11-01', '2026-11-01')`,
	).run({ id, name });
}
const slugOf = (id: string) =>
	(
		db.query("SELECT slug FROM signature_bouquets WHERE id = $id").get({
			id,
		}) as { slug: string }
	).slug;

describe("bouquet shop links", () => {
	test("every starter bouquet has a link", () => {
		const missing = db
			.query("SELECT COUNT(*) AS n FROM signature_bouquets WHERE slug IS NULL")
			.get() as { n: number };
		expect(missing.n).toBe(0);
	});

	test("a bouquet renamed before links followed names gets its name's link, and its id redirects", () => {
		addBouquet("zz-adeline", "Zz Fiona");
		slugs.assignMissingSlugs(db);
		expect(slugOf("zz-adeline")).toBe("zz-fiona");
		expect(slugs.findBouquetBySlug(db, "zz-fiona")).toEqual({
			id: "zz-adeline",
			slug: "zz-fiona",
			moved: false,
		});
		expect(slugs.findBouquetBySlug(db, "zz-adeline")).toEqual({
			id: "zz-adeline",
			slug: "zz-fiona",
			moved: true,
		});
	});

	test("renaming moves the link; every earlier link still redirects", () => {
		addBouquet("zz-audrey", "Zz Audrey");
		slugs.assignMissingSlugs(db);
		expect(slugOf("zz-audrey")).toBe("zz-audrey");
		slugs.updateBouquetSlug(db, "zz-audrey", "Zz Vannesa");
		slugs.updateBouquetSlug(db, "zz-audrey", "Zz Lyn");
		expect(slugOf("zz-audrey")).toBe("zz-lyn");
		for (const old of ["zz-audrey", "zz-vannesa"])
			expect(slugs.findBouquetBySlug(db, old)).toMatchObject({
				slug: "zz-lyn",
				moved: true,
			});
	});

	test("a change the link can't show (only case) keeps the link", () => {
		addBouquet("zz-mia", "Zz Mia");
		slugs.assignMissingSlugs(db);
		expect(slugs.updateBouquetSlug(db, "zz-mia", "ZZ MIA")).toBe("zz-mia");
		expect(slugs.findBouquetBySlug(db, "zz-mia")?.moved).toBe(false);
	});

	test("a new name whose link another bouquet once had takes it over", () => {
		addBouquet("zz-bea", "Zz Bea");
		addBouquet("zz-other", "Zz Other");
		slugs.assignMissingSlugs(db);
		slugs.updateBouquetSlug(db, "zz-bea", "Zz Cora");
		// zz-bea now redirects to Cora, until another bouquet is named Bea.
		slugs.updateBouquetSlug(db, "zz-other", "Zz Bea");
		expect(slugs.findBouquetBySlug(db, "zz-bea")).toEqual({
			id: "zz-other",
			slug: "zz-bea",
			moved: false,
		});
		expect(slugOf("zz-bea")).toBe("zz-cora");
	});

	test("names that read the same get numbered links", () => {
		addBouquet("zz-ana-1", "Zz Ána");
		addBouquet("zz-ana-2", "Zz Ana!");
		slugs.assignMissingSlugs(db);
		expect(new Set([slugOf("zz-ana-1"), slugOf("zz-ana-2")])).toEqual(
			new Set(["zz-ana", "zz-ana-2"]),
		);
		// A numbered link is still that name's link: saving again keeps it.
		const numbered =
			slugOf("zz-ana-1") === "zz-ana-2" ? "zz-ana-1" : "zz-ana-2";
		expect(slugs.updateBouquetSlug(db, numbered, "Zz Ana")).toBe("zz-ana-2");
	});

	test("an unknown link finds nothing", () => {
		expect(slugs.findBouquetBySlug(db, "zz-nobody")).toBeNull();
	});
});
