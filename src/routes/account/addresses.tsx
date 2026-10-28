import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import {
	adminButton,
	adminInput,
	ConfirmButton,
	Field,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import {
	deleteMyAddress,
	listMyAddresses,
	saveMyAddress,
} from "~/server/account";
import {
	MAX_ADDRESSES,
	type SavedAddress,
	type SavedAddressInput,
} from "~/types/account";

export const Route = createFileRoute("/account/addresses")({
	loader: () => listMyAddresses(),
	head: () => ({ meta: [{ title: "Addresses · ORAIA" }] }),
	component: AddressesPage,
});

function AddressesPage() {
	const loaded = Route.useLoaderData();
	const [addresses, setAddresses] = createSignal<SavedAddress[]>(loaded());
	const [editing, setEditing] = createSignal<string | null>(null);

	const save = async (id: string | null, input: SavedAddressInput) => {
		try {
			setAddresses(await saveMyAddress({ data: { id, ...input } }));
			toastSuccess(id ? "Address updated." : "Address saved.");
			setEditing(null);
			return true;
		} catch (error) {
			toastError(error);
			return false;
		}
	};

	const remove = async (id: string) => {
		try {
			setAddresses(await deleteMyAddress({ data: { id } }));
			toastSuccess("Address removed.");
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
			<section aria-labelledby="addresses-heading">
				<h2 id="addresses-heading" class="text-lg font-semibold">
					Saved addresses
				</h2>
				<p class="mt-1 text-sm text-petal-900/65">
					Pick one at checkout instead of typing it again.
				</p>
				<Show
					when={addresses().length > 0}
					fallback={
						<p class="mt-5 rounded-3xl border border-dashed border-petal-200 px-5 py-8 text-center text-sm text-petal-900/60">
							No saved addresses yet.
						</p>
					}
				>
					<ul class="mt-5 flex flex-col gap-3">
						<For each={addresses()}>
							{(address) => (
								<li class="rounded-3xl border border-petal-100 bg-white p-4">
									<Show
										when={editing() !== address.id}
										fallback={
											<AddressForm
												initial={address}
												submitLabel="Save changes"
												onSubmit={(input) => save(address.id, input)}
												onCancel={() => setEditing(null)}
											/>
										}
									>
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="text-sm">
												<p class="flex items-center gap-2 font-medium">
													{address.label}
													<Show when={address.isDefault}>
														<span class="rounded-full bg-petal-100 px-2 py-0.5 text-xs font-medium text-petal-700">
															Default
														</span>
													</Show>
												</p>
												<p class="mt-1 text-petal-900/70">
													{address.recipientName}
													<br />
													{address.address}
													<br />
													{address.city} {address.postalCode}
												</p>
											</div>
											<div class="flex flex-wrap items-center gap-1">
												<Show when={!address.isDefault}>
													<button
														type="button"
														class={adminButton.ghost}
														onClick={() =>
															save(address.id, { ...address, isDefault: true })
														}
													>
														Make default
													</button>
												</Show>
												<button
													type="button"
													class={adminButton.ghost}
													onClick={() => setEditing(address.id)}
													aria-label={`Edit ${address.label}`}
												>
													Edit
												</button>
												<ConfirmButton
													class={cn(adminButton.ghost, "text-error-foreground")}
													aria-label={`Delete ${address.label}`}
													title={`Delete “${address.label}”?`}
													description="It’ll be removed from your saved addresses."
													confirmLabel="Delete"
													onConfirm={() => remove(address.id)}
												>
													Delete
												</ConfirmButton>
											</div>
										</div>
									</Show>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>

			<aside class="h-fit rounded-3xl border border-petal-100 bg-white p-5">
				<h2 class="font-semibold">Add an address</h2>
				<Show
					when={addresses().length < MAX_ADDRESSES}
					fallback={
						<p class="mt-2 text-sm text-petal-900/65">
							You’ve saved the maximum of {MAX_ADDRESSES} addresses.
						</p>
					}
				>
					<AddressForm
						submitLabel="Save address"
						resetOnSave
						onSubmit={(input) => save(null, input)}
					/>
				</Show>
			</aside>
		</div>
	);
}

function AddressForm(props: {
	initial?: SavedAddressInput;
	submitLabel: string;
	resetOnSave?: boolean;
	onSubmit: (input: SavedAddressInput) => Promise<boolean>;
	onCancel?: () => void;
}) {
	const [busy, setBusy] = createSignal(false);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		const formElement = event.currentTarget as HTMLFormElement;
		const form = new FormData(formElement);
		const text = (key: string) => String(form.get(key) ?? "").trim();
		setBusy(true);
		const ok = await props.onSubmit({
			label: text("label"),
			recipientName: text("recipientName"),
			address: text("address"),
			city: text("city"),
			postalCode: text("postalCode"),
			isDefault: form.get("isDefault") === "on",
		});
		setBusy(false);
		if (ok && props.resetOnSave) formElement.reset();
	};

	return (
		<form method="post" onSubmit={submit} class="mt-3 grid gap-3">
			<Field label="Label">
				<input
					name="label"
					required
					maxLength={30}
					value={props.initial?.label ?? ""}
					placeholder="Home, Office, Mom’s place…"
					class={adminInput}
				/>
			</Field>
			<Field label="Recipient’s name">
				<input
					name="recipientName"
					required
					maxLength={80}
					autocomplete="shipping name"
					value={props.initial?.recipientName ?? ""}
					class={adminInput}
				/>
			</Field>
			<Field label="Street address">
				<input
					name="address"
					required
					maxLength={160}
					autocomplete="shipping street-address"
					value={props.initial?.address ?? ""}
					class={adminInput}
				/>
			</Field>
			<div class="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
				<Field label="City">
					<input
						name="city"
						required
						maxLength={80}
						autocomplete="shipping address-level2"
						value={props.initial?.city ?? ""}
						class={adminInput}
					/>
				</Field>
				<Field label="Postal code">
					<input
						name="postalCode"
						required
						maxLength={10}
						autocomplete="shipping postal-code"
						value={props.initial?.postalCode ?? ""}
						class={adminInput}
					/>
				</Field>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					name="isDefault"
					checked={props.initial?.isDefault ?? false}
					class="size-4 accent-petal-700"
				/>
				Use as my default address
			</label>
			<div class="flex justify-end gap-2">
				<Show when={props.onCancel}>
					<button
						type="button"
						class={adminButton.secondary}
						onClick={() => props.onCancel?.()}
					>
						Cancel
					</button>
				</Show>
				<button type="submit" class={adminButton.primary} disabled={busy()}>
					{busy() ? "Saving…" : props.submitLabel}
				</button>
			</div>
		</form>
	);
}
