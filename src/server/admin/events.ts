import { createServerFn } from "@tanstack/solid-start";
import { diffSnapshots } from "~/lib/activity-log";
import { isCalendarDate, tidyDates } from "~/lib/delivery-dates";
import {
	EVENT_DELIVERY_DATES_MAX,
	EVENT_STATUSES,
	isEventStatus,
} from "~/lib/events";
import { writeActivity } from "../activity-log-repo";
import { eventSnapshot } from "../activity-snapshots";
import { requireStaff } from "../admin-auth";
import {
	deleteEvent,
	eventNameTaken,
	getEvent,
	listEvents,
	otherEventWithStatus,
	saveEvent,
} from "../events-repo";
import { staffActor } from "../order-actor";
import { asRecord, InputError, text } from "../validate";

const oneSpace = (value: string) => value.replace(/\s+/g, " ");

export const listEventsAdmin = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireStaff();
		return listEvents();
	},
);

export const getEventAdmin = createServerFn({ method: "GET" })
	.validator((id: unknown) => text({ id }, "id", { max: 64 }))
	.handler(async ({ data }) => {
		await requireStaff();
		return getEvent(data);
	});

export const saveEventFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const source = asRecord(input);
		const event = asRecord(source.event);
		const id = text(source, "id", { max: 64, required: false });
		const ordersOpenOn = text(event, "ordersOpenOn", {
			label: "Ordering opens",
			max: 10,
		});
		const ordersCloseOn = text(event, "ordersCloseOn", {
			label: "Ordering closes",
			max: 10,
		});
		if (!isCalendarDate(ordersOpenOn))
			throw new InputError("Ordering opens doesn’t look like a date.");
		if (!isCalendarDate(ordersCloseOn))
			throw new InputError("Ordering closes doesn’t look like a date.");
		if (ordersCloseOn < ordersOpenOn)
			throw new InputError("Ordering can’t close before it opens.");
		const rawDates = Array.isArray(event.deliveryDates)
			? event.deliveryDates
			: [];
		if (!rawDates.every((d) => typeof d === "string" && isCalendarDate(d)))
			throw new InputError("A delivery day doesn’t look like a date.");
		const deliveryDates = tidyDates(rawDates as string[]);
		if (!deliveryDates.length)
			throw new InputError("Add at least one delivery day.");
		if (deliveryDates.length > EVENT_DELIVERY_DATES_MAX)
			throw new InputError(
				`An event can have up to ${EVENT_DELIVERY_DATES_MAX} delivery days.`,
			);
		if (deliveryDates[0] < ordersOpenOn)
			throw new InputError("Delivery days can’t be before ordering opens.");
		if (!isEventStatus(event.status))
			throw new InputError(
				"Pick where the event is: upcoming, current or done.",
			);
		return {
			id: id || null,
			event: {
				name: oneSpace(text(event, "name", { label: "Name", max: 80 })),
				ordersOpenOn,
				ordersCloseOn,
				deliveryDates,
				status: event.status,
				notes: text(event, "notes", {
					label: "Notes",
					max: 1000,
					required: false,
				}),
			},
		};
	})
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const before = data.id ? getEvent(data.id) : null;
		if (data.id && !before) throw new InputError("That event was deleted.");
		if (eventNameTaken(data.event.name, data.id ?? undefined))
			throw new InputError(
				`There’s already an event called “${data.event.name}”.`,
			);
		if (data.event.status === "current") {
			const current = otherEventWithStatus("current", data.id ?? undefined);
			if (current)
				throw new InputError(
					`“${current.name}” is the current event. Mark it ${EVENT_STATUSES.done.label.toLowerCase()} or upcoming first.`,
				);
		}
		const after = getEvent(saveEvent(data.id, data.event));
		const changes = before
			? diffSnapshots(eventSnapshot(before), eventSnapshot(after))
			: [];
		if (after && (!before || changes.length))
			writeActivity(
				"events",
				{ id: after.id, name: after.name },
				staffActor(user),
				before ? "edited" : "added",
				changes,
			);
		return after;
	});

export const deleteEventFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({
		id: text(asRecord(input), "id", { max: 64 }),
	}))
	.handler(async ({ data }) => {
		const user = await requireStaff();
		const event = getEvent(data.id);
		if (!event || !deleteEvent(data.id))
			throw new InputError("That event was already deleted.");
		writeActivity(
			"events",
			{ id: data.id, name: event.name },
			staffActor(user),
			"deleted",
		);
		return { ok: true as const };
	});
