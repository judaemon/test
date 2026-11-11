import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import {
	adminButton,
	adminCard,
	adminInput,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { formatDeliveryDate } from "~/lib/checkout";
import {
	DELIVERY_DATES_MAX,
	isCalendarDate,
	tidyDates,
	upcomingDeliveryDates,
} from "~/lib/delivery-dates";
import { cn } from "~/lib/utils";
import {
	getDeliveryDatesAdmin,
	saveDeliveryDatesFn,
} from "~/server/admin/delivery-dates";

export const Route = createFileRoute("/admin/_dashboard/delivery-dates")({
	loader: () => getDeliveryDatesAdmin(),
	component: DeliveryDatesPage,
});

function DeliveryDatesPage() {
	const loaded = Route.useLoaderData();
	const router = useRouter();
	const [dates, setDates] = createSignal<string[]>(loaded());
	const [adding, setAdding] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	const upcoming = () => new Set(upcomingDeliveryDates(dates()));
	const changed = () => dates().join() !== loaded().join();

	const add = (event: SubmitEvent) => {
		event.preventDefault();
		const date = adding();
		if (!isCalendarDate(date)) return toastError("Pick a day first.");
		if (dates().includes(date))
			return toastError(`${formatDeliveryDate(date)} is already on the list.`);
		if (dates().length >= DELIVERY_DATES_MAX)
			return toastError(`Offer up to ${DELIVERY_DATES_MAX} dates at a time.`);
		setDates(tidyDates([...dates(), date]));
		setAdding("");
	};

	const save = async () => {
		setSaving(true);
		try {
			const saved = await saveDeliveryDatesFn({ data: { dates: dates() } });
			setDates(saved);
			toastSuccess(
				saved.length
					? "Delivery dates saved. Checkout offers them now."
					: "Delivery dates cleared. Checkout’s date is optional again.",
			);
			await router.invalidate();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div class="mx-auto max-w-2xl pb-24">
			<PageHeader
				title="Delivery dates"
				description="The days shoppers can choose at checkout. They must pick one of these. Change them for each event; past days drop off checkout on their own."
			/>

			<section class={cn(adminCard, "mb-4 p-5")}>
				<h2 class="mb-3 font-semibold">Offered at checkout</h2>
				<Show
					when={dates().length}
					fallback={
						<p class="rounded-xl bg-petal-50 px-4 py-3 text-sm text-petal-900/70">
							No dates. Checkout asks for a delivery date, but it’s optional and
							any day can be picked.
						</p>
					}
				>
					<ul class="divide-y divide-petal-50 rounded-xl border border-petal-100">
						<For each={dates()}>
							{(date) => (
								<li class="flex items-center justify-between gap-3 px-4 py-2.5">
									<span>
										<span class="font-medium">{formatDeliveryDate(date)}</span>
										<Show when={!upcoming().has(date)}>
											<span class="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs text-petal-900/70">
												Past: not offered
											</span>
										</Show>
									</span>
									<button
										type="button"
										class={adminButton.ghost}
										onClick={() => setDates(dates().filter((d) => d !== date))}
										aria-label={`Remove ${formatDeliveryDate(date)}`}
									>
										Remove
									</button>
								</li>
							)}
						</For>
					</ul>
				</Show>

				<form onSubmit={add} class="mt-4 flex flex-wrap items-end gap-2">
					<label class="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
						Add a date
						<input
							type="date"
							class={adminInput}
							value={adding()}
							onInput={(e) => setAdding(e.currentTarget.value)}
						/>
					</label>
					<button type="submit" class={adminButton.secondary}>
						Add
					</button>
				</form>
			</section>

			<div class="flex flex-wrap items-center gap-3">
				<button
					type="button"
					class={adminButton.primary}
					disabled={saving() || !changed()}
					onClick={() => void save()}
				>
					{saving() ? "Saving…" : "Save dates"}
				</button>
				<Show when={changed()}>
					<span class="text-sm text-petal-900/60">Not saved yet</span>
				</Show>
			</div>
		</div>
	);
}
