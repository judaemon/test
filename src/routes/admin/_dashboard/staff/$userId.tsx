import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/solid-router";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { useLeaveForm } from "~/components/admin/leave-form";
import {
	PermissionSummary,
	permissionCountText,
} from "~/components/admin/permission-list";
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
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { editorCrumbs } from "~/lib/crumbs";
import { can, canAny, withNeeds } from "~/lib/permissions";
import { cn } from "~/lib/utils";
import {
	createStaff,
	getStaffMember,
	listRoleOptions,
	type RoleOption,
	removeStaff,
	resetStaffPassword,
	updateStaff,
} from "~/server/admin/team";

export const Route = createFileRoute("/admin/_dashboard/staff/$userId")({
	beforeLoad: ({ context, params }) => {
		const key = params.userId === "new" ? "staff.manage" : "staff.view";
		if (!canAny(context.user, [key])) throw redirect({ to: "/admin/staff" });
	},
	staticData: {
		crumbs: editorCrumbs("Add a person", "Staff member", (data) => {
			const loaded = data as { member?: { name?: string } | null } | null;
			return loaded?.member?.name;
		}),
	},
	loader: async ({ params }) => {
		if (params.userId === "new")
			return { member: null, roles: await listRoleOptions(), lastOwner: false };
		const detail = await getStaffMember({ data: params.userId });
		if (!detail) throw notFound();
		return detail;
	},
	// The form copies what's loaded once: load anew each time it opens.
	gcTime: 0,
	head: () => ({ meta: [{ title: "Staff · ORAIA Admin" }] }),
	component: StaffEditor,
});

function StaffEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const context = Route.useRouteContext();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/staff" },
	});
	const me = () => context().user;
	const isNew = () => params().userId === "new";
	const member = () => loaded().member;
	const isMe = () => member()?.id === me().id;
	const editable = () =>
		can(me(), "staff.manage") && (isNew() || (member()?.canManage ?? false));

	const [draft, setDraft] = createStore({
		name: member()?.name ?? "",
		email: member()?.email ?? "",
		password: "",
		roleIds: member()?.roles.map((role) => role.id) ?? ([] as string[]),
	});
	const [saving, setSaving] = createSignal(false);

	const picked = createMemo(() =>
		loaded().roles.filter((role) => draft.roleIds.includes(role.id)),
	);
	const together = createMemo(() => ({
		isOwner: picked().some((role) => role.isOwner),
		permissions: withNeeds(picked().flatMap((role) => role.permissions)),
	}));

	const toggleRole = (id: string, on: boolean) =>
		setDraft("roleIds", (ids) =>
			on ? [...ids, id] : ids.filter((other) => other !== id),
		);

	const lockedReason = () => {
		if (isNew() || editable()) return null;
		if (!can(me(), "staff.manage"))
			return "You can see who’s on staff, but changing people needs “Manage staff”.";
		return `${member()?.name} can do things you can’t, so only an owner can change them.`;
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!editable()) return;
		setSaving(true);
		try {
			if (isNew()) {
				await createStaff({
					data: {
						name: draft.name,
						email: draft.email,
						password: draft.password,
						roleIds: draft.roleIds,
					},
				});
				toastSuccess(
					"Account created. Share the password with them privately.",
				);
			} else {
				await updateStaff({
					data: {
						userId: params().userId,
						name: draft.name,
						email: draft.email,
						roleIds: draft.roleIds,
					},
				});
				toastSuccess("Changes saved.");
			}
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
				to="/admin/staff"
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Staff
			</Link>
			<PageHeader
				title={isNew() ? "Add a person" : (member()?.name ?? "Staff member")}
				description={
					isNew()
						? "They sign in at /admin with this email and password."
						: isMe()
							? "This is you."
							: undefined
				}
				actions={
					<Show when={!isNew() && can(me(), "logs.view")}>
						<Link
							to="/admin/logs"
							search={{ area: "staff", item: params().userId }}
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
							maxLength={80}
							autocomplete="off"
							class={adminInput}
						/>
					</Field>
					<Field label="Email" hint="What they sign in with.">
						<input
							type="email"
							value={draft.email}
							onInput={(e) => setDraft("email", e.currentTarget.value)}
							required
							maxLength={254}
							autocomplete="off"
							class={adminInput}
						/>
					</Field>
					<Show when={isNew()}>
						<Field
							label="Temporary password"
							hint="At least 10 characters. They can change it under Account › Security."
						>
							<input
								type="text"
								value={draft.password}
								onInput={(e) => setDraft("password", e.currentTarget.value)}
								required
								minLength={10}
								maxLength={128}
								autocomplete="off"
								class={adminInput}
							/>
						</Field>
					</Show>
				</section>

				<section aria-labelledby="staff-roles">
					<h2 id="staff-roles" class="text-lg font-semibold">
						Roles
					</h2>
					<p class="mt-0.5 text-sm text-petal-900/65">
						Tick one or more. They can do everything their roles allow together.
						<Show when={can(me(), "roles.view")}>
							{" "}
							<Link
								to="/admin/roles"
								class="underline underline-offset-2 hover:text-petal-900"
							>
								See the roles
							</Link>
						</Show>
					</p>
					<ul class={cn(adminCard, "mt-4 divide-y divide-petal-50")}>
						<For each={loaded().roles}>
							{(role) => (
								<RoleChoice
									role={role}
									checked={draft.roleIds.includes(role.id)}
									onChange={(on) => toggleRole(role.id, on)}
									keepsOwner={
										loaded().lastOwner &&
										role.isOwner &&
										draft.roleIds.includes(role.id)
									}
								/>
							)}
						</For>
					</ul>
					<Show when={isMe() && editable()}>
						<p class="mt-2 text-xs text-petal-900/60">
							These are your own roles. Taking one away can close pages you’re
							using now, this one included.
						</p>
					</Show>
				</section>
			</fieldset>

			<section aria-labelledby="staff-can" class="mt-8">
				<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
					<h2 id="staff-can" class="text-lg font-semibold">
						What {isNew() ? "they" : isMe() ? "you" : member()?.name} can do
					</h2>
					<span class="text-sm text-petal-900/60">
						{permissionCountText(
							together().permissions.length,
							together().isOwner,
						)}
					</span>
				</div>
				<PermissionSummary
					permissions={together().permissions}
					everything={together().isOwner}
				/>
			</section>

			<Show when={!isNew() && editable() && !isMe()}>
				<section aria-labelledby="staff-password" class="mt-8">
					<h2 id="staff-password" class="text-lg font-semibold">
						Password
					</h2>
					<div
						class={cn(
							adminCard,
							"mt-4 flex flex-wrap items-center justify-between gap-3 p-5",
						)}
					>
						<p class="text-sm text-petal-900/70">
							Forgot it? Set a temporary one; they’re signed out everywhere.
						</p>
						<ResetPasswordButton
							userId={params().userId}
							name={member()?.name ?? ""}
						/>
					</div>
				</section>
			</Show>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[var(--admin-sidebar,240px)]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew() && editable() && !isMe() && !loaded().lastOwner}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Remove ${member()?.name}?`}
							description="They’re signed out and can’t sign in again. What they did stays in the logs."
							confirmLabel="Remove"
							onConfirm={async () => {
								try {
									await removeStaff({ data: { userId: params().userId } });
									toastSuccess("Account removed.");
									await refresh();
									await leave();
								} catch (error) {
									toastError(error);
								}
							}}
						>
							Remove
						</ConfirmButton>
					</Show>
					<Show
						when={editable()}
						fallback={
							<Link
								to="/admin/staff"
								onClick={stepBack}
								class={adminButton.secondary}
							>
								Back to staff
							</Link>
						}
					>
						<Link
							to="/admin/staff"
							onClick={stepBack}
							class={adminButton.secondary}
						>
							Cancel
						</Link>
						<button
							type="submit"
							class={adminButton.primary}
							disabled={saving()}
						>
							{saving() ? "Saving…" : isNew() ? "Add person" : "Save changes"}
						</button>
					</Show>
				</div>
			</div>
		</form>
	);
}

/** One role to tick, with what it's for and how much it allows. */
function RoleChoice(props: {
	role: RoleOption;
	checked: boolean;
	onChange: (on: boolean) => void;
	/** The only owner: the Owner role stays ticked. */
	keepsOwner: boolean;
}) {
	const id = createUniqueId();
	const locked = () => !props.role.canHandOut || props.keepsOwner;
	return (
		<li>
			<label
				for={id}
				class={cn(
					"flex gap-3 px-5 py-4",
					locked() ? "cursor-default" : "cursor-pointer hover:bg-petal-50/50",
				)}
			>
				<input
					id={id}
					type="checkbox"
					class="mt-1 size-4 shrink-0 accent-petal-700"
					checked={props.checked}
					disabled={locked()}
					onChange={(e) => props.onChange(e.currentTarget.checked)}
					aria-labelledby={`${id}-name`}
					aria-describedby={`${id}-hint`}
				/>
				<span class="min-w-0 flex-1">
					<span class="flex flex-wrap items-baseline justify-between gap-x-3">
						<span id={`${id}-name`} class="font-medium">
							{props.role.name}
						</span>
						<span class="text-xs text-petal-900/55">
							{permissionCountText(
								props.role.permissions.length,
								props.role.isOwner,
							)}
						</span>
					</span>
					<span id={`${id}-hint`} class="block text-sm text-petal-900/65">
						{props.role.description}
						<Show when={props.keepsOwner}>
							{" "}
							<span class="text-petal-700">
								They’re the only owner, so they keep it. Make someone else an
								owner first.
							</span>
						</Show>
						<Show when={!props.role.canHandOut && !props.keepsOwner}>
							{" "}
							<span class="text-petal-700">
								{props.role.isOwner
									? "Only an owner can give or take this."
									: "It can do things you can’t, so you can’t give or take it."}
							</span>
						</Show>
					</span>
				</span>
			</label>
		</li>
	);
}

/** For someone who forgot their password: set a temporary one. */
function ResetPasswordButton(props: { userId: string; name: string }) {
	const [open, setOpen] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const [password, setPassword] = createSignal("");

	const save = async () => {
		setSaving(true);
		try {
			await resetStaffPassword({
				data: { userId: props.userId, newPassword: password() },
			});
			setOpen(false);
			setPassword("");
			toastSuccess(`Password reset. Share it with ${props.name} privately.`);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<button
				type="button"
				class={adminButton.secondary}
				onClick={() => setOpen(true)}
			>
				Reset password
			</button>
			<AlertDialog open={open()} onOpenChange={setOpen}>
				<AlertDialogContent class="max-w-sm rounded-2xl bg-white text-petal-900">
					<AlertDialogTitle class="font-display type-soft text-xl">
						Reset {props.name}’s password?
					</AlertDialogTitle>
					<AlertDialogDescription class="text-sm text-petal-900/70">
						Their old password stops working and they’re signed out everywhere.
					</AlertDialogDescription>
					{/* Not a <form>: this sits inside the page's form. */}
					<div class="grid gap-4">
						<Field
							label="Temporary password"
							hint="At least 10 characters. They can change it under Account › Security."
						>
							<input
								type="text"
								value={password()}
								onInput={(e) => setPassword(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										if (password().length >= 10) void save();
									}
								}}
								minLength={10}
								maxLength={128}
								autocomplete="off"
								class={adminInput}
							/>
						</Field>
						<div class="flex justify-end gap-2">
							<button
								type="button"
								class={adminButton.secondary}
								onClick={() => setOpen(false)}
							>
								Keep it
							</button>
							<button
								type="button"
								class={adminButton.primary}
								disabled={saving() || password().length < 10}
								onClick={() => void save()}
							>
								{saving() ? "Saving…" : "Reset password"}
							</button>
						</div>
					</div>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
