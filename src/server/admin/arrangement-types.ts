import { createServerFn } from "@tanstack/solid-start";

import { requireStaff } from "../admin-auth";
import {
	arrangementTypeNameTaken,
	deleteArrangementType,
	getArrangementType,
	listArrangementTypes,
	moveArrangementType,
	saveArrangementType,
} from "../arrangement-types-repo";
import { asRecord, InputError, oneOf, text } from "../validate";

const oneSpace = (value: string) => value.replace(/\s+/g, " ");

export const listArrangementTypesAdmin = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireStaff();
	return listArrangementTypes();
});

export const getArrangementTypeAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return getArrangementType(data);
	});

export const saveArrangementTypeFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const type = asRecord(source.type);
		const id = text(source, "id", { max: 64, required: false });
		return {
			id: id || null,
			type: {
				name: oneSpace(text(type, "name", { label: "Name", max: 30 })),
				pluralName: oneSpace(
					text(type, "pluralName", { label: "Plural name", max: 40 }),
				),
				description: text(type, "description", {
					label: "Description",
					max: 120,
					required: false,
				}),
			},
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		if (data.id && !getArrangementType(data.id))
			throw new InputError("That type was deleted.");
		if (arrangementTypeNameTaken(data.type.name, data.id ?? undefined))
			throw new InputError(
				`There’s already a type called “${data.type.name}”.`,
			);
		return getArrangementType(saveArrangementType(data.id, data.type));
	});

export const moveArrangementTypeFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			direction: oneOf(String(source.direction), ["-1", "1"], "Direction"),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		moveArrangementType(data.id, data.direction === "1" ? 1 : -1);
		return listArrangementTypes();
	});

export const deleteArrangementTypeFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		if (!deleteArrangementType(data.id))
			throw new InputError("That type was already deleted.");
		return { ok: true as const };
	});
