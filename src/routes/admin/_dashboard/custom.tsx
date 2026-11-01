import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { type CustomBouquetSettings, PESO_BILLS } from "~/lib/custom-bouquet";
import { cn } from "~/lib/utils";
import {
	getCustomSettingsAdmin,
	saveCustomSettingsFn,
} from "~/server/admin/custom";

export const Route = createFileRoute("/admin/_dashboard/custom")({
	loader: () => getCustomSettingsAdmin(),
	component: CustomBouquetSettingsPage,
});

interface Draft {
	enabled: boolean;
	baseFee: string;
	money: {
		enabled: boolean;
		feePerBill: string;
		denominations: number[];
		maxBills: string;
	};
}

function toDraft(settings: CustomBouquetSettings): Draft {
	return {
		enabled: settings.enabled,
		baseFee: String(settings.baseFee),
		money: {
			enabled: settings.money.enabled,
			feePerBill: String(settings.money.feePerBill),
			denominations: [...settings.money.denominations],
			maxBills: String(settings.money.maxBills),
		},
	};
}

function CustomBouquetSettingsPage() {
	const loaded = Route.useLoaderData();
	const router = useRouter();
	const [draft, setDraft] = createStore<Draft>(toDraft(loaded()));
	const [saving, setSaving] = createSignal(false);
	const [sample, setSample] = createSignal(!loaded().saved);

	const offeredFlowers = () => loaded().flowers.filter((f) => f.enabled).length;
	const offeredWrappers = () =>
		loaded().wrappers.filter((w) => w.enabled).length;

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveCustomSettingsFn({
				data: {
					enabled: draft.enabled,
					baseFee: Number(draft.baseFee),
					money: {
						enabled: draft.money.enabled,
						feePerBill: Number(draft.money.feePerBill),
						denominations: draft.money.denominations,
						maxBills: Number(draft.money.maxBills),
					},
				},
			});
			setDraft(toDraft(saved));
			setSample(false);
			toastSuccess("Builder settings saved.");
			// The shop reads these on every page, so refresh its copy too.
			void router.invalidate();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-4xl pb-24">
			<PageHeader
				title="Custom bouquets"
				description="How the bouquet builder works: the base fee and money bouquets. Flowers and wrappers have their own pages."
			/>

			<Show when={sample()}>
				<p class="mb-4 rounded-2xl border border-warning-foreground/30 bg-warning px-4 py-3 text-sm text-warning-foreground">
					<strong class="font-semibold">These are sample prices.</strong> Set
					your real fees, then save. Until then the builder sells at these
					amounts.
				</p>
			</Show>

			<section class={cn(adminCard, "mb-6 grid gap-4 p-5 sm:grid-cols-2")}>
				<div class="flex flex-col justify-center gap-1">
					<Toggle
						label="Show the builder in the shop"
						checked={draft.enabled}
						onChange={(checked) => setDraft("enabled", checked)}
					/>
					<span class="text-xs text-petal-900/55">
						When off, shoppers are asked to message you instead.
					</span>
				</div>
				<Field
					label="Base fee (₱)"
					hint="Arranging and tying, added once to every custom bouquet."
				>
					<input
						type="number"
						min="0"
						step="1"
						inputMode="decimal"
						value={draft.baseFee}
						onInput={(e) => setDraft("baseFee", e.currentTarget.value)}
						class={adminInput}
					/>
				</Field>
			</section>

			<For
				each={
					[
						{
							title: "Flowers",
							text: () =>
								`${offeredFlowers()} of ${loaded().flowers.length} flowers offered. Their colors, prices and stock are set in Flowers.`,
							to: "/admin/flowers",
							action: "Edit flowers",
						},
						{
							title: "Wrappers",
							text: () =>
								`${offeredWrappers()} of ${loaded().wrappers.length} wrappers offered. Their prices and stock are set in Wrappers.`,
							to: "/admin/wrappers",
							action: "Edit wrappers",
						},
					] as const
				}
			>
				{(card) => (
					<section
						class={cn(
							adminCard,
							"mb-6 flex flex-wrap items-center justify-between gap-3 p-5",
						)}
					>
						<div>
							<h2 class="font-semibold">{card.title}</h2>
							<p class="text-sm text-petal-900/60">{card.text()}</p>
						</div>
						<Link to={card.to} class={adminButton.secondary}>
							{card.action}
						</Link>
					</section>
				)}
			</For>

			<section class={cn(adminCard, "mb-6 p-5")}>
				<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="font-semibold">Money bouquets</h2>
						<p class="text-sm text-petal-900/60">
							Shoppers add bills to their bouquet. They pay each bill’s value
							plus the fee per bill.
						</p>
					</div>
					<Toggle
						label="Offer money bouquets"
						checked={draft.money.enabled}
						onChange={(checked) => setDraft("money", "enabled", checked)}
					/>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field
						label="Fee per bill (₱)"
						hint="Folding and handling each bill."
					>
						<input
							type="number"
							min="0"
							step="1"
							inputMode="decimal"
							value={draft.money.feePerBill}
							onInput={(e) =>
								setDraft("money", "feePerBill", e.currentTarget.value)
							}
							class={adminInput}
						/>
					</Field>
					<Field label="Most bills per bouquet">
						<input
							type="number"
							min="1"
							max="500"
							step="1"
							inputMode="numeric"
							value={draft.money.maxBills}
							onInput={(e) =>
								setDraft("money", "maxBills", e.currentTarget.value)
							}
							class={adminInput}
						/>
					</Field>
				</div>
				<fieldset class="mt-4">
					<legend class="mb-2 text-sm font-medium">Bills you can add</legend>
					<div class="flex flex-wrap gap-2">
						<For each={PESO_BILLS}>
							{(bill) => (
								<label class="flex cursor-pointer items-center gap-2 rounded-full border border-petal-200 px-3 py-1.5 text-sm tabular-nums has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50">
									<input
										type="checkbox"
										checked={draft.money.denominations.includes(bill)}
										onChange={(e) =>
											setDraft("money", "denominations", (list) =>
												e.currentTarget.checked
													? [...list, bill].sort((a, b) => a - b)
													: list.filter((value) => value !== bill),
											)
										}
										class="accent-petal-700"
									/>
									₱{bill.toLocaleString("en-PH")}
								</label>
							)}
						</For>
					</div>
				</fieldset>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-4xl items-center justify-end gap-2">
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
