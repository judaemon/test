import { createFileRoute, redirect, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { formatPrice } from "~/lib/product";
import {
	markupPrice,
	SALE_NAME_MAX,
	SALE_PERCENT_MAX,
	SALE_STATUS_LABELS,
	type Sale,
	type SaleStatus,
	saleLabel,
	salePrice,
	saleStatus,
	shopToday,
} from "~/lib/sale";
import { cn } from "~/lib/utils";
import { deleteSaleFn, getSalesAdmin, saveSaleFn } from "~/server/admin/sales";

export const Route = createFileRoute("/admin/_dashboard/sales")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "owner") throw redirect({ to: "/admin" });
	},
	loader: () => getSalesAdmin(),
	component: SalesPage,
});

type Options = Awaited<ReturnType<typeof getSalesAdmin>>;

const STATUS_STYLE: Record<SaleStatus, string> = {
	live: "bg-success text-success-foreground",
	scheduled: "bg-warning text-warning-foreground",
	ended: "bg-black/5 text-petal-900/60",
	off: "bg-black/5 text-petal-900/60",
};

const day = (value: string) =>
	new Date(`${value}T00:00:00Z`).toLocaleDateString("en-PH", {
		timeZone: "UTC",
		month: "short",
		day: "numeric",
		year: "numeric",
	});

function SalesPage() {
	const data = Route.useLoaderData();
	const router = useRouter();
	/** The sale being edited: its id, "new", or none. */
	const [editing, setEditing] = createSignal<string>();
	// Saving changes what the shop shows; reload it and this page.
	const refresh = async () => {
		setEditing(undefined);
		await router.invalidate();
	};

	return (
		<div class="mx-auto max-w-3xl">
			<PageHeader
				title="Sales"
				description="Put the whole shop or chosen arrangements on sale for a few days. The shop shows the sale price, a banner and a countdown, and checkout charges it. Orders keep the price they were placed at."
				actions={
					<Show when={editing() !== "new"}>
						<button
							type="button"
							class={adminButton.primary}
							onClick={() => setEditing("new")}
						>
							New sale
						</button>
					</Show>
				}
			/>
			<div class="flex flex-col gap-4">
				<Show when={editing() === "new"}>
					<SaleEditor
						options={data()}
						onDone={refresh}
						onCancel={() => setEditing(undefined)}
					/>
				</Show>
				<For
					each={data().sales}
					fallback={
						<Show when={editing() !== "new"}>
							<p
								class={cn(
									adminCard,
									"p-8 text-center text-sm text-petal-900/60",
								)}
							>
								No sales yet. Add one to put bouquets on sale.
							</p>
						</Show>
					}
				>
					{(sale) => (
						<Show
							when={editing() === sale.id}
							fallback={
								<SaleSummary
									sale={sale}
									options={data()}
									onEdit={() => setEditing(sale.id)}
									onChanged={refresh}
								/>
							}
						>
							<SaleEditor
								sale={sale}
								options={data()}
								onDone={refresh}
								onCancel={() => setEditing(undefined)}
							/>
						</Show>
					)}
				</For>
			</div>
		</div>
	);
}

/** "Everything", or what was chosen: "Corsages, Odette and custom bouquets". */
function scopeText(sale: Sale, options: Options) {
	if (sale.scope === "all") return "Everything, custom bouquets included";
	const names = [
		...sale.arrangementTypes.map(
			(id) =>
				`All ${options.arrangementTypes.find((type) => type.id === id)?.name.toLowerCase() ?? id}`,
		),
		...sale.products.map(
			(id) => options.products.find((product) => product.id === id)?.name ?? id,
		),
		...(sale.includeCustom ? ["custom bouquets"] : []),
	];
	return names.join(", ");
}

function SaleSummary(props: {
	sale: Sale;
	options: Options;
	onEdit: () => void;
	onChanged: () => Promise<void>;
}) {
	const status = () => saleStatus(props.sale);
	const [busy, setBusy] = createSignal(false);
	const setEnabled = async (enabled: boolean) => {
		setBusy(true);
		try {
			const { id, ...sale } = props.sale;
			const result = await saveSaleFn({
				data: { id, sale: { ...sale, enabled } },
			});
			if (!result.ok) return toastError(new Error(result.message));
			toastSuccess(enabled ? "Sale switched on." : "Sale switched off.");
			await props.onChanged();
		} catch (error) {
			toastError(error);
		} finally {
			setBusy(false);
		}
	};
	return (
		<section class={cn(adminCard, "p-5")}>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="font-semibold">{props.sale.name}</h2>
						<span
							class={cn(
								"rounded-full px-2.5 py-0.5 text-xs font-medium",
								STATUS_STYLE[status()],
							)}
						>
							{SALE_STATUS_LABELS[status()]}
						</span>
					</div>
					<p class="mt-1 text-2xl font-semibold text-sale">
						{saleLabel(props.sale)}
						<span class="ml-1 text-sm font-normal text-petal-900/60">
							each item
						</span>
					</p>
					<p class="text-sm text-petal-900/70">
						{props.sale.pricing === "markup"
							? `Shows a higher before-price; customers pay the normal price (${formatPrice(1000, "PHP")} shows as ${formatPrice(markupPrice(1000, props.sale), "PHP")}).`
							: `Lowers the price (${formatPrice(1000, "PHP")} becomes ${formatPrice(salePrice(1000, props.sale), "PHP")}).`}
					</p>
					<p class="mt-1 text-sm text-petal-900/70">
						{day(props.sale.startsOn)} – {day(props.sale.endsOn)}
						<span class="text-petal-900/50"> · Manila time, both days</span>
					</p>
					<p class="mt-1 text-sm text-petal-900/70 wrap-anywhere">
						On: {scopeText(props.sale, props.options)}
					</p>
				</div>
				<Toggle
					label={props.sale.enabled ? "On" : "Off"}
					checked={props.sale.enabled}
					disabled={busy()}
					onChange={setEnabled}
				/>
			</div>
			<div class="mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					class={adminButton.secondary}
					onClick={props.onEdit}
				>
					Edit
				</button>
				<ConfirmButton
					class={adminButton.ghost}
					title={`Delete ${props.sale.name}?`}
					description="It comes off the shop straight away. Orders already placed keep their sale price."
					confirmLabel="Delete sale"
					onConfirm={async () => {
						try {
							await deleteSaleFn({ data: { id: props.sale.id } });
							toastSuccess("Sale deleted.");
							await props.onChanged();
						} catch (error) {
							toastError(error);
						}
					}}
				>
					Delete
				</ConfirmButton>
			</div>
		</section>
	);
}

function SaleEditor(props: {
	sale?: Sale;
	options: Options;
	onDone: () => Promise<void>;
	onCancel: () => void;
}) {
	const today = shopToday();
	const [form, setForm] = createStore({
		name: props.sale?.name ?? "",
		kind: props.sale?.kind ?? "percent",
		pricing: props.sale?.pricing ?? "discount",
		value: String(props.sale?.value ?? ""),
		startsOn: props.sale?.startsOn ?? today,
		endsOn: props.sale?.endsOn ?? today,
		enabled: props.sale?.enabled ?? true,
		scope: props.sale?.scope ?? "all",
		arrangementTypes: [...(props.sale?.arrangementTypes ?? [])],
		products: [...(props.sale?.products ?? [])],
		includeCustom: props.sale?.includeCustom ?? false,
	});
	const [error, setError] = createSignal<string>();
	const [saving, setSaving] = createSignal(false);

	/** How a ₱1,000 item would show with the discount as typed. */
	const example = () => {
		const value = Number(form.value);
		const sale = {
			kind: form.kind,
			value: Number.isInteger(value) && value > 0 ? value : 5,
		};
		const peso = (amount: number) => formatPrice(amount, "PHP");
		return {
			discount: `${peso(1000)} becomes ${peso(salePrice(1000, sale))}.`,
			markup: `${peso(1000)} shows as ${peso(markupPrice(1000, sale))} → ${peso(1000)}.`,
		};
	};

	const toggle = (key: "arrangementTypes" | "products", id: string) =>
		setForm(key, (ids) =>
			ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
		);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		setError(undefined);
		setSaving(true);
		try {
			const result = await saveSaleFn({
				data: {
					id: props.sale?.id ?? "",
					sale: { ...form, value: Number(form.value) },
				},
			});
			if (!result.ok) return setError(result.message);
			toastSuccess(props.sale ? "Sale saved." : "Sale added.");
			await props.onDone();
		} catch (failure) {
			setError(
				failure instanceof Error ? failure.message : "Couldn’t save the sale.",
			);
		} finally {
			setSaving(false);
		}
	};

	const option =
		"flex cursor-pointer items-center gap-2 rounded-xl border border-petal-200 px-3 py-2 text-sm has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50";

	return (
		<form
			onSubmit={submit}
			noValidate
			class={cn(adminCard, "flex flex-col gap-5 p-5")}
		>
			<h2 class="font-semibold">{props.sale ? "Edit sale" : "New sale"}</h2>
			<Field label="Name" hint="Shoppers see it on the banner and at checkout.">
				<input
					value={form.name}
					onInput={(e) => setForm("name", e.currentTarget.value)}
					maxLength={SALE_NAME_MAX}
					placeholder="November Sale"
					class={adminInput}
				/>
			</Field>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-1.5 text-sm font-medium">Discount</legend>
				<div class="flex flex-wrap items-center gap-2">
					<label class={option}>
						<input
							type="radio"
							name="sale-kind"
							checked={form.kind === "percent"}
							onChange={() => setForm("kind", "percent")}
							class="accent-petal-700"
						/>
						Percent off
					</label>
					<label class={option}>
						<input
							type="radio"
							name="sale-kind"
							checked={form.kind === "amount"}
							onChange={() => setForm("kind", "amount")}
							class="accent-petal-700"
						/>
						Pesos off
					</label>
					<div class="flex items-center gap-2">
						<Show when={form.kind === "amount"}>
							<span class="text-sm">₱</span>
						</Show>
						<input
							type="number"
							inputMode="numeric"
							min="1"
							max={form.kind === "percent" ? SALE_PERCENT_MAX : 100_000}
							step="1"
							value={form.value}
							onInput={(e) => setForm("value", e.currentTarget.value)}
							aria-label={
								form.kind === "percent" ? "Percent off" : "Pesos off each item"
							}
							class={cn(adminInput, "w-28")}
						/>
						<span class="text-sm text-petal-900/60">
							{form.kind === "percent" ? "% off each item" : "off each item"}
						</span>
					</div>
				</div>
				<span class="text-xs text-petal-900/55">
					Sale prices are rounded down to whole pesos. If two sales cover the
					same item, the bigger discount wins; they don’t add up.
				</span>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-1.5 text-sm font-medium">How the sale shows</legend>
				<div class="grid gap-2 sm:grid-cols-2">
					<label class={cn(option, "items-start")}>
						<input
							type="radio"
							name="sale-pricing"
							checked={form.pricing === "discount"}
							onChange={() => setForm("pricing", "discount")}
							class="mt-0.5 accent-petal-700"
						/>
						<span>
							<span class="block font-medium">Lower the price</span>
							<span class="block text-xs text-petal-900/60">
								Customers pay less. Example: {example().discount}
							</span>
						</span>
					</label>
					<label class={cn(option, "items-start")}>
						<input
							type="radio"
							name="sale-pricing"
							checked={form.pricing === "markup"}
							onChange={() => setForm("pricing", "markup")}
							class="mt-0.5 accent-petal-700"
						/>
						<span>
							<span class="block font-medium">Show a higher before-price</span>
							<span class="block text-xs text-petal-900/60">
								Customers pay the normal price. Example: {example().markup}
							</span>
						</span>
					</label>
				</div>
			</fieldset>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="First day">
					<input
						type="date"
						value={form.startsOn}
						onInput={(e) => setForm("startsOn", e.currentTarget.value)}
						class={adminInput}
					/>
				</Field>
				<Field
					label="Last day"
					hint="The sale runs to the end of this day, Manila time."
				>
					<input
						type="date"
						value={form.endsOn}
						min={form.startsOn}
						onInput={(e) => setForm("endsOn", e.currentTarget.value)}
						class={adminInput}
					/>
				</Field>
			</div>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-1.5 text-sm font-medium">On</legend>
				<div class="flex flex-wrap gap-2">
					<label class={option}>
						<input
							type="radio"
							name="sale-scope"
							checked={form.scope === "all"}
							onChange={() => setForm("scope", "all")}
							class="accent-petal-700"
						/>
						Everything in the shop
					</label>
					<label class={option}>
						<input
							type="radio"
							name="sale-scope"
							checked={form.scope === "selected"}
							onChange={() => setForm("scope", "selected")}
							class="accent-petal-700"
						/>
						Chosen items
					</label>
				</div>
				<Show when={form.scope === "selected"}>
					<div class="mt-2 flex flex-col gap-4 rounded-xl bg-petal-50/60 p-4">
						<div>
							<p class="mb-2 text-sm font-medium">Whole types</p>
							<div class="flex flex-wrap gap-2">
								<For each={props.options.arrangementTypes}>
									{(type) => (
										<label class={option}>
											<input
												type="checkbox"
												checked={form.arrangementTypes.includes(type.id)}
												onChange={() => toggle("arrangementTypes", type.id)}
												class="accent-petal-700"
											/>
											All {type.name.toLowerCase()}
										</label>
									)}
								</For>
								<label class={option}>
									<input
										type="checkbox"
										checked={form.includeCustom}
										onChange={(e) =>
											setForm("includeCustom", e.currentTarget.checked)
										}
										class="accent-petal-700"
									/>
									Custom bouquets
								</label>
							</div>
						</div>
						<div>
							<p class="mb-2 text-sm font-medium">Single arrangements</p>
							<div class="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
								<For each={props.options.products}>
									{(product) => (
										<label class={option}>
											<input
												type="checkbox"
												checked={form.products.includes(product.id)}
												onChange={() => toggle("products", product.id)}
												class="accent-petal-700"
											/>
											{product.name}
											<Show when={product.hidden}>
												<span class="text-xs text-petal-900/50">(hidden)</span>
											</Show>
										</label>
									)}
								</For>
							</div>
						</div>
					</div>
				</Show>
			</fieldset>

			<Toggle
				label="On: shoppers get it on its days"
				checked={form.enabled}
				onChange={(checked) => setForm("enabled", checked)}
			/>

			<Show when={error()}>
				<p role="alert" class="text-sm text-destructive">
					{error()}
				</p>
			</Show>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					class={adminButton.secondary}
					disabled={saving()}
					onClick={props.onCancel}
				>
					Cancel
				</button>
				<button type="submit" class={adminButton.primary} disabled={saving()}>
					{saving() ? "Saving…" : props.sale ? "Save sale" : "Add sale"}
				</button>
			</div>
		</form>
	);
}
