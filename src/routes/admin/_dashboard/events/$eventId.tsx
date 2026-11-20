import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { useLeaveForm } from "~/components/admin/leave-form";
import {
	adminButton,
	adminInput,
	ConfirmButton,
	PageHeader,
	SettingsRow,
	SettingsSection,
	TextArea,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { formatDeliveryDate } from "~/lib/checkout";
import { editorCrumbs, field } from "~/lib/crumbs";
import { isCalendarDate, tidyDates } from "~/lib/delivery-dates";
import {
	EVENT_DELIVERY_DATES_MAX,
	EVENT_MAX_ORDERS_LIMIT,
	EVENT_STATUS_KEYS,
	EVENT_STATUSES,
	type EventStatus,
} from "~/lib/events";
import { cn } from "~/lib/utils";
import {
	deleteEventFn,
	getEventAdmin,
	saveEventFn,
} from "~/server/admin/events";

export const Route = createFileRoute("/admin/_dashboard/events/$eventId")({
	staticData: {
		crumbs: editorCrumbs("New event", "Untitled event", field("name")),
	},
	loader: async ({ params }) => {
		if (params.eventId === "new") return null;
		const event = await getEventAdmin({ data: params.eventId });
		if (!event) throw notFound();
		return event;
	},
	// The form copies what's loaded once, so it must never open on a kept
	// copy that's refreshed behind it: drop it on leaving, load anew each time.
	gcTime: 0,
	component: EventEditor,
});

/**
 * One event: its name, when online ordering opens and closes, the days
 * bouquets are delivered, and where it is (upcoming, current or done).
 */
function EventEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/events" },
	});
	const isNew = () => params().eventId === "new";
	const [draft, setDraft] = createStore({
		savedName: loaded()?.name ?? "",
		name: loaded()?.name ?? "",
		ordersOpenOn: loaded()?.ordersOpenOn ?? "",
		ordersCloseOn: loaded()?.ordersCloseOn ?? "",
		deliveryDates: loaded()?.deliveryDates ?? ([] as string[]),
		status: (loaded()?.status ?? "upcoming") as EventStatus,
		notes: loaded()?.notes ?? "",
		maxOrders:
			loaded()?.maxOrders === null || loaded()?.maxOrders === undefined
				? ""
				: String(loaded()?.maxOrders),
	});
	const orders = () => loaded()?.orders ?? 0;
	const [adding, setAdding] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	const addDay = () => {
		const date = adding();
		if (!isCalendarDate(date)) return toastError("Pick a day first.");
		if (draft.deliveryDates.includes(date))
			return toastError(`${formatDeliveryDate(date)} is already on the list.`);
		if (draft.deliveryDates.length >= EVENT_DELIVERY_DATES_MAX)
			return toastError(
				`An event can have up to ${EVENT_DELIVERY_DATES_MAX} delivery days.`,
			);
		setDraft("deliveryDates", tidyDates([...draft.deliveryDates, date]));
		setAdding("");
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveEventFn({
				data: {
					id: isNew() ? "" : params().eventId,
					event: {
						name: draft.name,
						ordersOpenOn: draft.ordersOpenOn,
						ordersCloseOn: draft.ordersCloseOn,
						deliveryDates: draft.deliveryDates,
						status: draft.status,
						notes: draft.notes,
						maxOrders: draft.maxOrders.trim() || null,
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the event.");
			toastSuccess(isNew() ? "Event added." : "Changes saved.");
			await refresh();
			await leave();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-3xl pb-28">
			<PageHeader
				title={isNew() ? "New event" : draft.savedName || "Untitled event"}
				description={
					isNew()
						? "Name the event, then set when ordering runs and the days bouquets go out."
						: undefined
				}
				actions={
					<Show when={!isNew()}>
						<Link
							to="/admin/logs"
							search={{ area: "events", item: params().eventId }}
							class={adminButton.secondary}
						>
							Change history
						</Link>
					</Show>
				}
			/>

			<div class="grid gap-10">
				<SettingsSection title="Event">
					<SettingsRow
						label="Name"
						for="event-name"
						description="As the shop calls it, with the year."
					>
						<input
							id="event-name"
							aria-describedby="event-name-hint"
							value={draft.name}
							onInput={(e) => setDraft("name", e.currentTarget.value)}
							required
							maxLength={80}
							placeholder="e.g. Battalion Hop 2026"
							class={adminInput}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Ordering"
					description="The days online ordering runs for this event."
				>
					<SettingsRow label="Opens" for="event-open">
						<input
							id="event-open"
							type="date"
							value={draft.ordersOpenOn}
							onInput={(e) => setDraft("ordersOpenOn", e.currentTarget.value)}
							required
							class={adminInput}
						/>
					</SettingsRow>
					<SettingsRow
						label="Closes"
						for="event-close"
						description="The last day people can order."
					>
						<input
							id="event-close"
							type="date"
							aria-describedby="event-close-hint"
							value={draft.ordersCloseOn}
							min={draft.ordersOpenOn || undefined}
							onInput={(e) => setDraft("ordersCloseOn", e.currentTarget.value)}
							required
							class={adminInput}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Most orders"
					description="While this event is current, the shop takes orders until it has this many, then shows it’s fully booked. Cancelled orders don’t count."
				>
					<SettingsRow
						label="Most orders"
						for="event-max-orders"
						description={
							isNew()
								? "Leave empty for no limit."
								: `${orders()} ${orders() === 1 ? "order" : "orders"} so far. Leave empty for no limit.`
						}
					>
						<input
							id="event-max-orders"
							type="number"
							inputMode="numeric"
							min={1}
							max={EVENT_MAX_ORDERS_LIMIT}
							step={1}
							aria-describedby="event-max-orders-hint"
							value={draft.maxOrders}
							onInput={(e) => setDraft("maxOrders", e.currentTarget.value)}
							placeholder="No limit"
							class={adminInput}
						/>
						<Show
							when={
								!isNew() &&
								draft.maxOrders.trim() &&
								Number(draft.maxOrders) <= orders()
							}
						>
							<p class="mt-1.5 text-sm text-warning-foreground">
								That’s no more than the orders it has, so it would be fully
								booked while current.
							</p>
						</Show>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Delivery days"
					description="The days bouquets are delivered to cadets. While this is the current event, checkout offers these days, and Delivery dates edits them."
				>
					<Show
						when={draft.deliveryDates.length}
						fallback={
							<p class="px-5 py-4 text-sm text-petal-900/60">
								No delivery days yet. Add at least one below.
							</p>
						}
					>
						<ul class="divide-y divide-petal-100">
							<For each={draft.deliveryDates}>
								{(date) => (
									<li class="flex items-center justify-between gap-3 px-5 py-3">
										<span class="text-sm font-medium">
											{formatDeliveryDate(date)}
										</span>
										<button
											type="button"
											class={adminButton.ghost}
											onClick={() =>
												setDraft(
													"deliveryDates",
													draft.deliveryDates.filter((d) => d !== date),
												)
											}
											aria-label={`Remove ${formatDeliveryDate(date)}`}
										>
											Remove
										</button>
									</li>
								)}
							</For>
						</ul>
					</Show>
					<div class="flex flex-wrap items-end gap-2 bg-petal-50/60 px-5 py-4">
						<label class="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
							Add a day
							<input
								type="date"
								class={adminInput}
								value={adding()}
								min={draft.ordersOpenOn || undefined}
								onInput={(e) => setAdding(e.currentTarget.value)}
								// Enter adds the day rather than saving the whole form.
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										addDay();
									}
								}}
							/>
						</label>
						<button
							type="button"
							class={adminButton.secondary}
							disabled={!adding()}
							onClick={addDay}
						>
							Add
						</button>
					</div>
				</SettingsSection>

				<SettingsSection
					title="Status"
					description="Where the event is. Only one event can be current, and it runs the shop: with none current, the shop is view only."
				>
					<fieldset>
						<legend class="sr-only">Status</legend>
						<For each={EVENT_STATUS_KEYS}>
							{(status) => (
								<label
									class={cn(
										"flex cursor-pointer items-start gap-3 border-t border-petal-100 px-5 py-4 first-of-type:border-t-0 transition-colors hover:bg-petal-50/60",
										draft.status === status && "bg-petal-50/70",
									)}
								>
									<input
										type="radio"
										name="status"
										value={status}
										checked={draft.status === status}
										onChange={() => setDraft("status", status)}
										class="mt-0.5 size-4 shrink-0 accent-petal-700"
									/>
									<span class="min-w-0">
										<span class="block text-sm font-medium">
											{EVENT_STATUSES[status].label}
										</span>
										<span class="block text-sm text-petal-900/60">
											{EVENT_STATUSES[status].text}
										</span>
									</span>
								</label>
							)}
						</For>
					</fieldset>
				</SettingsSection>

				<SettingsSection title="Notes">
					<div class="p-5">
						<label for="event-notes" class="sr-only">
							Notes
						</label>
						<TextArea
							id="event-notes"
							value={draft.notes}
							onInput={(e) => setDraft("notes", e.currentTarget.value)}
							maxLength={1000}
							rows={4}
							placeholder="Optional. Venue, who to coordinate with, anything to remember for next year."
							class={cn(adminInput, "h-auto py-2.5 leading-relaxed")}
						/>
					</div>
				</SettingsSection>
			</div>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[var(--admin-sidebar,240px)]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description="It goes for good. Its change history stays on Logs."
							confirmLabel="Delete event"
							onConfirm={async () => {
								try {
									await deleteEventFn({ data: { id: params().eventId } });
									toastSuccess("Event deleted.");
									await refresh();
									await leave();
								} catch (error) {
									toastError(error);
								}
							}}
						>
							Delete
						</ConfirmButton>
					</Show>
					<Link
						to="/admin/events"
						onClick={stepBack}
						class={adminButton.secondary}
					>
						Cancel
					</Link>
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : isNew() ? "Add event" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
