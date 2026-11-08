import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useLeaveForm } from "~/components/admin/leave-form";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import {
	deleteArrangementTypeFn,
	getArrangementTypeAdmin,
	saveArrangementTypeFn,
} from "~/server/admin/arrangement-types";

export const Route = createFileRoute(
	"/admin/_dashboard/arrangement-types/$typeId",
)({
	loader: async ({ params }) => {
		if (params.typeId === "new") return null;
		const type = await getArrangementTypeAdmin({ data: params.typeId });
		if (!type) throw notFound();
		return type;
	},
	// The form copies what's loaded once, so it must never open on a kept
	// copy that's refreshed behind it: drop it on leaving, load anew each time.
	gcTime: 0,
	component: ArrangementTypeEditor,
});

function ArrangementTypeEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/arrangement-types" },
	});
	const isNew = () => params().typeId === "new";
	const [draft, setDraft] = createStore({
		savedName: loaded()?.name ?? "",
		name: loaded()?.name ?? "",
		pluralName: loaded()?.pluralName ?? "",
		description: loaded()?.description ?? "",
	});
	const [saving, setSaving] = createSignal(false);
	const usedIn = () => loaded()?.usedIn ?? 0;
	const sizeCount = () => loaded()?.sizeCount ?? 0;

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveArrangementTypeFn({
				data: {
					id: isNew() ? "" : params().typeId,
					type: {
						name: draft.name,
						pluralName: draft.pluralName,
						description: draft.description,
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the type.");
			toastSuccess(isNew() ? "Type added." : "Changes saved.");
			// The shop and the arrangement editor read types from the root route.
			await refresh();
			await leave();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const deleteNote = () => {
		const reasons = [
			usedIn() > 0 &&
				`${usedIn()} ${usedIn() === 1 ? "arrangement is" : "arrangements are"} this type`,
			sizeCount() > 0 &&
				`${sizeCount()} ${sizeCount() === 1 ? "size is" : "sizes are"} for it`,
		].filter(Boolean);
		return reasons.length
			? `${reasons.join(" and ")}, so it can’t be deleted until they’re moved to another type.`
			: "Its shop tab goes for good.";
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-3xl pb-24">
			<Link
				to="/admin/arrangement-types"
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Arrangement types
			</Link>
			<PageHeader
				title={isNew() ? "New type" : draft.savedName || "Untitled type"}
				description={
					isNew()
						? "New types go last in the shop’s tabs. Reorder them on the Arrangement types page."
						: undefined
				}
			/>

			<section class={cn(adminCard, "grid gap-4 p-5 sm:grid-cols-2")}>
				<Field label="Name">
					<input
						value={draft.name}
						onInput={(e) => setDraft("name", e.currentTarget.value)}
						required
						maxLength={30}
						placeholder="e.g. Corsage"
						class={adminInput}
					/>
				</Field>
				<Field label="Shop tab" hint="The plural, e.g. Corsages.">
					<input
						value={draft.pluralName}
						onInput={(e) => setDraft("pluralName", e.currentTarget.value)}
						required
						maxLength={40}
						placeholder="e.g. Corsages"
						class={adminInput}
					/>
				</Field>
				<Field
					label="Description"
					hint="Shown on each arrangement of this type, and when picking a type."
					class="sm:col-span-2"
				>
					<input
						value={draft.description}
						onInput={(e) => setDraft("description", e.currentTarget.value)}
						maxLength={120}
						placeholder="e.g. A wearable floral piece worn on the wrist."
						class={adminInput}
					/>
				</Field>
				<p class="text-xs text-petal-900/55 sm:col-span-2">
					<Show
						when={sizeCount() > 0}
						fallback="No sizes for this type yet, so its arrangements don’t show one. "
					>
						{sizeCount()} {sizeCount() === 1 ? "size" : "sizes"} for this type.{" "}
					</Show>
					Add or change them in{" "}
					<Link
						to="/admin/sizes"
						class="underline underline-offset-2 hover:text-petal-900"
					>
						Sizes
					</Link>
					.
				</p>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description={deleteNote()}
							confirmLabel="Delete type"
							onConfirm={async () => {
								try {
									await deleteArrangementTypeFn({
										data: { id: params().typeId },
									});
									toastSuccess("Type deleted.");
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
						to="/admin/arrangement-types"
						onClick={stepBack}
						class={adminButton.secondary}
					>
						Cancel
					</Link>
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : isNew() ? "Add type" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
