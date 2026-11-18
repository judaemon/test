import { createFileRoute } from "@tanstack/solid-router";

import {
	Avatar,
	PageHeader,
	RoleBadge,
	SettingsRow,
	SettingsSection,
} from "~/components/admin/ui";

export const Route = createFileRoute("/admin/_dashboard/account/profile")({
	head: () => ({ meta: [{ title: "Profile · ORAIA Admin" }] }),
	component: ProfilePage,
});

/** Who you're signed in as. Only the owner can change names and emails. */
function ProfilePage() {
	const context = Route.useRouteContext();
	const user = () => context().user;
	const owner = () => user().role === "owner";

	return (
		<div class="mx-auto max-w-3xl">
			<PageHeader title="Profile" />
			<div class="grid gap-10">
				<SettingsSection
					title="Your details"
					description={
						owner()
							? "How you show up in the admin and in the order logs."
							: "How you show up in the admin and in the order logs. To change them, ask the owner."
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
					title="Role"
					description="What you can see and change in the admin."
				>
					<SettingsRow
						label="Your role"
						description={
							owner()
								? "Everything staff can, plus payments, sales and staff."
								: "Run the board, orders and stock."
						}
					>
						<RoleBadge role={user().role} />
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
