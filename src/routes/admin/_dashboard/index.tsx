import { createFileRoute, Link, redirect } from "@tanstack/solid-router";

import { firstPage } from "~/components/admin/nav";
import { adminButton, adminCard, PageHeader } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

// The to-do board is switched off for now: home is the first page their
// roles open (Orders, for most), or a note when they open none yet.
export const Route = createFileRoute("/admin/_dashboard/")({
	beforeLoad: ({ context }) => {
		const to = firstPage(context.user);
		if (to) throw redirect({ to, replace: true });
	},
	component: NoAccessPage,
});

function NoAccessPage() {
	const context = Route.useRouteContext();
	return (
		<div class="mx-auto max-w-xl">
			<PageHeader title={`Welcome, ${context().user.name}`} />
			<section class={cn(adminCard, "grid gap-3 p-6")}>
				<h2 class="text-lg font-semibold">There’s nothing to open yet</h2>
				<p class="text-sm text-petal-900/70">
					{context().user.roles.length === 0
						? "Your account doesn’t have a role yet. Ask an owner to give you one in Team › Staff, then refresh this page."
						: "Your roles don’t open any pages yet. Ask an owner to add what you need in Team › Roles, then refresh this page."}
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<button
						type="button"
						class={adminButton.primary}
						onClick={() => window.location.reload()}
					>
						Refresh
					</button>
					<Link to="/admin/account/profile" class={adminButton.secondary}>
						Your profile
					</Link>
				</div>
			</section>
		</div>
	);
}
