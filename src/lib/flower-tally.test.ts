import { describe, expect, test } from "bun:test";
import { orderFlowers, tallyFlowers } from "./flower-tally";
import { compareFlowers } from "./flowers";

describe("orderFlowers", () => {
	test("multiplies each recipe by the bouquets ordered", () => {
		const { flowers, missing } = orderFlowers([
			{
				quantity: 2,
				recipe: [
					{ flower: "Roses", color: "Red", count: 12 },
					{ flower: "Gypsophila", count: 1, filler: true },
				],
			},
			{ quantity: 1, recipe: [{ flower: "Roses", color: "Red", count: 6 }] },
			{ quantity: 3 },
		]);
		expect(missing).toBe(3);
		expect(flowers).toEqual([
			{
				flower: "Roses",
				color: "Red",
				filler: false,
				stems: 30,
				clusters: 0,
				bouquets: 3,
			},
			{
				flower: "Gypsophila",
				color: "",
				filler: true,
				stems: 2,
				clusters: 0,
				bouquets: 2,
			},
		]);
	});

	test("counts old clusters apart from stems", () => {
		const { flowers } = orderFlowers([
			{ quantity: 2, recipe: [{ flower: "Aster", color: "Violet" }] },
		]);
		expect(flowers[0]).toMatchObject({ stems: 0, clusters: 2, bouquets: 2 });
	});
});

describe("tallyFlowers", () => {
	test("adds up orders by flower, then color", () => {
		const a = orderFlowers([
			{
				quantity: 1,
				recipe: [
					{ flower: "Roses", color: "Red", count: 18 },
					{ flower: "Gypsophila", count: 1, filler: true },
				],
			},
		]).flowers;
		const b = orderFlowers([
			{
				quantity: 1,
				recipe: [
					{ flower: "Roses", color: "Pink", count: 20 },
					{ flower: "Roses", color: "Red", count: 5 },
					{ flower: "Sunflower", count: 3 },
				],
			},
		]).flowers;
		const tally = tallyFlowers([
			{ id: "a", flowers: a },
			{ id: "b", flowers: b },
		]);
		// One A to Z list: the filler Gypsophila isn't sent to the end.
		expect(tally.map((row) => [row.flower, row.stems])).toEqual([
			["Gypsophila", 1],
			["Roses", 43],
			["Sunflower", 3],
		]);
		const roses = tally[1];
		expect(roses?.orderIds).toEqual(["a", "b"]);
		// Colors A to Z too, not by how many.
		expect(
			roses?.colors.map((row) => [row.color, row.stems, row.orderIds]),
		).toEqual([
			["Pink", 20, ["b"]],
			["Red", 23, ["a", "b"]],
		]);
	});

	test("groups by flower name, its filler colors in with the rest", () => {
		const flowers = orderFlowers([
			{
				quantity: 2,
				recipe: [
					{ flower: "Aster", color: "White", count: 3 },
					{ flower: "Aster", color: "White", count: 1, filler: true },
					{ flower: "Aster", color: "Violet", count: 2, filler: true },
					{ flower: "Misty", color: "Violet", count: 1, filler: true },
				],
			},
		]).flowers;
		const tally = tallyFlowers([{ id: "a", flowers }]);
		expect(tally.map((row) => [row.flower, row.stems, row.filler])).toEqual([
			["Aster", 12, false],
			["Misty", 2, true],
		]);
		expect(
			tally[0]?.colors.map((row) => [row.color, row.filler, row.stems]),
		).toEqual([
			["Violet", true, 4],
			["White", false, 6],
			["White", true, 2],
		]);
	});
});

describe("compareFlowers", () => {
	test("one A to Z list, a filler right after the same flower and color", () => {
		const list = [
			{ flower: "Sunflower" },
			{ flower: "Aster", color: "White", filler: true },
			{ flower: "Alstroemeria", color: "Pink", filler: true },
			{ flower: "Roses", color: "Peach" },
			{ flower: "Aster", color: "White" },
			{ flower: "Alstroemeria", color: "White" },
			{ flower: "Goldenrod", filler: true },
			{ flower: "Goldenrod" },
		].sort(compareFlowers);
		expect(
			list.map((f) =>
				[f.flower, f.color, f.filler ? "filler" : ""].filter(Boolean).join(" "),
			),
		).toEqual([
			"Alstroemeria Pink filler",
			"Alstroemeria White",
			"Aster White",
			"Aster White filler",
			"Goldenrod",
			"Goldenrod filler",
			"Roses Peach",
			"Sunflower",
		]);
	});
});
