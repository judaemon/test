import { createServerFn } from "@tanstack/solid-start";

import { requireStaff } from "../admin-auth";
import { checkBuilderCanSell, getCustomSettings } from "../custom-repo";
import {
	asRecord,
	bool,
	InputError,
	imageUrl,
	integer,
	price,
	text,
} from "../validate";
import {
	deleteWrapper,
	getWrapper,
	listWrappers,
	saveWrapper,
	setWrapperEnabled,
	type WrapperInput,
} from "../wrappers-repo";

export const listWrappersAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listWrappers();
	},
);

export const getWrapperAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return getWrapper(data);
	});

function parseWrapper(source: Record<string, unknown>): WrapperInput {
	const name = text(source, "name", { label: "Wrapper name", max: 40 });
	const colorHex = text(source, "colorHex", { label: "Color", max: 7 });
	if (!/^#[0-9a-fA-F]{6}$/.test(colorHex))
		throw new InputError("Color must look like #c9a77c.");
	// Blank stock means the wrapper isn't counted.
	const stock =
		source.stock === null || source.stock === undefined || source.stock === ""
			? undefined
			: integer(source, "stock", { label: `${name} stock`, max: 100_000 });
	return {
		name,
		colorHex,
		price: price(source, "price", `${name} price`),
		enabled: bool(source, "enabled"),
		...(stock === undefined ? {} : { stock }),
		image: source.image ? imageUrl(source.image) : "",
	};
}

/** Refuses to leave the builder with no wrappers if `id` goes off (or away). */
function keepAWrapperOffered(id: string) {
	const settings = getCustomSettings();
	checkBuilderCanSell({
		...settings,
		wrappers: settings.wrappers.filter((w) => w.id !== id),
	});
}

export const saveWrapperFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const id = text(source, "id", { max: 64, required: false });
		return { id: id || null, wrapper: parseWrapper(asRecord(source.wrapper)) };
	})
	.handler(async ({ data }) => {
		await requireStaff();
		if (data.id && !getWrapper(data.id))
			throw new InputError("That wrapper was deleted.");
		if (data.id && !data.wrapper.enabled) keepAWrapperOffered(data.id);
		return getWrapper(saveWrapper(data.id, data.wrapper));
	});

export const setWrapperEnabledFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			enabled: bool(source, "enabled"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		if (!data.enabled) keepAWrapperOffered(data.id);
		if (!setWrapperEnabled(data.id, data.enabled))
			throw new InputError("That wrapper was deleted.");
		return { ok: true as const };
	});

export const deleteWrapperFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		keepAWrapperOffered(data.id);
		if (!deleteWrapper(data.id))
			throw new InputError("That wrapper was already deleted.");
		return { ok: true as const };
	});
