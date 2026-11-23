import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { needs } from "~/components/admin/access";
import { permissionCountText } from "~/components/admin/permission-list";
import {
	Avatar,
	adminButton,
	adminCard,
	PageHeader,
	RoleBadge,
} from "~/components/admin/ui";
import { can, PERMISSION_GROUPS } from "~/lib/permissions";
import { cn } from "~/lib/utils";
import { listRolesAdmin, type RoleSummary } from "~/server/admin/team";

export const Route = createFileRoute("/admin/_dashboard/roles/")({
	beforeLoad: needs("roles.view"),
	loader: {
		handler: () => listRolesAdmin(),
		staleReloadMode: "blocking",
	},
	head: () => ({ meta: [{ title: "Roles · ORAIA Admin" }] }),
	component: RolesPage,
});

function RolesPage() {
	const roles = Route.useLoaderData();
	const context = Route.useRouteContext();
	const canManage = () => can(context().user, "roles.manage");

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Roles"
				description={
					<>
						A role is a set of things people can do in the admin. Give people
						one or more roles in{" "}
						<Show when={can(context().user, "staff.view")} fallback="Staff">
							<Link
								to="/admin/staff"
								class="underline underline-offset-2 hover:text-petal-900"
							>
								Staff
							</Link>
						</Show>
						; together they decide what each person can do.
					</>
				}
				actions={
					<Show when={canManage()}>
						<Link
							to="/admin/roles/$roleId"
							params={{ roleId: "new" }}
							class={adminButton.primary}
						>
							+ New role
						</Link>
					</Show>
				}
			/>
			<ul class="grid gap-3">
				<For each={roles()}>{(role) => <RoleCard role={role} />}</For>
			</ul>
		</div>
	);
}

/** One role: what it's for, how much it allows by area, and who has it. */
function RoleCard(props: { role: RoleSummary }) {
	const context = Route.useRouteContext();
	const allowed = () => new Set(props.role.permissions);
	const areas = () =>
		PERMISSION_GROUPS.map((group) => ({
			label: group.label,
			on: group.permissions.filter((info) => allowed().has(info.key)).length,
			of: group.permissions.length,
		})).filter((area) => area.on > 0);
	const shown = () => props.role.members.slice(0, 5);
	const more = () => props.role.members.length - shown().length;

	return (
		<li class={cn(adminCard, "grid gap-4 p-5 sm:grid-cols-[1fr_auto]")}>
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<Link
						to="/admin/roles/$roleId"
						params={{ roleId: props.role.id }}
						class="text-base font-semibold underline-offset-2 hover:underline"
					>
						{props.role.name}
					</Link>
					<Show when={props.role.isOwner}>
						<RoleBadge name="Built in" isOwner />
					</Show>
				</div>
				<Show when={props.role.description}>
					<p class="mt-0.5 text-sm text-petal-900/70">
						{props.role.description}
					</p>
				</Show>
				<p class="mt-2 text-sm font-medium">
					{permissionCountText(
						props.role.permissions.length,
						props.role.isOwner,
					)}
				</p>
				<Show when={!props.role.isOwner && areas().length}>
					<p class="mt-0.5 text-xs text-petal-900/60">
						<For each={areas()}>
							{(area, index) => (
								<>
									<Show when={index() > 0}>
										<span aria-hidden="true"> · </span>
									</Show>
									<span class="whitespace-nowrap">
										{area.label} {area.on}/{area.of}
									</span>
								</>
							)}
						</For>
					</p>
				</Show>
			</div>
			<div class="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:justify-between">
				<div class="flex items-center gap-2">
					<Show
						when={props.role.members.length}
						fallback={<span class="text-sm text-petal-900/55">No one yet</span>}
					>
						<span class="flex -space-x-2" aria-hidden="true">
							<For each={shown()}>
								{(member) => (
									<Avatar
										name={member.name}
										class="size-7 text-[11px] ring-2 ring-white"
									/>
								)}
							</For>
						</span>
						<span class="text-sm text-petal-900/70">
							{props.role.members.length}{" "}
							{props.role.members.length === 1 ? "person" : "people"}
							<Show when={more() > 0}>
								<span class="sr-only">, {more()} not shown</span>
							</Show>
						</span>
					</Show>
				</div>
				<div class="flex items-center gap-2">
					<Show when={can(context().user, "roles.manage")}>
						<Link
							to="/admin/roles/$roleId"
							params={{ roleId: "new" }}
							search={{ from: props.role.id }}
							class={adminButton.ghost}
							aria-label={`Copy ${props.role.name}`}
						>
							Copy
						</Link>
					</Show>
					<Link
						to="/admin/roles/$roleId"
						params={{ roleId: props.role.id }}
						class={adminButton.secondary}
					>
						{props.role.canEdit ? "Edit" : "View"}
					</Link>
				</div>
			</div>
		</li>
	);
}
