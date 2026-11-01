import { createServerFn } from "@tanstack/solid-start";

import { requireStaff } from "../admin-auth";
import { checkBuilderCanSell, getCustomSettings } from "../custom-repo";
import {
	deleteFlower,
	type FlowerInput,
	flowerNameTaken,
	getFlower,
	listFlowers,
	saveFlower,
	setFlowerEnabled,
} from "../flowers-repo";
import {
	asRecord,
	bool,
	InputError,
	imageUrl,
	integer,
	price,
	text,
} from "../validate";

export const listFlowersAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listFlowers();
	},
);

export const getFlowerAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return getFlower(data);
	});

function parseFlower(source: Record<string, unknown>): FlowerInput {
	const name = text(source, "name", { label: "Flower name", max: 40 }).replace(
		/\s+/g,
		" ",
	);
	const rawColors = Array.isArray(source.colors) ? source.colors : [];
	if (rawColors.length === 0)
		throw new InputError(`Add at least one color for ${name}.`);
	if (rawColors.length > 30)
		throw new InputError(`That’s a lot of colors for ${name}.`);
	const seen = new Set<string>();
	const colors = rawColors.map((c, index) => {
		const raw = asRecord(c);
		const colorName = text(raw, "name", {
			label: `${name} color ${index + 1} name`,
			max: 30,
		});
		const key = colorName.toLowerCase();
		if (seen.has(key))
			throw new InputError(`${name} has “${colorName}” twice.`);
		seen.add(key);
		const label = `${colorName} ${name}`;
		// Blank stock means it isn't counted.
		const stock =
			raw.stock === null || raw.stock === undefined || raw.stock === ""
				? undefined
				: integer(raw, "stock", { label: `${label} stock`, max: 100_000 });
		const id = text(raw, "id", { max: 64, required: false });
		return {
			...(id ? { id } : {}),
			name: colorName,
			price: price(raw, "price", `${label} price`),
			...(stock === undefined ? {} : { stock }),
			enabled: bool(raw, "enabled"),
			image: raw.image ? imageUrl(raw.image) : "",
		};
	});
	const enabled = bool(source, "enabled");
	if (enabled && !colors.some((c) => c.enabled))
		throw new InputError(
			`Mark at least one color of ${name} for custom bouquets, or stop using the flower in custom bouquets.`,
		);
	return {
		name,
		hint: text(source, "hint", { label: "Note", max: 60, required: false }),
		enabled,
		image: source.image ? imageUrl(source.image) : "",
		colors,
	};
}

/** Refuses to leave the builder with no flowers if `name` goes off (or away). */
function keepAFlowerOffered(name: string) {
	const settings = getCustomSettings();
	checkBuilderCanSell({
		...settings,
		flowers: settings.flowers.filter((f) => f.name !== name),
	});
}

export const saveFlowerFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const id = text(source, "id", { max: 64, required: false });
		return { id: id || null, flower: parseFlower(asRecord(source.flower)) };
	})
	.handler(async ({ data }) => {
		await requireStaff();
		const before = data.id ? getFlower(data.id) : null;
		if (data.id && !before) throw new InputError("That flower was deleted.");
		if (flowerNameTaken(data.flower.name, data.id ?? undefined))
			throw new InputError(
				`There’s already a flower called “${data.flower.name}”.`,
			);
		if (before && !data.flower.enabled) keepAFlowerOffered(before.name);
		return getFlower(saveFlower(data.id, data.flower));
	});

export const setFlowerEnabledFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			enabled: bool(source, "enabled"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		const flower = getFlower(data.id);
		if (!flower) throw new InputError("That flower was deleted.");
		if (data.enabled && !flower.colors.some((c) => c.enabled))
			throw new InputError(
				`Mark at least one color of ${flower.name} for custom bouquets first.`,
			);
		if (!data.enabled) keepAFlowerOffered(flower.name);
		setFlowerEnabled(data.id, data.enabled);
		return { ok: true as const };
	});

export const deleteFlowerFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		const flower = getFlower(data.id);
		if (!flower) throw new InputError("That flower was already deleted.");
		keepAFlowerOffered(flower.name);
		deleteFlower(data.id);
		return { ok: true as const };
	});
