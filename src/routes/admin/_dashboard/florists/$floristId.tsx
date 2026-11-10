import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useLeaveForm } from "~/components/admin/leave-form";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	TextArea,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import {
	deleteFloristFn,
	getFloristAdmin,
	saveFloristFn,
	setFloristLinkFn,
} from "~/server/admin/florists";

export const Route = createFileRoute("/admin/_dashboard/florists/$floristId")({
	loader: async ({ params }) => {
		if (params.floristId === "new") return null;
		const florist = await getFloristAdmin({ data: params.floristId });
		if (!florist) throw notFound();
		return florist;
	},
	gcTime: 0,
	component: FloristEditor,
});

function FloristEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/florists" },
	});
	const navigate = useNavigate();
	const isNew = () => params().floristId === "new";
	const [draft, setDraft] = createStore({
		savedName: loaded()?.name ?? "",
		name: loaded()?.name ?? "",
		phone: loaded()?.phone ?? "",
		email: loaded()?.email ?? "",
		notes: loaded()?.notes ?? "",
		active: loaded()?.active ?? true,
	});
	const [saving, setSaving] = createSignal(false);
	const toMake = () => loaded()?.toMake ?? 0;
	const assigned = () => toMake() + (loaded()?.done ?? 0);

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveFloristFn({
				data: {
					id: isNew() ? "" : params().floristId,
					florist: {
						name: draft.name,
						phone: draft.phone,
						email: draft.email,
						notes: draft.notes,
						active: draft.active,
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the florist.");
			toastSuccess(isNew() ? "Florist added." : "Changes saved.");
			await refresh();
			await leave();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-3xl pb-24">
			<Link
				to="/admin/florists"
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Florists
			</Link>
			<PageHeader
				title={isNew() ? "New florist" : draft.savedName || "Untitled florist"}
				actions={
					<Show when={!isNew()}>
						<Link
							to="/admin/logs"
							search={{ area: "florists", item: params().floristId }}
							class={adminButton.secondary}
						>
							Change history
						</Link>
						<Link
							to="/admin/florists/$floristId/bouquets"
							params={{ floristId: params().floristId }}
							class={adminButton.primary}
						>
							Bouquet sheet
						</Link>
					</Show>
				}
			/>

			<section class={cn(adminCard, "grid gap-4 p-5 sm:grid-cols-2")}>
				<Field label="Name">
					<input
						value={draft.name}
						onInput={(e) => setDraft("name", e.currentTarget.value)}
						required
						maxLength={60}
						placeholder="e.g. Ate Joy"
						class={adminInput}
					/>
				</Field>
				<Field label="Phone" hint="Optional.">
					<input
						type="tel"
						value={draft.phone}
						onInput={(e) => setDraft("phone", e.currentTarget.value)}
						maxLength={40}
						class={adminInput}
					/>
				</Field>
				<Field label="Email" hint="Optional.">
					<input
						type="email"
						value={draft.email}
						onInput={(e) => setDraft("email", e.currentTarget.value)}
						maxLength={120}
						class={adminInput}
					/>
				</Field>
				<div class="flex flex-col justify-end gap-1 pb-1">
					<Toggle
						label="Can be given bouquets"
						checked={draft.active}
						onChange={(on) => setDraft("active", on)}
					/>
					<p class="text-xs text-petal-900/55">
						Switch off when they stop working with you. Bouquets they already
						have stay with them.
					</p>
				</div>
				<Field
					label="Notes"
					hint="Optional, staff only. Rates, where they work, how to pay them."
					class="sm:col-span-2"
				>
					<TextArea
						value={draft.notes}
						onInput={(e) => setDraft("notes", e.currentTarget.value)}
						maxLength={500}
						rows={3}
						class={adminInput}
					/>
				</Field>
				<Show when={!isNew()}>
					<p class="text-sm text-petal-900/65 sm:col-span-2">
						<Show
							when={assigned() > 0}
							fallback="No bouquets yet. Give them bouquets from Orders: tick the rows, then “Give to florist”."
						>
							<Link
								to="/admin/orders"
								search={{ florist: params().floristId }}
								class="font-medium text-petal-700 underline underline-offset-2"
							>
								{toMake()} {toMake() === 1 ? "bouquet" : "bouquets"} to make
							</Link>
							<Show when={loaded()?.done}>
								{(done) => <> · {done()} done</>}
							</Show>
						</Show>
					</p>
				</Show>
			</section>

			<Show when={!isNew() && loaded()}>
				{(florist) => (
					<PrivateLink
						floristId={florist().id}
						name={draft.savedName}
						token={florist().shareToken}
					/>
				)}
			</Show>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description={
								assigned() > 0
									? `They still have ${assigned()} bouquets on orders, so they can’t be deleted. Give the bouquets to someone else first, or switch off “Can be given bouquets”.`
									: "They go for good, and their private link stops working."
							}
							confirmLabel={
								assigned() > 0 ? "Show their bouquets" : "Delete florist"
							}
							onConfirm={async () => {
								if (assigned() > 0) {
									await navigate({
										to: "/admin/orders",
										search: { florist: params().floristId, stage: undefined },
									});
									return;
								}
								try {
									await deleteFloristFn({
										data: { id: params().floristId },
									});
									toastSuccess("Florist deleted.");
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
						to="/admin/florists"
						onClick={stepBack}
						class={adminButton.secondary}
					>
						Cancel
					</Link>
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : isNew() ? "Add florist" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}

/**
 * The florist's own page, without signing in: on, off, or a new link that
 * stops the old one. Saved straight away, apart from the form.
 */
function PrivateLink(props: {
	floristId: string;
	name: string;
	token: string | null;
}) {
	const [token, setToken] = createSignal(props.token);
	const [busy, setBusy] = createSignal(false);
	const [origin, setOrigin] = createSignal("");
	onMount(() => setOrigin(window.location.origin));
	const url = () => (token() ? `${origin()}/florist/${token()}` : "");

	const change = async (on: boolean, done: string) => {
		setBusy(true);
		try {
			const result = await setFloristLinkFn({
				data: { id: props.floristId, on },
			});
			setToken(result.token);
			toastSuccess(done);
		} catch (error) {
			toastError(error);
		} finally {
			setBusy(false);
		}
	};
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url());
			toastSuccess("Link copied. Send it to them.");
		} catch {
			toastError(new Error("Couldn’t copy. Select the link and copy it."));
		}
	};

	return (
		<section class={cn(adminCard, "mt-6 p-5")} aria-labelledby="florist-link">
			<h2 id="florist-link" class="font-semibold">
				{props.name}’s own page
			</h2>
			<p class="mt-1 text-sm text-petal-900/65">
				A private link where they see their bouquets on their phone, with
				photos, flowers, cards and the customer’s name, and can print them. No
				sign-in. No prices, payments or emails. Anyone with the link can open
				it, so only send it to them.
			</p>
			<Show
				when={token()}
				fallback={
					<div class="mt-4 flex flex-wrap items-center gap-3">
						<span class="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-petal-900/70">
							Link is off
						</span>
						<button
							type="button"
							disabled={busy()}
							onClick={() =>
								void change(true, "Link is on. Copy it and send it.")
							}
							class={adminButton.primary}
						>
							Turn on link
						</button>
					</div>
				}
			>
				<div class="mt-4 flex flex-col gap-3">
					<div class="flex flex-wrap items-center gap-2">
						<input
							readOnly
							value={url()}
							aria-label="Private link"
							onFocus={(e) => e.currentTarget.select()}
							class={cn(
								adminInput,
								"min-w-0 flex-1 basis-72 font-mono text-xs sm:text-xs",
							)}
						/>
						<button
							type="button"
							onClick={() => void copy()}
							class={adminButton.primary}
						>
							Copy link
						</button>
						<a
							href={url()}
							target="_blank"
							rel="noreferrer"
							class={adminButton.secondary}
						>
							Open
						</a>
					</div>
					<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
						<ConfirmButton
							class="py-1 font-medium text-petal-700 underline underline-offset-2"
							title="Make a new link?"
							description="The old link stops working straight away. Send them the new one."
							confirmLabel="Make new link"
							onConfirm={() =>
								change(true, "New link made. The old one no longer works.")
							}
						>
							Make a new link
						</ConfirmButton>
						<ConfirmButton
							class="py-1 font-medium text-error-foreground underline underline-offset-2"
							title="Turn off the link?"
							description="It stops working straight away. You can turn it on again later; that makes a new link."
							confirmLabel="Turn off"
							onConfirm={() => change(false, "Link turned off.")}
						>
							Turn off link
						</ConfirmButton>
					</div>
				</div>
			</Show>
		</section>
	);
}
