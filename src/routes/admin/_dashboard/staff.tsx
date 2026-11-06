import { createFileRoute, redirect, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

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
import { cn } from "~/lib/utils";
import {
	createStaff,
	listStaff,
	removeStaff,
	resetStaffPassword,
	type StaffMember,
} from "~/server/admin/settings";

export const Route = createFileRoute("/admin/_dashboard/staff")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "owner") throw redirect({ to: "/admin" });
	},
	loader: () => listStaff(),
	component: StaffPage,
});

function StaffPage() {
	const staff = Route.useLoaderData();
	const context = Route.useRouteContext();
	const router = useRouter();
	const [saving, setSaving] = createSignal(false);

	const add = async (event: SubmitEvent) => {
		event.preventDefault();
		const formElement = event.currentTarget as HTMLFormElement;
		const form = new FormData(formElement);
		setSaving(true);
		try {
			await createStaff({
				data: {
					name: String(form.get("name") ?? ""),
					email: String(form.get("email") ?? ""),
					password: String(form.get("password") ?? ""),
					role: String(form.get("role") ?? "staff"),
				},
			});
			formElement.reset();
			toastSuccess("Account created. Share the password with them privately.");
			await router.invalidate();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const remove = async (userId: string) => {
		try {
			await removeStaff({ data: { userId } });
			toastSuccess("Account removed.");
			await router.invalidate();
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<div class="mx-auto max-w-3xl">
			<PageHeader
				title="Staff"
				description="Everyone who can sign in to the admin. Staff can run the board, orders and stock; owners can also change payments and staff."
			/>

			<ul class={cn(adminCard, "mb-8 divide-y divide-petal-50")}>
				<For each={staff()}>
					{(member) => (
						<li class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
							<div>
								<p class="font-medium">
									{member.name}
									<Show when={member.id === context().user.id}>
										<span class="ml-2 text-xs font-normal text-petal-900/50">
											(you)
										</span>
									</Show>
								</p>
								<p class="text-sm text-petal-900/60">{member.email}</p>
							</div>
							<div class="flex items-center gap-3">
								<span
									class={cn(
										"rounded-full px-2.5 py-0.5 text-xs font-medium",
										member.role === "owner"
											? "bg-petal-100 text-petal-700"
											: "bg-sage-100 text-sage-600",
									)}
								>
									{member.role === "owner" ? "Owner" : "Staff"}
								</span>
								<Show when={member.id !== context().user.id}>
									<ResetPasswordButton member={member} />
									<ConfirmButton
										class={cn(adminButton.ghost, "text-error-foreground")}
										title={`Remove ${member.name}?`}
										description="They’ll be signed out and won’t be able to sign in again."
										confirmLabel="Remove"
										onConfirm={() => remove(member.id)}
									>
										Remove
									</ConfirmButton>
								</Show>
							</div>
						</li>
					)}
				</For>
			</ul>

			<form
				onSubmit={add}
				class={cn(adminCard, "grid gap-4 p-5 sm:grid-cols-2")}
			>
				<h2 class="text-lg font-semibold sm:col-span-2">Add a person</h2>
				<Field label="Name">
					<input name="name" required maxLength={80} class={adminInput} />
				</Field>
				<Field label="Email">
					<input name="email" type="email" required class={adminInput} />
				</Field>
				<Field
					label="Temporary password"
					hint="At least 10 characters. They can change it under My password."
				>
					<input
						name="password"
						type="text"
						required
						minLength={10}
						autocomplete="off"
						class={adminInput}
					/>
				</Field>
				<Field label="Role">
					<select name="role" class={adminInput}>
						<option value="staff">Staff — board, orders, stock</option>
						<option value="owner">Owner — everything</option>
					</select>
				</Field>
				<div class="flex justify-end sm:col-span-2">
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Adding…" : "Add person"}
					</button>
				</div>
			</form>

			{/* For the developer: a copy of the live shop to test with locally. */}
			<section class={cn(adminCard, "mt-8 flex flex-col gap-3 p-5")}>
				<div>
					<h2 class="font-semibold">Copy the shop to your computer</h2>
					<p class="mt-1 text-sm text-petal-900/65">
						Everything in one zip — bouquets, flowers, wrappers, orders,
						accounts, settings and every photo — to test with locally. Login
						sessions are left out. Load it with{" "}
						<code class="rounded bg-petal-50 px-1 font-mono text-xs">
							bun run data:import &lt;file.zip&gt;
						</code>
						.
					</p>
					<p class="mt-2 text-sm text-petal-900/65">
						It holds real customers’ names, emails and payment proofs: keep it
						private and delete it when you’re done.
					</p>
				</div>
				<div>
					<a
						href="/api/admin/data-export"
						download=""
						class={adminButton.secondary}
					>
						Download all data
					</a>
				</div>
			</section>

			{/* Only on your own computer: the live shop never offers this. */}
			<Show when={import.meta.env.DEV}>
				<ImportData />
			</Show>
		</div>
	);
}

/** For someone who forgot their password: the owner sets a temporary one. */
function ResetPasswordButton(props: { member: StaffMember }) {
	const [open, setOpen] = createSignal(false);
	const [saving, setSaving] = createSignal(false);

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		setSaving(true);
		try {
			await resetStaffPassword({
				data: {
					userId: props.member.id,
					newPassword: String(form.get("newPassword") ?? ""),
				},
			});
			setOpen(false);
			toastSuccess(
				`Password reset. Share it with ${props.member.name} privately.`,
			);
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
				class={adminButton.ghost}
				onClick={() => setOpen(true)}
			>
				Reset password
			</button>
			<AlertDialog open={open()} onOpenChange={setOpen}>
				<AlertDialogContent class="max-w-sm rounded-2xl bg-white text-petal-900">
					<AlertDialogTitle class="font-display type-soft text-xl">
						Reset {props.member.name}’s password?
					</AlertDialogTitle>
					<AlertDialogDescription class="text-sm text-petal-900/70">
						Their old password stops working and they’re signed out everywhere.
					</AlertDialogDescription>
					<form onSubmit={save} class="grid gap-4">
						<Field
							label="Temporary password"
							hint="At least 10 characters. They can change it under My password."
						>
							<input
								name="newPassword"
								type="text"
								required
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
								type="submit"
								class={adminButton.primary}
								disabled={saving()}
							>
								{saving() ? "Saving…" : "Reset password"}
							</button>
						</div>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

interface ImportResponse {
	ok: boolean;
	message?: string;
	summary?: {
		exportedAt: string;
		rows: Record<string, number>;
		uploads: number;
		backup?: string;
	};
}

/** Loads a Download all data zip in place of this computer's shop. */
function ImportData() {
	const [file, setFile] = createSignal<File | null>(null);
	let input!: HTMLInputElement;

	const runImport = async () => {
		const zip = file();
		if (!zip) return;
		try {
			const response = await fetch("/api/admin/data-import", {
				method: "POST",
				headers: { "Content-Type": "application/zip" },
				body: zip,
			});
			const result = (await response
				.json()
				.catch(() => ({ ok: false }))) as ImportResponse;
			if (!result.ok || !result.summary)
				throw new Error(result.message ?? "Couldn’t import that file.");
			const rows = result.summary.rows;
			toastSuccess(
				`Imported ${rows.orders ?? 0} orders, ${rows.signature_bouquets ?? 0} bouquets and ${result.summary.uploads} photos. Sign in with your live-site password.`,
			);
			// Login sessions aren't in the export, so this one is gone too.
			window.location.assign("/admin");
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<section class={cn(adminCard, "mt-5 flex flex-col gap-3 p-5")}>
			<div>
				<h2 class="font-semibold">Import data</h2>
				<p class="mt-1 text-sm text-petal-900/65">
					Load a zip from Download all data in place of this computer’s shop.
					What’s here now is moved to{" "}
					<code class="rounded bg-petal-50 px-1 font-mono text-xs">
						.data-backups/
					</code>
					, never deleted. You’ll be signed out: sign in again with your
					live-site password. Only shown on your own computer.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<input
					ref={input}
					type="file"
					accept=".zip,application/zip"
					class="sr-only"
					onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
				/>
				<button
					type="button"
					class={adminButton.secondary}
					onClick={() => input.click()}
				>
					Choose zip…
				</button>
				<span class="min-w-0 text-sm text-petal-900/65 wrap-anywhere">
					{file()?.name ?? "No file chosen"}
				</span>
				<ConfirmButton
					title="Replace this shop’s data?"
					description={`Everything here is replaced with ${file()?.name ?? "the zip"}. Your current data is kept in .data-backups/.`}
					confirmLabel="Import"
					onConfirm={runImport}
					disabled={!file()}
					class={adminButton.primary}
				>
					Import data
				</ConfirmButton>
			</div>
		</section>
	);
}
