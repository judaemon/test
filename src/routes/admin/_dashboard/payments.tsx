import { createFileRoute, redirect } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";

import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	TextArea,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import {
	listPaymentSettings,
	savePaymentAccount,
	uploadQrImage,
} from "~/server/admin/settings";
import type { PaymentAccount } from "~/types/payment";

export const Route = createFileRoute("/admin/_dashboard/payments")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "owner") throw redirect({ to: "/admin" });
	},
	loader: () => listPaymentSettings(),
	component: PaymentsPage,
});

function PaymentsPage() {
	const accounts = Route.useLoaderData();
	return (
		<div class="mx-auto max-w-3xl">
			<PageHeader
				title="Payments"
				description="Choose which payment methods customers see, and keep your QR codes and account details up to date."
			/>
			<div class="flex flex-col gap-5">
				<For each={accounts()}>
					{(account) => <AccountEditor account={account} />}
				</For>
			</div>
		</div>
	);
}

function AccountEditor(props: { account: PaymentAccount }) {
	const [form, setForm] = createStore({
		...props.account,
		stepsText: props.account.steps.join("\n"),
	});
	const [saving, setSaving] = createSignal(false);
	const [uploading, setUploading] = createSignal(false);
	const isCard = () => props.account.method === "card";

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			await savePaymentAccount({
				data: {
					method: form.method,
					enabled: form.enabled,
					label: form.label,
					accountName: form.accountName,
					accountNumber: form.accountNumber,
					bankName: form.bankName,
					qrImage: form.qrImage,
					steps: form.stepsText.split("\n"),
				},
			});
			toastSuccess(`${form.label} saved.`);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const uploadQr = async (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setUploading(true);
		try {
			const body = new FormData();
			body.set("file", file);
			const result = await uploadQrImage({ data: body });
			if (result.ok) setForm("qrImage", result.url);
			else toastError(new Error(result.message));
		} catch (error) {
			toastError(error);
		} finally {
			setUploading(false);
		}
	};

	return (
		<form
			onSubmit={save}
			class={cn(adminCard, "p-5")}
			aria-label={`${props.account.label} settings`}
		>
			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-lg font-semibold">{props.account.label}</h2>
				<Toggle
					label={form.enabled ? "Shown at checkout" : "Hidden at checkout"}
					checked={form.enabled}
					onChange={(checked) => setForm("enabled", checked)}
				/>
			</div>

			<Show
				when={!isCard()}
				fallback={
					<div class="grid gap-4 sm:grid-cols-2">
						<Field label="Name at checkout">
							<input
								value={form.label}
								onInput={(e) => setForm("label", e.currentTarget.value)}
								maxLength={40}
								class={adminInput}
							/>
						</Field>
						<p class="self-end rounded-xl bg-warning px-3 py-2 text-xs text-warning-foreground">
							Test mode: cards aren’t charged until a payment gateway (e.g.
							PayMongo) is connected.
						</p>
					</div>
				}
			>
				<div class="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
					<div class="flex flex-col items-center gap-2">
						<Show
							when={form.qrImage}
							fallback={
								<div class="flex size-40 items-center justify-center rounded-xl border-2 border-dashed border-petal-200 text-center text-xs text-petal-900/50">
									No QR code yet
								</div>
							}
						>
							<img
								src={form.qrImage}
								alt={`${props.account.label} QR code`}
								class="size-40 rounded-xl border border-petal-100 bg-white object-contain p-2"
							/>
						</Show>
						<label
							class={cn(
								adminButton.secondary,
								"h-9 cursor-pointer",
								uploading() && "pointer-events-none opacity-60",
							)}
						>
							{uploading()
								? "Uploading…"
								: form.qrImage
									? "Replace QR"
									: "Upload QR"}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp"
								class="sr-only"
								onChange={(e) => {
									void uploadQr(e.currentTarget.files);
									e.currentTarget.value = "";
								}}
							/>
						</label>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field label="Name at checkout">
							<input
								value={form.label}
								onInput={(e) => setForm("label", e.currentTarget.value)}
								maxLength={40}
								class={adminInput}
							/>
						</Field>
						<Show when={props.account.method === "bank"}>
							<Field label="Bank">
								<input
									value={form.bankName}
									onInput={(e) => setForm("bankName", e.currentTarget.value)}
									maxLength={60}
									class={adminInput}
								/>
							</Field>
						</Show>
						<Field label="Account name">
							<input
								value={form.accountName}
								onInput={(e) => setForm("accountName", e.currentTarget.value)}
								maxLength={80}
								class={adminInput}
							/>
						</Field>
						<Field
							label={
								props.account.method === "bank"
									? "Account number"
									: "Mobile number"
							}
						>
							<input
								value={form.accountNumber}
								onInput={(e) => setForm("accountNumber", e.currentTarget.value)}
								maxLength={40}
								class={cn(adminInput, "tabular-nums")}
							/>
						</Field>
						<Field
							label="How to pay"
							hint="One step per line, shown under the QR code."
							class="sm:col-span-2"
						>
							<TextArea
								value={form.stepsText}
								onInput={(e) => setForm("stepsText", e.currentTarget.value)}
								rows={3}
								class={cn(adminInput, "h-auto py-2")}
							/>
						</Field>
					</div>
				</div>
			</Show>

			<div class="mt-5 flex justify-end">
				<button
					type="submit"
					class={adminButton.primary}
					disabled={saving() || uploading()}
				>
					{saving() ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	);
}
