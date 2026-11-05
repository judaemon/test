import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { changeMyPassword } from "~/server/admin/settings";

export const Route = createFileRoute("/admin/_dashboard/password")({
	component: PasswordPage,
});

/** Everyone changes their own password here, starting with a temporary one. */
function PasswordPage() {
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
			<PageHeader
				title="My password"
				description="Got a temporary password from the owner? Replace it with your own."
			/>
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
