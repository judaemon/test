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
import { cn } from "~/lib/utils";
import { createStaff, listStaff, removeStaff } from "~/server/admin/settings";

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
				<Field label="Temporary password" hint="At least 10 characters.">
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
		</div>
	);
}
