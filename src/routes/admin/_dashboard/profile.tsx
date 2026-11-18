import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";

import {
	Avatar,
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	RoleBadge,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { changeMyPassword } from "~/server/admin/settings";

export const Route = createFileRoute("/admin/_dashboard/profile")({
	head: () => ({ meta: [{ title: "My profile · ORAIA Admin" }] }),
	component: ProfilePage,
});

/**
 * Who you're signed in as, and where everyone changes their own password,
 * starting with the temporary one the owner gave them.
 */
function ProfilePage() {
	const context = Route.useRouteContext();
	const user = () => context().user;
	const [saving, setSaving] = createSignal(false);

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		const formElement = event.currentTarget as HTMLFormElement;
		const form = new FormData(formElement);
		const newPassword = String(form.get("newPassword") ?? "");
		if (newPassword !== String(form.get("confirmPassword") ?? "")) {
			toastError(new Error("The new passwords don’t match."));
			return;
		}
		setSaving(true);
		try {
			await changeMyPassword({
				data: {
					currentPassword: String(form.get("currentPassword") ?? ""),
					newPassword,
				},
			});
			formElement.reset();
			toastSuccess("Password changed. Other devices were signed out.");
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div class="mx-auto max-w-md">
			<PageHeader title="My profile" />
			<section aria-labelledby="profile-details" class={cn(adminCard, "p-5")}>
				<h2 id="profile-details" class="sr-only">
					Your details
				</h2>
				<div class="flex items-center gap-4">
					<Avatar name={user().name} class="size-14 text-lg" />
					<div class="min-w-0">
						<p class="truncate text-base font-semibold">{user().name}</p>
						<p class="truncate text-sm text-petal-900/65">{user().email}</p>
					</div>
				</div>
				<dl class="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-t border-petal-100 pt-4 text-sm">
					<dt class="text-petal-900/65">Role</dt>
					<dd>
						<RoleBadge role={user().role} />
					</dd>
					<dt class="text-petal-900/65">Can do</dt>
					<dd>
						{user().role === "owner"
							? "Everything staff can, plus payments, sales and staff"
							: "Run the board, orders and stock"}
					</dd>
				</dl>
				<p class="mt-4 text-xs text-petal-900/55">
					To change your name or email, ask the owner.
				</p>
			</section>

			<h2 class="mt-8 mb-1 font-semibold">Change password</h2>
			<p class="mb-3 text-sm text-petal-900/65">
				Got a temporary password from the owner? Replace it with your own.
			</p>
			<form onSubmit={save} class={cn(adminCard, "grid gap-4 p-5")}>
				<Field label="Current password">
					<input
						name="currentPassword"
						type="password"
						required
						autocomplete="current-password"
						class={adminInput}
					/>
				</Field>
				<Field label="New password" hint="At least 10 characters.">
					<input
						name="newPassword"
						type="password"
						required
						minLength={10}
						maxLength={128}
						autocomplete="new-password"
						class={adminInput}
					/>
				</Field>
				<Field label="New password again">
					<input
						name="confirmPassword"
						type="password"
						required
						minLength={10}
						maxLength={128}
						autocomplete="new-password"
						class={adminInput}
					/>
				</Field>
				<div class="flex justify-end">
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : "Change password"}
					</button>
				</div>
			</form>
		</div>
	);
}
