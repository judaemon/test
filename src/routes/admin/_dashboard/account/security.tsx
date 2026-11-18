import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";

import {
	adminButton,
	adminInput,
	PageHeader,
	SettingsRow,
	SettingsSection,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { changeMyPassword } from "~/server/admin/settings";

export const Route = createFileRoute("/admin/_dashboard/account/security")({
	head: () => ({ meta: [{ title: "Security · ORAIA Admin" }] }),
	component: SecurityPage,
});

/** Everyone changes their own password here, starting with a temporary one. */
function SecurityPage() {
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
		<div class="mx-auto max-w-3xl">
			<PageHeader title="Security" />
			<form onSubmit={save}>
				<SettingsSection
					title="Password"
					description="Got a temporary password from the owner? Replace it with your own. Changing it signs you out on your other devices."
					footer={
						<button
							type="submit"
							class={adminButton.primary}
							disabled={saving()}
						>
							{saving() ? "Saving…" : "Change password"}
						</button>
					}
				>
					<SettingsRow label="Current password" for="current-password">
						<input
							id="current-password"
							name="currentPassword"
							type="password"
							required
							autocomplete="current-password"
							class={adminInput}
						/>
					</SettingsRow>
					<SettingsRow
						label="New password"
						for="new-password"
						description="At least 10 characters."
					>
						<input
							id="new-password"
							aria-describedby="new-password-hint"
							name="newPassword"
							type="password"
							required
							minLength={10}
							maxLength={128}
							autocomplete="new-password"
							class={adminInput}
						/>
					</SettingsRow>
					<SettingsRow label="New password again" for="confirm-password">
						<input
							id="confirm-password"
							name="confirmPassword"
							type="password"
							required
							minLength={10}
							maxLength={128}
							autocomplete="new-password"
							class={adminInput}
						/>
					</SettingsRow>
				</SettingsSection>
			</form>
		</div>
	);
}
