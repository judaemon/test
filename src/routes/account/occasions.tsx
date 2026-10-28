import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Index, Show } from "solid-js";

import {
	adminButton,
	adminInput,
	ConfirmButton,
	Field,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { isValidMonthDay, sortByNext } from "~/lib/occasions";
import { formatDate, shopNow } from "~/lib/time";
import { cn } from "~/lib/utils";
import {
	deleteMyOccasion,
	listMyOccasions,
	saveMyOccasion,
} from "~/server/account";
import {
	MAX_OCCASIONS,
	type Occasion,
	type OccasionInput,
} from "~/types/account";

export const Route = createFileRoute("/account/occasions")({
	loader: () => listMyOccasions(),
	head: () => ({ meta: [{ title: "Occasions · ORAIA" }] }),
	component: OccasionsPage,
});

const MONTHS = Array.from({ length: 12 }, (_, i) =>
	new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
		new Date(Date.UTC(2024, i, 1)),
	),
);

function OccasionsPage() {
	const loaded = Route.useLoaderData();
	const [occasions, setOccasions] = createSignal<Occasion[]>(loaded());
	const [editing, setEditing] = createSignal<string | null>(null);
	const today = shopNow().date;
	const upcoming = createMemo(() => sortByNext(occasions(), today));

	const save = async (id: string | null, input: OccasionInput) => {
		try {
			setOccasions(await saveMyOccasion({ data: { id, ...input } }));
			toastSuccess(id ? "Occasion updated." : "Occasion saved.");
			setEditing(null);
			return true;
		} catch (error) {
			toastError(error);
			return false;
		}
	};

	const remove = async (id: string) => {
		try {
			setOccasions(await deleteMyOccasion({ data: { id } }));
			toastSuccess("Occasion removed.");
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
			<section aria-labelledby="occasions-heading">
				<h2 id="occasions-heading" class="text-lg font-semibold">
					Your occasions
				</h2>
				<p class="mt-1 text-sm text-petal-900/65">
					Birthdays, anniversaries, little celebrations — soonest first.
				</p>
				<Show
					when={upcoming().length > 0}
					fallback={
						<p class="mt-5 rounded-3xl border border-dashed border-petal-200 px-5 py-8 text-center text-sm text-petal-900/60">
							No occasions yet. Add one and we’ll keep it here for you.
						</p>
					}
				>
					<ul class="mt-5 flex flex-col gap-3">
						<For each={upcoming()}>
							{(occasion) => (
								<li class="rounded-3xl border border-petal-100 bg-white p-4">
									<Show
										when={editing() !== occasion.id}
										fallback={
											<OccasionForm
												initial={occasion}
												submitLabel="Save changes"
												onSubmit={(input) => save(occasion.id, input)}
												onCancel={() => setEditing(null)}
											/>
										}
									>
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="flex items-start gap-3">
												<span class="flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-petal-50 leading-none">
													<span class="text-[10px] font-semibold uppercase text-petal-700">
														{MONTHS[occasion.month - 1]?.slice(0, 3)}
													</span>
													<span class="font-display type-soft text-lg font-semibold">
														{occasion.day}
													</span>
												</span>
												<div>
													<p class="font-medium">{occasion.title}</p>
													<p class="text-sm text-petal-900/60">
														{occasion.daysAway === 0
															? "Today!"
															: occasion.daysAway === 1
																? "Tomorrow"
																: `In ${occasion.daysAway} days`}{" "}
														· {formatDate(occasion.date, { weekday: "long" })}
													</p>
													<Show when={occasion.note}>
														<p class="mt-1 text-sm text-petal-900/70">
															{occasion.note}
														</p>
													</Show>
												</div>
											</div>
											<div class="flex items-center gap-1">
												<Show when={occasion.daysAway <= 14}>
													<Link
														to="/shop"
														class={cn(
															adminButton.ghost,
															"font-medium text-petal-700",
														)}
													>
														Order flowers
													</Link>
												</Show>
												<button
													type="button"
													class={adminButton.ghost}
													onClick={() => setEditing(occasion.id)}
													aria-label={`Edit ${occasion.title}`}
												>
													Edit
												</button>
												<ConfirmButton
													class={cn(adminButton.ghost, "text-error-foreground")}
													aria-label={`Delete ${occasion.title}`}
													title={`Delete “${occasion.title}”?`}
													description="It’ll be removed from your account."
													confirmLabel="Delete"
													onConfirm={() => remove(occasion.id)}
												>
													Delete
												</ConfirmButton>
											</div>
										</div>
									</Show>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>

			<aside class="h-fit rounded-3xl border border-petal-100 bg-white p-5">
				<h2 class="font-semibold">Add an occasion</h2>
				<Show
					when={occasions().length < MAX_OCCASIONS}
					fallback={
						<p class="mt-2 text-sm text-petal-900/65">
							You’ve saved the maximum of {MAX_OCCASIONS} occasions.
						</p>
					}
				>
					<OccasionForm
						submitLabel="Save occasion"
						resetOnSave
						onSubmit={(input) => save(null, input)}
					/>
				</Show>
			</aside>
		</div>
	);
}

function OccasionForm(props: {
	initial?: OccasionInput;
	submitLabel: string;
	resetOnSave?: boolean;
	onSubmit: (input: OccasionInput) => Promise<boolean>;
	onCancel?: () => void;
}) {
	const [month, setMonth] = createSignal(props.initial?.month ?? 1);
	const [busy, setBusy] = createSignal(false);
	const daysInMonth = () =>
		Array.from({ length: 31 }, (_, i) => i + 1).filter((day) =>
			isValidMonthDay(month(), day),
		);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		const formElement = event.currentTarget as HTMLFormElement;
		const form = new FormData(formElement);
		setBusy(true);
		const ok = await props.onSubmit({
			title: String(form.get("title") ?? ""),
			month: Number(form.get("month")),
			day: Number(form.get("day")),
			note: String(form.get("note") ?? ""),
		});
		setBusy(false);
		if (ok && props.resetOnSave) {
			formElement.reset();
			setMonth(1);
		}
	};

	return (
		<form method="post" onSubmit={submit} class="mt-3 grid gap-3">
			<Field label="What’s the occasion?">
				<input
					name="title"
					required
					maxLength={60}
					value={props.initial?.title ?? ""}
					placeholder="e.g. Mom’s birthday"
					class={adminInput}
				/>
			</Field>
			<div class="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
				<Field label="Month">
					{/* `selected` on the option (not `value` on the select) also works in SSR. */}
					<select
						name="month"
						onChange={(e) => setMonth(Number(e.currentTarget.value))}
						class={adminInput}
					>
						<Index each={MONTHS}>
							{(name, index) => (
								<option
									value={String(index + 1)}
									selected={month() === index + 1}
								>
									{name()}
								</option>
							)}
						</Index>
					</select>
				</Field>
				<Field label="Day">
					<select name="day" class={adminInput}>
						<For each={daysInMonth()}>
							{(day) => (
								<option
									value={String(day)}
									selected={day === (props.initial?.day ?? 1)}
								>
									{day}
								</option>
							)}
						</For>
					</select>
				</Field>
			</div>
			<Field label="Note (optional)">
				<input
					name="note"
					maxLength={200}
					value={props.initial?.note ?? ""}
					placeholder="Loves sunflowers"
					class={adminInput}
				/>
			</Field>
			<div class="flex justify-end gap-2">
				<Show when={props.onCancel}>
					<button
						type="button"
						class={adminButton.secondary}
						onClick={() => props.onCancel?.()}
					>
						Cancel
					</button>
				</Show>
				<button type="submit" class={adminButton.primary} disabled={busy()}>
					{busy() ? "Saving…" : props.submitLabel}
				</button>
			</div>
		</form>
	);
}
