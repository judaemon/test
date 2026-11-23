import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import { needs } from "~/components/admin/access";
import { permissionCountText } from "~/components/admin/permission-list";
import {
	Avatar,
	adminButton,
	adminCard,
	adminInput,
	PageHeader,
	RoleBadges,
} from "~/components/admin/ui";
import { can } from "~/lib/permissions";
import { cn } from "~/lib/utils";
import { listStaff } from "~/server/admin/team";

export const Route = createFileRoute("/admin/_dashboard/staff/")({
	beforeLoad: needs("staff.view"),
	loader: {
		handler: () => listStaff(),
		staleReloadMode: "blocking",
	},
	head: () => ({ meta: [{ title: "Staff · ORAIA Admin" }] }),
	component: StaffPage,
});

function StaffPage() {
	const staff = Route.useLoaderData();
	const context = Route.useRouteContext();
	const me = () => context().user;
	const canManage = () => can(me(), "staff.manage");
	const [query, setQuery] = createSignal("");

	const shown = createMemo(() => {
		const q = query().trim().toLowerCase();
		if (!q) return staff();
		return staff().filter((member) =>
			[member.name, member.email, ...member.roles.map((role) => role.name)]
				.join(" ")
				.toLowerCase()
				.includes(q),
		);
	});

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Staff"
				description={
					<>
						Everyone who can sign in to the admin. What each person can do comes
						from their roles; someone can have more than one.
						<Show when={can(me(), "roles.view")}>
							{" "}
							<Link
								to="/admin/roles"
								class="underline underline-offset-2 hover:text-petal-900"
							>
								See the roles
							</Link>
						</Show>
					</>
				}
				actions={
					<Show when={canManage()}>
						<Link
							to="/admin/staff/$userId"
							params={{ userId: "new" }}
							class={adminButton.primary}
						>
							+ Add person
						</Link>
					</Show>
				}
			/>

			<Show when={staff().length > 6}>
				<div class="mb-4 max-w-sm">
					<label for="staff-search" class="sr-only">
						Search staff
					</label>
					<input
						id="staff-search"
						type="search"
						placeholder="Search by name, email or role"
						value={query()}
						onInput={(e) => setQuery(e.currentTarget.value)}
						class={adminInput}
					/>
				</div>
			</Show>

			<section class={adminCard}>
				<Show
					when={shown().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">
							No one matches “{query()}”.
						</p>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={shown()}>
							{(member) => {
								const isMe = () => member.id === me().id;
								return (
									<li class="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
										<Avatar name={member.name} class="size-10 text-sm" />
										<div class="min-w-0 flex-1 basis-48">
											<p class="truncate font-medium">
												<Link
													to="/admin/staff/$userId"
													params={{ userId: member.id }}
													class="underline-offset-2 hover:underline"
												>
													{member.name}
												</Link>
												<Show when={isMe()}>
													<span class="ml-2 text-xs font-normal text-petal-900/50">
														(you)
													</span>
												</Show>
											</p>
											<p class="truncate text-sm text-petal-900/60">
												{member.email}
											</p>
										</div>
										<div class="flex min-w-0 basis-56 flex-col gap-1 sm:items-end">
											<RoleBadges roles={member.roles} class="sm:justify-end" />
											<span class="text-xs text-petal-900/55">
												{permissionCountText(
													member.permissionCount,
													member.isOwner,
												)}
											</span>
										</div>
										<Link
											to="/admin/staff/$userId"
											params={{ userId: member.id }}
											class={cn(adminButton.secondary, "shrink-0")}
											aria-label={`${canManage() && member.canManage ? "Edit" : "View"} ${member.name}`}
										>
											{canManage() && member.canManage ? "Edit" : "View"}
										</Link>
									</li>
								);
							}}
						</For>
					</ul>
				</Show>
			</section>
		</div>
	);
}
