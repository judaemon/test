import { createServerFn } from "@tanstack/solid-start";

import { type CustomBouquetSettings, PESO_BILLS } from "~/lib/custom-bouquet";
import { requireStaff } from "../admin-auth";
import { type Rename, renameRecipeFlowers } from "../catalog-repo";
import { getCustomSettings, saveCustomSettings } from "../custom-repo";
import {
	asRecord,
	bool,
	InputError,
	imageUrl,
	integer,
	text,
} from "../validate";

export const getCustomSettingsAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return getCustomSettings();
	},
);

/** Zero is allowed (a free wrapper, no base fee); negatives aren't. */
function price(source: Record<string, unknown>, key: string, label: string) {
	const value = source[key];
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		throw new InputError(`${label} must be zero or more.`);
	if (value > 100_000) throw new InputError(`${label} is too large.`);
	return Math.round(value * 100) / 100;
}

interface SaveInput {
	settings: Omit<CustomBouquetSettings, "saved">;
	/** Flowers whose name changed, so bouquet recipes can follow. */
	renames: Rename[];
}

export const saveCustomSettingsFn = createServerFn({ method: "POST" })
	.validator((input: unknown): SaveInput => {
		const source = asRecord(input);
		const rawFlowers = (
			Array.isArray(source.flowers) ? source.flowers : []
		).map((f) => asRecord(f));
		if (rawFlowers.length > 80)
			throw new InputError("That’s a lot of flowers.");
		// Every flower is editable: name, counted or cluster, colors and a note.
		const seen = new Set<string>();
		const renames: Rename[] = [];
		const flowers = rawFlowers.map((raw) => {
			const name = text(raw, "name", { label: "Flower name", max: 40 }).replace(
				/\s+/g,
				" ",
			);
			const key = name.toLowerCase();
			if (seen.has(key))
				throw new InputError(`There’s already a flower called “${name}”.`);
			seen.add(key);
			const renamedFrom = text(raw, "renamedFrom", {
				max: 40,
				required: false,
			});
			if (renamedFrom && renamedFrom !== name)
				renames.push({ from: renamedFrom, to: name });
			const rawKind = asRecord(raw.kind ?? {});
			const hint = text(rawKind, "hint", {
				label: `${name} note`,
				max: 60,
				required: false,
			});
			const kind = {
				counted: bool(rawKind, "counted"),
				colors: bool(rawKind, "colors"),
				...(hint ? { hint } : {}),
			};
			const colors =
				kind.colors && Array.isArray(raw.colors)
					? [
							...new Set(
								raw.colors
									.map((c) => (typeof c === "string" ? c.trim() : ""))
									.filter(Boolean),
							),
						]
					: [];
			if (colors.some((c) => c.length > 30))
				throw new InputError(`Keep ${name} color names short.`);
			const enabled = bool(raw, "enabled");
			if (enabled && kind.colors && colors.length === 0)
				throw new InputError(
					`Add at least one color for ${name}, or switch it off.`,
				);
			// Photos of colors no longer listed are dropped.
			const rawColorImages = asRecord(raw.colorImages ?? {});
			const colorImages: Record<string, string> = {};
			for (const color of colors)
				if (rawColorImages[color])
					colorImages[color] = imageUrl(rawColorImages[color]);
			return {
				name,
				enabled,
				price: price(raw, "price", `${name} price`),
				colors,
				...(raw.image ? { image: imageUrl(raw.image) } : {}),
				...(Object.keys(colorImages).length ? { colorImages } : {}),
				kind,
			};
		});

		const rawWrappers = Array.isArray(source.wrappers) ? source.wrappers : [];
		if (rawWrappers.length > 20) throw new InputError("Too many wrappers.");
		const ids = new Set<string>();
		const wrappers = rawWrappers.map((w, index) => {
			const raw = asRecord(w);
			const label = `Wrapper ${index + 1}`;
			const colorHex = text(raw, "colorHex", {
				label: `${label} color`,
				max: 7,
			});
			if (!/^#[0-9a-fA-F]{6}$/.test(colorHex))
				throw new InputError(`${label} color must look like #c9a77c.`);
			const name = text(raw, "name", { label: `${label} name`, max: 40 });
			let id = text(raw, "id", {
				label: `${label} id`,
				max: 40,
				required: false,
			});
			if (!/^[a-z0-9-]+$/.test(id) || ids.has(id))
				id = `w-${crypto.randomUUID().slice(0, 8)}`;
			ids.add(id);
			// Blank stock means the wrapper isn't counted.
			const stock =
				raw.stock === null || raw.stock === undefined || raw.stock === ""
					? undefined
					: integer(raw, "stock", { label: `${name} stock`, max: 100_000 });
			return {
				id,
				name,
				colorHex,
				price: price(raw, "price", `${name} price`),
				enabled: bool(raw, "enabled"),
				...(stock === undefined ? {} : { stock }),
				...(raw.image ? { image: imageUrl(raw.image) } : {}),
			};
		});

		const enabled = bool(source, "enabled");
		if (enabled && !wrappers.some((w) => w.enabled))
			throw new InputError(
				"Offer at least one wrapper, or switch the builder off.",
			);
		if (enabled && !flowers.some((f) => f.enabled))
			throw new InputError(
				"Offer at least one flower, or switch the builder off.",
			);
		const rawMoney = asRecord(source.money ?? {});
		const denominations = PESO_BILLS.filter(
			(bill) =>
				Array.isArray(rawMoney.denominations) &&
				rawMoney.denominations.includes(bill),
		);
		const money = {
			enabled: bool(rawMoney, "enabled"),
			feePerBill: price(rawMoney, "feePerBill", "Fee per bill"),
			denominations,
			maxBills: integer(rawMoney, "maxBills", {
				label: "Most bills per bouquet",
				min: 1,
				max: 500,
			}),
		};
		if (money.enabled && denominations.length === 0)
			throw new InputError(
				"Pick at least one bill for money bouquets, or switch them off.",
			);
		return {
			settings: {
				enabled,
				baseFee: price(source, "baseFee", "Base fee"),
				flowers,
				wrappers,
				money,
			},
			renames,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		// A renamed flower keeps working in the signature bouquets that use it.
		renameRecipeFlowers(data.renames);
		return saveCustomSettings(data.settings);
	});
