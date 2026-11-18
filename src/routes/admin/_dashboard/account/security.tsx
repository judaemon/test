import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";

import {
	adminButton,
	adminInput,
	PageHeader,
	SettingsRow,
	SettingsSection,
	toastSuccess,
} from "~/components/admin/ui";
import { PasswordInput } from "~/components/ui/password-input";
import { cn } from "~/lib/utils";
import { changeMyPassword } from "~/server/admin/settings";

export const Route = createFileRoute("/admin/_dashboard/account/security")({
	head: () => ({ meta: [{ title: "Security · ORAIA Admin" }] }),
	component: SecurityPage,
});

const MIN_LENGTH = 10;

/** Everyone changes their own password here, starting with a temporary one. */
function SecurityPage() {
	const context = Route.useRouteContext();
	const [current, setCurrent] = createSignal("");
	const [next, setNext] = createSignal("");
	const [again, setAgain] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal("");
	// Mismatches show once they've finished typing it, not on the first key.
	const [againTouched, setAgainTouched] = createSignal(false);

	const longEnough = () => next().length >= MIN_LENGTH;
	const matches = () => again().length > 0 && again() === next();
	const sameAsCurrent = () => !!next() && next() === current();
	const ready = () =>
		!!current() && longEnough() && matches() && !sameAsCurrent();

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setAgainTouched(true);
		if (!ready()) return;
		setSaving(true);
		setError("");
		try {
			await changeMyPassword({
				data: { currentPassword: current(), newPassword: next() },
			});
			setCurrent("");
			setNext("");
			setAgain("");
			setAgainTouched(false);
			toastSuccess("Password changed. Other devices were signed out.");
		} catch (failure) {
			setError(
				failure instanceof Error && failure.message
					? failure.message
					: "Couldn’t change your password. Please try again.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div class="mx-auto max-w-3xl">
			<PageHeader title="Security" />
			<form onSubmit={save} novalidate>
				{/* Lets password managers save the new password to this account. */}
				<input
					type="email"
					name="username"
					autocomplete="username"
					value={context().user.email}
					readOnly
					hidden
				/>
				<SettingsSection
					title="Password"
					description="Got a temporary password from the owner? Replace it with your own. Changing it signs you out on your other devices."
					footer={
						<button
							type="submit"
							class={adminButton.primary}
							disabled={saving() || !ready()}
						>
							{saving() ? "Saving…" : "Change password"}
						</button>
					}
				>
					<SettingsRow label="Current password" for="current-password">
						<PasswordInput
							id="current-password"
							name="currentPassword"
							required
							autocomplete="current-password"
							value={current()}
							onInput={(e) => {
								setCurrent(e.currentTarget.value);
								setError("");
							}}
							aria-invalid={!!error() || undefined}
							aria-describedby={error() ? "password-error" : undefined}
							class={adminInput}
						/>
						<Show when={error()}>
							<p
								id="password-error"
								role="alert"
								class="mt-1.5 text-sm text-error-foreground"
							>
								{error()}
							</p>
						</Show>
					</SettingsRow>
					<SettingsRow label="New password" for="new-password">
						<PasswordInput
							id="new-password"
							name="newPassword"
							required
							minLength={MIN_LENGTH}
							maxLength={128}
							autocomplete="new-password"
							value={next()}
							onInput={(e) => setNext(e.currentTarget.value)}
							aria-describedby="new-password-rules"
							class={adminInput}
						/>
						<ul id="new-password-rules" class="mt-2 grid gap-1 text-sm">
							<Rule met={longEnough()}>
								At least {MIN_LENGTH} characters
								<Show when={next() && !longEnough()}>
									<span class="tabular-nums">
										{" "}
										({MIN_LENGTH - next().length} to go)
									</span>
								</Show>
							</Rule>
							<Show when={sameAsCurrent()}>
								<Rule met={false} warn>
									Different from your current password
								</Rule>
							</Show>
						</ul>
					</SettingsRow>
					<SettingsRow label="Confirm new password" for="confirm-password">
						<PasswordInput
							id="confirm-password"
							name="confirmPassword"
							required
							maxLength={128}
							autocomplete="new-password"
							value={again()}
							onInput={(e) => setAgain(e.currentTarget.value)}
							onBlur={() => setAgainTouched(true)}
							aria-invalid={
								(againTouched() && !!again() && !matches()) || undefined
							}
							aria-describedby="confirm-password-status"
							class={adminInput}
						/>
						<p
							id="confirm-password-status"
							aria-live="polite"
							class="mt-2 min-h-5 text-sm"
						>
							<Show when={again()}>
								<Show
									when={matches()}
									fallback={
										<Show when={againTouched()}>
											<span class="text-error-foreground">
												Doesn’t match the new password yet.
											</span>
										</Show>
									}
								>
									<Rule met as="span">
										Passwords match
									</Rule>
								</Show>
							</Show>
						</p>
					</SettingsRow>
				</SettingsSection>
			</form>
		</div>
	);
}

/** One line of the password rules: a tick once it's met. */
function Rule(props: {
	met: boolean;
	warn?: boolean;
	as?: "li" | "span";
	children: unknown;
}) {
	const body = () => (
		<>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="size-4 shrink-0"
			>
				<Show
					when={props.met}
					fallback={
						<Show when={props.warn} fallback={<circle cx="12" cy="12" r="7" />}>
							<path d="M12 8v5M12 16.5v.01" />
						</Show>
					}
				>
					<path d="m5 12.5 4.5 4.5L19 7.5" />
				</Show>
			</svg>
			<span>
				<span class="sr-only">{props.met ? "Done: " : "Not yet: "}</span>
				{props.children as never}
			</span>
		</>
	);
	const classes = () =>
		cn(
			"flex items-center gap-1.5",
			props.met
				? "text-success-foreground"
				: props.warn
					? "text-error-foreground"
					: "text-petal-900/55",
		);
	return (
		<Show
			when={props.as === "span"}
			fallback={<li class={classes()}>{body()}</li>}
		>
			<span class={classes()}>{body()}</span>
		</Show>
	);
}
