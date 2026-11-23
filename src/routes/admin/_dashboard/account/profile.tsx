import { createFileRoute } from "@tanstack/solid-router";

import {
	PermissionSummary,
	permissionCountText,
} from "~/components/admin/permission-list";
import {
	Avatar,
	PageHeader,
	RoleBadges,
	SettingsRow,
	SettingsSection,
} from "~/components/admin/ui";
import { can } from "~/lib/permissions";

export const Route = createFileRoute("/admin/_dashboard/account/profile")({
	head: () => ({ meta: [{ title: "Profile · ORAIA Admin" }] }),
	component: ProfilePage,
});

/** Who you're signed in as, your roles, and what they let you do. */
function ProfilePage() {
	const context = Route.useRouteContext();
	const user = () => context().user;
	const canChangeStaff = () => can(user(), "staff.manage");

	return (
		<div class="mx-auto max-w-3xl">
			<PageHeader title="Profile" />
			<div class="grid gap-10">
				<SettingsSection
					title="Your details"
					description={
						canChangeStaff()
							? "How you show up in the admin and in the order logs. Change them in Team › Staff."
							: "How you show up in the admin and in the order logs. To change them, ask someone who manages staff."
					}
				>
					<SettingsRow label="Picture" description="Your initials, for now.">
						<Avatar name={user().name} class="size-12 text-base" />
					</SettingsRow>
					<SettingsRow label="Name">
						<p class="truncate font-medium">{user().name}</p>
					</SettingsRow>
					<SettingsRow label="Email" description="What you sign in with.">
						<p class="truncate">{user().email}</p>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Roles"
					description="Together, your roles decide what you can see and change in the admin."
				>
					<SettingsRow
						label="Your roles"
						description={permissionCountText(
							user().permissions.length,
							user().isOwner,
						)}
					>
						<RoleBadges roles={user().roles} />
					</SettingsRow>
				</SettingsSection>

				<section aria-labelledby="profile-can">
					<h2 id="profile-can" class="text-lg font-semibold">
						What you can do
					</h2>
					<p class="mt-0.5 mb-4 text-sm text-petal-900/65">
						Need something that isn’t ticked? Ask an owner to add it to one of
						your roles.
					</p>
					<PermissionSummary
						permissions={user().permissions}
						everything={user().isOwner}
					/>
				</section>
			</div>
		</div>
	);
}
