import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs the real database code, on a throwaway database. Never the shop's own. */
process.env.DATABASE_PATH = join(
	mkdtempSync(join(tmpdir(), "oraia-test-")),
	"test.sqlite",
);

let db: typeof import("./db");
let catalog: typeof import("./catalog-repo");
let tables: typeof import("./bouquet-tables");
let flowers: typeof import("./flowers-repo");

const ROSES = { flower: "Roses", color: "Red", count: 12 };
const TULIPS = { flower: "Tulips", count: 6 };

const style = (
	name: string,
	recipe: { flower: string; count: number }[] = [],
) => ({
	colorName: name,
	colorHex: "#f2a6b8",
	price: 1000,
	isAvailable: true,
	images: ["/images/x.jpg"],
	recipe,
	wrapperIds: [] as string[],
});

const addBouquet = (
	title: string,
	recipe: { flower: string; count: number }[],
	styles: ReturnType<typeof style>[],
) =>
	catalog.saveProduct(null, {
		title,
		description: "",
		size: "",
		isVisible: true,
		recipe,
		variants: styles,
	});

const variant = (id: string, name: string) =>
	catalog.getAdminProduct(id)?.variants.find((v) => v.colorName === name);

beforeAll(async () => {
	db = await import("./db");
	catalog = await import("./catalog-repo");
	tables = await import("./bouquet-tables");
	flowers = await import("./flowers-repo");
	db.getDb();
});

describe("a style's flowers", () => {
	test("come from the bouquet unless it has its own", () => {
		const id = addBouquet(
			"Testa",
			[ROSES],
			[style("Plain"), style("Special", [TULIPS])],
		);
		const plain = variant(id, "Plain");
		const special = variant(id, "Special");
		expect(plain?.recipe).toEqual([ROSES]);
		expect(plain?.hasOwnRecipe).toBe(false);
		expect(special?.recipe).toEqual([TULIPS]);
		expect(special?.hasOwnRecipe).toBe(true);
		expect(catalog.getAdminProduct(id)?.recipe).toEqual([ROSES]);
	});

	test("changing the bouquet's flowers only reaches styles using them", () => {
		const id = addBouquet(
			"Testb",
			[ROSES],
			[style("Plain"), style("Special", [TULIPS])],
		);
		catalog.saveProduct(id, {
			title: "Testb",
			description: "",
			size: "",
			isVisible: true,
			recipe: [{ ...ROSES, count: 24 }],
			variants: [
				{ ...style("Plain"), id: "plain" },
				{ ...style("Special", [TULIPS]), id: "special" },
			],
		});
		expect(variant(id, "Plain")?.recipe[0]?.count).toBe(24);
		expect(variant(id, "Special")?.recipe).toEqual([TULIPS]);
	});

	test("turning a style's own flowers off goes back to the bouquet's", () => {
		const id = addBouquet("Testc", [ROSES], [style("Special", [TULIPS])]);
		catalog.saveProduct(id, {
			title: "Testc",
			description: "",
			size: "",
			isVisible: true,
			recipe: [ROSES],
			variants: [{ ...style("Special"), id: "special" }],
		});
		expect(variant(id, "Special")?.recipe).toEqual([ROSES]);
		expect(variant(id, "Special")?.hasOwnRecipe).toBe(false);
	});

	test("a style's own flowers can't just repeat the bouquet's", () => {
		expect(() =>
			addBouquet("Testh", [ROSES, TULIPS], [style("Copy", [TULIPS, ROSES])]),
		).toThrow(/same as the bouquet’s/);
		expect(catalog.listAdminProducts().some((p) => p.title === "Testh")).toBe(
			false,
		);
	});

	test("the shop gets the final flowers, without staff-only fields", () => {
		const id = addBouquet("Testd", [ROSES], [style("Plain")]);
		const shop = catalog.listPublicProducts().find((p) => p.id === id);
		expect(shop?.variants[0]?.recipe).toEqual([ROSES]);
		expect(shop?.variants[0]).not.toHaveProperty("hasOwnRecipe");
		expect(shop).not.toHaveProperty("recipe");
	});
});

describe("moving recipes up to the bouquet", () => {
	/** Puts a bouquet back as it was: whole recipes on its styles, none on it. */
	const asOldData = (id: string, recipes: Record<string, (typeof ROSES)[]>) => {
		const sql = db.getDb();
		sql.query("DELETE FROM bouquet_flowers WHERE bouquet_id = ?1").run(id);
		for (const [name, recipe] of Object.entries(recipes)) {
			const { id: styleId } = sql
				.query(
					"SELECT id FROM bouquet_styles WHERE bouquet_id = ?1 AND name = ?2",
				)
				.get(id, name) as { id: string };
			sql.query("DELETE FROM style_flowers WHERE style_id = ?1").run(styleId);
			recipe.forEach((item, sort) => {
				sql
					.query(
						`INSERT INTO style_flowers (style_id, flower_color_id, count, sort)
						 VALUES (?1, ?2, ?3, ?4)`,
					)
					.run(
						styleId,
						tables.flowerColorIdFor(sql, item.flower, item.color),
						item.count,
						sort,
					);
			});
		}
	};
	const OTHER = { flower: "Tulips", count: 6 } as typeof ROSES;

	test("the shared recipe moves up and every style keeps what it's made of", () => {
		const id = addBouquet("Teste", [], [style("A"), style("B"), style("C")]);
		asOldData(id, { A: [OTHER], B: [ROSES], C: [ROSES] });
		tables.moveRecipesToBouquets(db.getDb());

		expect(catalog.getAdminProduct(id)?.recipe).toEqual([ROSES]);
		expect(variant(id, "A")?.recipe).toEqual([TULIPS]);
		expect(variant(id, "A")?.hasOwnRecipe).toBe(true);
		expect(variant(id, "B")?.recipe).toEqual([ROSES]);
		expect(variant(id, "B")?.hasOwnRecipe).toBe(false);
		expect(variant(id, "C")?.hasOwnRecipe).toBe(false);
	});

	test("on a tie the first style's becomes the default", () => {
		const id = addBouquet("Testf", [], [style("A"), style("B")]);
		asOldData(id, { A: [ROSES], B: [OTHER] });
		tables.moveRecipesToBouquets(db.getDb());
		expect(catalog.getAdminProduct(id)?.recipe).toEqual([ROSES]);
		expect(variant(id, "B")?.recipe).toEqual([TULIPS]);
		expect(variant(id, "B")?.hasOwnRecipe).toBe(true);
	});

	test("running it again changes nothing", () => {
		const before = JSON.stringify(catalog.listAdminProducts());
		tables.moveRecipesToBouquets(db.getDb());
		expect(JSON.stringify(catalog.listAdminProducts())).toBe(before);
	});

	test("a flower in a bouquet's default recipe can't be deleted", () => {
		const id = addBouquet("Testg", [TULIPS], [style("Plain")]);
		expect(catalog.getAdminProduct(id)).toBeDefined();
		const tulips = flowers.listFlowers().find((f) => f.name === "Tulips");
		expect(tulips?.usedIn).toBeGreaterThan(0);
		expect(() => flowers.deleteFlower(String(tulips?.id))).toThrow(/It’s in/);
	});
});
