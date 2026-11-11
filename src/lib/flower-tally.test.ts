import { describe, expect, test } from "bun:test";

import { orderFlowers, tallyFlowers } from "./flower-tally";

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
		expect(tally.map((row) => [row.flower, row.stems])).toEqual([
			["Roses", 43],
			["Sunflower", 3],
			["Gypsophila", 1],
		]);
		const roses = tally[0];
		expect(roses?.orderIds).toEqual(["a", "b"]);
		// Colors A to Z too, not by how many.
		expect(
			roses?.colors.map((row) => [row.color, row.stems, row.orderIds]),
		).toEqual([
			["Pink", 20, ["b"]],
			["Red", 23, ["a", "b"]],
		]);
	});
});
