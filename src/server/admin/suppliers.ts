import { createServerFn } from "@tanstack/solid-start";
import { diffSnapshots } from "~/lib/activity-log";
import { writeActivity } from "../activity-log-repo";
import {
	supplierNames,
	supplierSnapshot,
	wrapperChanges,
} from "../activity-snapshots";
import { requireStaff } from "../admin-auth";
import { staffActor } from "../order-actor";
import {
	deleteSupplier,
	getSupplier,
	listSuppliers,
	saveSupplier,
	supplierNameTaken,
} from "../suppliers-repo";
import { asRecord, InputError, text } from "../validate";
import { listWrappers } from "../wrappers-repo";

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
		const user = await requireStaff();
		const before = data.id ? getSupplier(data.id) : null;
		if (data.id && !before) throw new InputError("That supplier was deleted.");
		if (supplierNameTaken(data.supplier.name, data.id ?? undefined))
			throw new InputError(
				`There’s already a supplier called “${data.supplier.name}”.`,
			);
		const after = getSupplier(saveSupplier(data.id, data.supplier));
		const changes = before
			? diffSnapshots(supplierSnapshot(before), supplierSnapshot(after))
			: [];
		// Saved with nothing changed: nothing to log.
		if (after && (!before || changes.length))
			writeActivity(
				"suppliers",
				{ id: after.id, name: after.name },
				staffActor(user),
				before ? "edited" : "added",
				changes,
			);
		return after;
	});

export const deleteSupplierFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const supplier = getSupplier(data.id);
		if (!supplier) throw new InputError("That supplier was already deleted.");
		// Its wrappers lose it too; each one's log says so.
		const names = supplierNames();
		const affected = listWrappers().filter((w) =>
			w.supplierIds?.includes(data.id),
		);
		if (!deleteSupplier(data.id))
			throw new InputError("That supplier was already deleted.");
		const actor = staffActor(user);
		writeActivity(
			"suppliers",
			{ id: data.id, name: supplier.name },
			actor,
			"deleted",
		);
		for (const before of affected) {
			const after = {
				...before,
				supplierIds: before.supplierIds?.filter((id) => id !== data.id),
			};
			writeActivity(
				"wrappers",
				{ id: before.id, name: before.name },
				actor,
				"supplier_deleted",
				wrapperChanges(before, after, names),
			);
		}
		return { ok: true as const };
	});
