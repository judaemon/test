import { createServerFn } from "@tanstack/solid-start";
import { diffSnapshots } from "~/lib/activity-log";
import { floristOf } from "~/lib/florists";
import { writeActivity } from "../activity-log-repo";
import { floristSnapshot } from "../activity-snapshots";
import { requireStaff } from "../admin-auth";
import { floristWork } from "../florist-work";
import {
	deleteFlorist,
	type Florist,
	floristNameTaken,
	getFlorist,
	listFloristOptions,
	listFlorists,
	saveFlorist,
	setFloristLink,
} from "../florists-repo";
import { staffActor } from "../order-actor";
import { listOrders } from "../orders-repo";
import { asRecord, InputError, text } from "../validate";

const oneSpace = (value: string) => value.replace(/\s+/g, " ");

/** A florist with how many of their bouquets are still to make, and made. */
export interface FloristRecord extends Florist {
	toMake: number;
	done: number;
}

/** Bouquets given to each florist on orders that aren't cancelled. */
function bouquetCounts() {
	const counts = new Map<string, { toMake: number; done: number }>();
	for (const order of listOrders({ limit: 1_000_000 })) {
		if (order.stage === "cancelled") continue;
		for (const line of order.lines)
			for (let unit = 0; unit < line.quantity; unit++) {
				const id = floristOf(line, unit);
				if (!id) continue;
				const entry = counts.get(id) ?? { toMake: 0, done: 0 };
				if (order.stage === "done") entry.done += 1;
				else entry.toMake += 1;
				counts.set(id, entry);
			}
	}
	return counts;
}

const withCounts = (
	florist: Florist,
	counts: ReturnType<typeof bouquetCounts>,
): FloristRecord => ({
	...florist,
	...(counts.get(florist.id) ?? { toMake: 0, done: 0 }),
});

export const listFloristsAdmin = createServerFn({ method: "GET" }).handler(
	async (): Promise<FloristRecord[]> => {
		await requireStaff();
		const counts = bouquetCounts();
		return listFlorists().map((florist) => withCounts(florist, counts));
	},
);

/** Names only, for the pickers on the orders pages. */
export const listFloristOptionsFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listFloristOptions();
	},
);

export const getFloristAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }): Promise<FloristRecord | null> => {
		await requireStaff();
		const florist = getFlorist(data);
		return florist ? withCounts(florist, bouquetCounts()) : null;
	});

export const saveFloristFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const florist = asRecord(source.florist);
		const id = text(source, "id", { max: 64, required: false });
		const email = text(florist, "email", {
			label: "Email",
			max: 120,
			required: false,
		});
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
			throw new InputError("Email doesn’t look right.");
		return {
			id: id || null,
			florist: {
				name: oneSpace(text(florist, "name", { label: "Name", max: 60 })),
				phone: text(florist, "phone", {
					label: "Phone",
					max: 40,
					required: false,
				}),
				email,
				notes: text(florist, "notes", {
					label: "Notes",
					max: 500,
					required: false,
				}),
				active: florist.active !== false,
			},
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const before = data.id ? getFlorist(data.id) : null;
		if (data.id && !before) throw new InputError("That florist was deleted.");
		if (floristNameTaken(data.florist.name, data.id ?? undefined))
			throw new InputError(
				`There’s already a florist called “${data.florist.name}”.`,
			);
		const after = getFlorist(saveFlorist(data.id, data.florist));
		const changes = before
			? diffSnapshots(floristSnapshot(before), floristSnapshot(after))
			: [];
		if (after && (!before || changes.length))
			writeActivity(
				"florists",
				{ id: after.id, name: after.name },
				staffActor(user),
				before ? "edited" : "added",
				changes,
			);
		return after;
	});

/** Turns a florist's private link on (a new one each time) or off. */
export const setFloristLinkFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return { id: text(source, "id", { max: 64 }), on: source.on === true };
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const florist = getFlorist(data.id);
		if (!florist) throw new InputError("That florist was deleted.");
		const token = setFloristLink(data.id, data.on);
		writeActivity(
			"florists",
			{ id: florist.id, name: florist.name },
			staffActor(user),
			!data.on ? "link_off" : florist.shareToken ? "link_new" : "link_on",
		);
		return { token };
	});

export const deleteFloristFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const florist = getFlorist(data.id);
		if (!florist) throw new InputError("That florist was already deleted.");
		const counts = bouquetCounts().get(data.id);
		if (counts && counts.toMake + counts.done > 0)
			throw new InputError(
				`${florist.name} still has ${counts.toMake + counts.done} bouquets on orders. Give them to someone else first, or switch off “Can be given bouquets” instead.`,
			);
		if (!deleteFlorist(data.id))
			throw new InputError("That florist was already deleted.");
		writeActivity(
			"florists",
			{ id: data.id, name: florist.name },
			staffActor(user),
			"deleted",
		);
		return { ok: true as const };
	});

/** A florist's bouquets and what's in them, for their work sheet. */
export const getFloristWorkAdmin = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		return {
			id: text(source, "id", { max: 64 }),
			includeDone: source.includeDone === true,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		const florist = getFlorist(data.id);
		if (!florist) return null;
		return floristWork(florist, {
			includeDone: data.includeDone,
			forStaff: true,
		});
	});
