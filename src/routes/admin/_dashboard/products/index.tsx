import { createFileRoute, Link } from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import {
	adminButton,
	adminCard,
	PageHeader,
	Toggle,
	toastError,
} from "~/components/admin/ui";
import { formatPrice, LOW_STOCK_THRESHOLD } from "~/lib/product";
import { cn } from "~/lib/utils";
import { listInventory, updateStock } from "~/server/admin/catalog";
import type { AdminProduct, AdminVariant } from "~/types/product";

export const Route = createFileRoute("/admin/_dashboard/products/")({
	loader: () => listInventory(),
	component: InventoryPage,
});

function InventoryPage() {
	const loaded = Route.useLoaderData();
	// A keyed store keeps each row's DOM (and keyboard focus) across saves.
	const [products, setProducts] = createStore<AdminProduct[]>(loaded());
	createEffect(
		on(loaded, (fresh) => setProducts(reconcile(fresh, { key: "id" })), {
			defer: true,
		}),
	);

	const replaceProduct = (next: AdminProduct) =>
		setProducts((p) => p.id === next.id, reconcile(next, { key: "id" }));

	return (
		<div>
			<PageHeader
				title="Products & stock"
				description="Stock changes save as you go and show in the shop right away."
				actions={
					<Link
						to="/admin/products/$productId"
						params={{ productId: "new" }}
						class={adminButton.primary}
					>
						+ New product
					</Link>
				}
			/>
			<div class="flex flex-col gap-6">
				<For
					each={products}
					fallback={<p class="text-petal-900/60">No products yet.</p>}
				>
					{(product) => (
						<section
							class={adminCard}
							aria-labelledby={`product-${product.id}`}
						>
							<header class="flex flex-wrap items-center justify-between gap-3 border-b border-petal-100 px-5 py-4">
								<div>
									<h2
										id={`product-${product.id}`}
										class="flex flex-wrap items-center gap-2 font-semibold"
									>
										{product.title}
										<Show when={!product.isVisible}>
											<span class="rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
												Hidden from shop
											</span>
										</Show>
									</h2>
									<p class="text-xs text-petal-900/55">
										From {formatPrice(product.basePrice, product.currency)}
									</p>
								</div>
								<div class="flex gap-2">
									<Show when={product.isVisible}>
										<a
											href={`/products/${product.id}`}
											target="_blank"
											rel="noreferrer"
											class={adminButton.ghost}
										>
											View in shop
										</a>
									</Show>
									<Link
										to="/admin/products/$productId"
										params={{ productId: product.id }}
										class={adminButton.secondary}
									>
										Edit details
									</Link>
								</div>
							</header>
							<div class="overflow-x-auto">
								<table class="w-full min-w-[640px] text-left text-sm">
									<thead class="text-xs uppercase tracking-wide text-petal-900/55">
										<tr>
											<th class="px-5 py-2.5 font-medium">Color</th>
											<th class="px-3 py-2.5 font-medium">Price</th>
											<th class="px-3 py-2.5 font-medium">In stock</th>
											<th class="px-3 py-2.5 font-medium">Selling</th>
											<th class="px-5 py-2.5 font-medium">Status</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-petal-50">
										<For each={product.variants}>
											{(variant) => (
												<VariantRow
													product={product}
													variant={variant}
													onSaved={replaceProduct}
												/>
											)}
										</For>
									</tbody>
								</table>
							</div>
						</section>
					)}
				</For>
			</div>
		</div>
	);
}

function VariantRow(props: {
	product: AdminProduct;
	variant: AdminVariant;
	onSaved: (product: AdminProduct) => void;
}) {
	const [stock, setStock] = createSignal(String(props.variant.stockQuantity));
	const [saving, setSaving] = createSignal(false);
	const [saved, setSaved] = createSignal(false);
	createEffect(
		on(
			() => props.variant.stockQuantity,
			(value) => setStock(String(value)),
		),
	);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	let addButton: HTMLButtonElement | undefined;
	onCleanup(() => clearTimeout(savedTimer));

	const label = () => `${props.variant.colorName}`;

	// Controls stay enabled while saving: disabling them would drop keyboard
	// focus. Extra clicks during a save are ignored instead.
	const save = async (patch: {
		stockQuantity?: number;
		isAvailable?: boolean;
	}) => {
		if (saving()) return;
		setSaving(true);
		try {
			const product = await updateStock({
				data: {
					productId: props.product.id,
					variantId: props.variant.id,
					...patch,
				},
			});
			if (product) props.onSaved(product);
			setSaved(true);
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => setSaved(false), 1500);
		} catch (error) {
			setStock(String(props.variant.stockQuantity));
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const commitStock = (value: string) => {
		const next = Number(value);
		if (!Number.isInteger(next) || next < 0) {
			setStock(String(props.variant.stockQuantity));
			toastError(new Error("Stock must be a whole number, 0 or more."));
			return;
		}
		if (next !== props.variant.stockQuantity)
			void save({ stockQuantity: next });
	};

	const status = () => {
		const v = props.variant;
		if (!v.isAvailable)
			return { label: "Paused", class: "bg-petal-50 text-petal-900/60" };
		if (v.stockQuantity === 0)
			return { label: "Sold out", class: "bg-error text-error-foreground" };
		if (v.stockQuantity <= LOW_STOCK_THRESHOLD)
			return {
				label: "Low stock",
				class: "bg-warning text-warning-foreground",
			};
		return { label: "In stock", class: "bg-success text-success-foreground" };
	};

	const stepButton =
		"flex size-8 items-center justify-center rounded-full text-petal-900/70 hover:bg-petal-100 disabled:opacity-35";

	return (
		<tr data-variant={props.variant.id}>
			<td class="px-5 py-3">
				<div class="flex items-center gap-3">
					<img
						src={props.variant.images[0]}
						alt=""
						class="size-10 rounded-lg bg-petal-50 object-cover"
					/>
					<div>
						<p class="flex items-center gap-1.5 font-medium">
							<span
								aria-hidden="true"
								class="size-3 rounded-full border border-black/10"
								style={{ "background-color": props.variant.colorHex }}
							/>
							{props.variant.colorName}
						</p>
						<p class="font-mono text-xs text-petal-900/50">
							{props.variant.sku}
						</p>
					</div>
				</div>
			</td>
			<td class="px-3 py-3 tabular-nums">
				{formatPrice(
					props.variant.price ?? props.product.basePrice,
					props.product.currency,
				)}
			</td>
			<td class="px-3 py-3">
				<div class="flex items-center gap-1">
					<button
						type="button"
						class={stepButton}
						disabled={props.variant.stockQuantity === 0}
						aria-label={`Remove one ${label()} from stock`}
						onClick={() => {
							const next = props.variant.stockQuantity - 1;
							// "−" disables itself at zero; keep focus on the row.
							if (next === 0) addButton?.focus();
							void save({ stockQuantity: next });
						}}
					>
						−
					</button>
					<input
						type="number"
						inputMode="numeric"
						min="0"
						step="1"
						value={stock()}
						aria-label={`${label()} stock`}
						aria-busy={saving()}
						onInput={(e) => setStock(e.currentTarget.value)}
						onChange={(e) => commitStock(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
						class="h-9 w-20 rounded-lg border border-petal-200 bg-white px-2 text-center tabular-nums outline-none focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30"
					/>
					<button
						type="button"
						ref={addButton}
						class={stepButton}
						aria-busy={saving()}
						aria-label={`Add one ${label()} to stock`}
						onClick={() =>
							save({ stockQuantity: props.variant.stockQuantity + 1 })
						}
					>
						+
					</button>
					<span class="w-14 text-xs text-sage-600" aria-live="polite">
						{saved() ? "Saved ✓" : ""}
					</span>
				</div>
			</td>
			<td class="px-3 py-3">
				<Toggle
					label={`Sell ${label()}`}
					hideLabel
					checked={props.variant.isAvailable}
					onChange={(checked) => save({ isAvailable: checked })}
				/>
			</td>
			<td class="px-5 py-3">
				<span
					class={cn(
						"rounded-full px-2.5 py-0.5 text-xs font-medium",
						status().class,
					)}
				>
					{status().label}
				</span>
			</td>
		</tr>
	);
}
