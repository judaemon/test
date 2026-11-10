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
	TextArea,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import {
	deleteSupplierFn,
	getSupplierAdmin,
	saveSupplierFn,
} from "~/server/admin/suppliers";

export const Route = createFileRoute("/admin/_dashboard/suppliers/$supplierId")(
	{
		loader: async ({ params }) => {
			if (params.supplierId === "new") return null;
			const supplier = await getSupplierAdmin({ data: params.supplierId });
			if (!supplier) throw notFound();
			return supplier;
		},
		// The form copies what's loaded once, so it must never open on a kept
		// copy that's refreshed behind it: drop it on leaving, load anew each time.
		gcTime: 0,
		component: SupplierEditor,
	},
);

function SupplierEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/suppliers" },
	});
	const isNew = () => params().supplierId === "new";
	const [draft, setDraft] = createStore({
		savedName: loaded()?.name ?? "",
		name: loaded()?.name ?? "",
		contactName: loaded()?.contactName ?? "",
		phone: loaded()?.phone ?? "",
		email: loaded()?.email ?? "",
		notes: loaded()?.notes ?? "",
	});
	const [saving, setSaving] = createSignal(false);
	const wrapperCount = () => loaded()?.wrapperCount ?? 0;

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveSupplierFn({
				data: {
					id: isNew() ? "" : params().supplierId,
					supplier: {
						name: draft.name,
						contactName: draft.contactName,
						phone: draft.phone,
						email: draft.email,
						notes: draft.notes,
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the supplier.");
			toastSuccess(isNew() ? "Supplier added." : "Changes saved.");
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
				to="/admin/suppliers"
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Suppliers
			</Link>
			<PageHeader
				title={
					isNew() ? "New supplier" : draft.savedName || "Untitled supplier"
				}
				actions={
					<Show when={!isNew()}>
						<Link
							to="/admin/logs"
							search={{ area: "suppliers", item: params().supplierId }}
							class={adminButton.secondary}
						>
							Change history
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
						placeholder="e.g. Dangwa Wraps Trading"
						class={adminInput}
					/>
				</Field>
				<Field label="Contact person" hint="Optional.">
					<input
						value={draft.contactName}
						onInput={(e) => setDraft("contactName", e.currentTarget.value)}
						maxLength={60}
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
				<Field
					label="Notes"
					hint="Optional. Lead times, minimum orders, how to pay them."
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
					<p class="text-xs text-petal-900/55 sm:col-span-2">
						<Show
							when={wrapperCount() > 0}
							fallback="Supplies no wrappers yet. Pick this supplier on a wrapper to link them."
						>
							Supplies{" "}
							<Link
								to="/admin/wrappers"
								search={{ supplier: params().supplierId }}
								class="underline underline-offset-2 hover:text-petal-900"
							>
								{wrapperCount()} {wrapperCount() === 1 ? "wrapper" : "wrappers"}
							</Link>
							.
						</Show>
					</p>
				</Show>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description={
								wrapperCount() > 0
									? `Its ${wrapperCount()} ${wrapperCount() === 1 ? "wrapper stays" : "wrappers stay"}, with no supplier.`
									: "It goes for good."
							}
							confirmLabel="Delete supplier"
							onConfirm={async () => {
								try {
									await deleteSupplierFn({
										data: { id: params().supplierId },
									});
									toastSuccess("Supplier deleted.");
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
						to="/admin/suppliers"
						onClick={stepBack}
						class={adminButton.secondary}
					>
						Cancel
					</Link>
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : isNew() ? "Add supplier" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
