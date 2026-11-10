import { createServerFn } from "@tanstack/solid-start";

import { requireStaff } from "../admin-auth";
import {
	deleteSupplier,
	getSupplier,
	listSuppliers,
	saveSupplier,
	supplierNameTaken,
} from "../suppliers-repo";
import { asRecord, InputError, text } from "../validate";

const oneSpace = (value: string) => value.replace(/\s+/g, " ");

export const listSuppliersAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listSuppliers();
	},
);

export const getSupplierAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return getSupplier(data);
	});

export const saveSupplierFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const supplier = asRecord(source.supplier);
		const id = text(source, "id", { max: 64, required: false });
		const email = text(supplier, "email", {
			label: "Email",
			max: 120,
			required: false,
		});
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
			throw new InputError("Email doesn’t look right.");
		return {
			id: id || null,
			supplier: {
				name: oneSpace(text(supplier, "name", { label: "Name", max: 60 })),
				contactName: oneSpace(
					text(supplier, "contactName", {
						label: "Contact person",
						max: 60,
						required: false,
					}),
				),
				phone: text(supplier, "phone", {
					label: "Phone",
					max: 40,
					required: false,
				}),
				email,
				notes: text(supplier, "notes", {
					label: "Notes",
					max: 500,
					required: false,
				}),
			},
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		if (data.id && !getSupplier(data.id))
			throw new InputError("That supplier was deleted.");
		if (supplierNameTaken(data.supplier.name, data.id ?? undefined))
			throw new InputError(
				`There’s already a supplier called “${data.supplier.name}”.`,
			);
		return getSupplier(saveSupplier(data.id, data.supplier));
	});

export const deleteSupplierFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		await requireStaff();
		if (!deleteSupplier(data.id))
			throw new InputError("That supplier was already deleted.");
		return { ok: true as const };
	});
