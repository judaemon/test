import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { useLeaveForm } from "~/components/admin/leave-form";
import { PermissionPicker } from "~/components/admin/permission-list";
import {
	Avatar,
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	RoleBadge,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { editorCrumbs } from "~/lib/crumbs";
import {
	ALL_PERMISSIONS,
	can,
	canAny,
	type Permission,
} from "~/lib/permissions";
import { cn } from "~/lib/utils";
import {
	deleteRoleFn,
	getNewRoleAdmin,
	getRoleAdmin,
	saveRoleFn,
} from "~/server/admin/team";

export const Route = createFileRoute("/admin/_dashboard/roles/$roleId")({
	validateSearch: (search: Record<string, unknown>): { from?: string } => ({
		/** Copying a role: start from its name and permissions. */
		from:
			typeof search.from === "string" && search.from ? search.from : undefined,
	}),
	beforeLoad: ({ context, params }) => {
		const key = params.roleId === "new" ? "roles.manage" : "roles.view";
		if (!canAny(context.user, [key])) throw redirect({ to: "/admin/roles" });
	},
	staticData: {
		crumbs: editorCrumbs("New role", "Untitled role", (data) => {
			const loaded = data as { role?: { name?: string } } | null;
			return loaded?.role?.name;
		}),
	},
	loaderDeps: ({ search }) => ({ from: search.from }),
	loader: async ({ params, deps }) => {
		if (params.roleId === "new") {
			const blank = await getNewRoleAdmin({ data: deps.from ?? "" });
			return { role: null, ...blank };
		}
		const detail = await getRoleAdmin({ data: params.roleId });
		if (!detail) throw notFound();
		return { ...detail, copyOf: null };
	},
	// The form copies what's loaded once: load anew each time it opens.
	gcTime: 0,
	head: () => ({ meta: [{ title: "Role · ORAIA Admin" }] }),
	component: RoleEditor,
});

function RoleEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const context = Route.useRouteContext();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/roles" },
	});
	const isNew = () => params().roleId === "new";
	const role = () => loaded().role;
	const isOwnerRole = () => role()?.isOwner ?? false;
	const editable = () => (isNew() ? true : (role()?.canEdit ?? false));
	const copyOf = () => loaded().copyOf;

	const [draft, setDraft] = createStore({
		name: role()?.name ?? (copyOf() ? `${copyOf()?.name} copy` : ""),
		description: role()?.description ?? copyOf()?.description ?? "",
		permissions: (role()?.permissions ??
			copyOf()?.permissions ??
			[]) as Permission[],
	});
	const [saving, setSaving] = createSignal(false);
	const members = () => role()?.members ?? [];

	/** Why the form is read only, when it is. */
	const lockedReason = () => {
		if (isOwnerRole())
			return "The Owner role can do everything, including anything added later. It’s built in, so it can’t be changed or deleted.";
		if (!can(context().user, "roles.manage"))
			return "You can see this role, but changing roles needs “Manage roles”.";
		if (!editable())
			return "This role can do things you can’t, so only an owner can change it.";
		return null;
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!editable()) return;
		setSaving(true);
		try {
			await saveRoleFn({
				data: {
					id: isNew() ? "" : params().roleId,
					name: draft.name,
					description: draft.description,
					permissions: draft.permissions,
				},
			});
			toastSuccess(isNew() ? "Role added." : "Changes saved.");
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
				to="/admin/roles"
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Roles
			</Link>
			<PageHeader
				title={isNew() ? "New role" : role()?.name || "Untitled role"}
				description={
					isNew()
						? "Name it for the job, then tick what people with it can do."
						: undefined
				}
				actions={
					<Show when={!isNew() && can(context().user, "logs.view")}>
						<Link
							to="/admin/logs"
							search={{ area: "roles", item: params().roleId }}
							class={adminButton.secondary}
						>
							Change history
						</Link>
					</Show>
				}
			/>

			<Show when={lockedReason()}>
				{(reason) => (
					<p
						role="note"
						class="mb-6 rounded-2xl border border-petal-100 bg-petal-50/70 px-4 py-3 text-sm text-petal-900/75"
					>
						{reason()}
					</p>
				)}
			</Show>

			<fieldset disabled={!editable()} class="grid min-w-0 gap-8">
				<section class={cn(adminCard, "grid gap-4 p-5 sm:grid-cols-2")}>
					<Field label="Name">
						<input
							value={draft.name}
							onInput={(e) => setDraft("name", e.currentTarget.value)}
							required
							maxLength={40}
							placeholder="e.g. Florist lead"
							class={adminInput}
						/>
					</Field>
					<Field
						label="What it’s for"
						hint="Optional. Shown on the Roles page."
					>
						<input
							value={draft.description}
							onInput={(e) => setDraft("description", e.currentTarget.value)}
							maxLength={160}
							placeholder="e.g. Checks payments during the rush"
							class={adminInput}
						/>
					</Field>
				</section>

				<section aria-labelledby="role-permissions">
					<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
						<h2 id="role-permissions" class="text-lg font-semibold">
							What people with this role can do
						</h2>
						<span class="text-sm tabular-nums text-petal-900/60">
							{isOwnerRole()
								? "Everything"
								: `${draft.permissions.length} of ${ALL_PERMISSIONS.length}`}
						</span>
					</div>
					<PermissionPicker
						value={isOwnerRole() ? ALL_PERMISSIONS : draft.permissions}
						onChange={(next) => setDraft("permissions", next)}
						grantable={loaded().grantable}
						disabled={!editable()}
					/>
				</section>
			</fieldset>

			<Show when={!isNew()}>
				<section aria-labelledby="role-members" class="mt-8">
					<h2 id="role-members" class="text-lg font-semibold">
						People with this role
					</h2>
					<p class="mt-0.5 text-sm text-petal-900/65">
						Give or take it on each person’s page in Staff.
					</p>
					<div class={cn(adminCard, "mt-4")}>
						<Show
							when={members().length}
							fallback={
								<p class="px-5 py-4 text-sm text-petal-900/55">No one yet.</p>
							}
						>
							<ul class="divide-y divide-petal-50">
								<For each={members()}>
									{(member) => (
										<li class="flex items-center gap-3 px-5 py-3">
											<Avatar name={member.name} class="size-8 text-xs" />
											<div class="min-w-0 flex-1">
												<Show
													when={can(context().user, "staff.view")}
													fallback={
														<p class="truncate font-medium">{member.name}</p>
													}
												>
													<Link
														to="/admin/staff/$userId"
														params={{ userId: member.id }}
														class="block truncate font-medium underline-offset-2 hover:underline"
													>
														{member.name}
													</Link>
												</Show>
												<p class="truncate text-sm text-petal-900/60">
													{member.email}
												</p>
											</div>
											<Show when={member.id === context().user.id}>
												<RoleBadge name="You" />
											</Show>
										</li>
									)}
								</For>
							</ul>
						</Show>
					</div>
				</section>
			</Show>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[var(--admin-sidebar,240px)]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew() && editable()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${role()?.name}?`}
							description={
								members().length
									? `${members().length} ${members().length === 1 ? "person loses" : "people lose"} it, and with it what only this role let them do. Their other roles stay.`
									: "No one has it, so nothing else changes."
							}
							confirmLabel="Delete role"
							onConfirm={async () => {
								try {
									await deleteRoleFn({ data: { id: params().roleId } });
									toastSuccess("Role deleted.");
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
					<Show
						when={editable()}
						fallback={
							<Link
								to="/admin/roles"
								onClick={stepBack}
								class={adminButton.secondary}
							>
								Back to roles
							</Link>
						}
					>
						<Link
							to="/admin/roles"
							onClick={stepBack}
							class={adminButton.secondary}
						>
							Cancel
						</Link>
						<button
							type="submit"
							class={adminButton.primary}
							disabled={saving() || draft.permissions.length === 0}
						>
							{saving() ? "Saving…" : isNew() ? "Add role" : "Save changes"}
						</button>
					</Show>
				</div>
			</div>
		</form>
	);
}
