import { createServerFn } from "@tanstack/solid-start";

import { requireStaff } from "../admin-auth";
import {
	deleteSize,
	getSize,
	listSizes,
	moveSize,
	saveSize,
	sizeNameTaken,
} from "../sizes-repo";
import { asRecord, InputError, imageUrl, oneOf, text } from "../validate";

export const listSizesAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listSizes();
	},
);

export const getSizeAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return getSize(data);
	});

export const saveSizeFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const size = asRecord(source.size);
		const id = text(source, "id", { max: 64, required: false });
		return {
			id: id || null,
			size: {
				name: text(size, "name", { label: "Name", max: 30 }).replace(
					/\s+/g,
					" ",
				),
				description: text(size, "description", {
					label: "Description",
					max: 80,
					required: false,
				}),
				image: size.image ? imageUrl(size.image) : "",
			},
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		if (data.id && !getSize(data.id))
			throw new InputError("That size was deleted.");
		if (sizeNameTaken(data.size.name, data.id ?? undefined))
			throw new InputError(
				`There’s already a size called “${data.size.name}”.`,
			);
		return getSize(saveSize(data.id, data.size));
	});

export const moveSizeFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			direction: oneOf(String(source.direction), ["-1", "1"], "Direction"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		moveSize(data.id, data.direction === "1" ? 1 : -1);
		return listSizes();
	});

export const deleteSizeFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		if (!deleteSize(data.id))
			throw new InputError("That size was already deleted.");
		return { ok: true as const };
	});
