import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { formatRecipeItem, mainFlower } from "~/lib/flowers";
import {
	formatPrice,
	LOW_STOCK_THRESHOLD,
	swatchBackground,
} from "~/lib/product";
import { bouquetSize } from "~/lib/sizes";
import { cn } from "~/lib/utils";
import {
	deleteProductFn,
	deleteVariantFn,
	listInventory,
	updateStock,
} from "~/server/admin/catalog";
import type { AdminProduct, AdminVariant } from "~/types/product";

interface InventorySearch {
	q?: string;
}

export const Route = createFileRoute("/admin/_dashboard/products/")({
	validateSearch: (search: Record<string, unknown>): InventorySearch => ({
		q:
			typeof search.q === "string" && search.q.trim()
				? search.q.trim().slice(0, 80)
				: undefined,
	}),
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

	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [query, setQuery] = createSignal(search().q ?? "");
	// Kept in the address, so Back from a color returns to these results.
	let debounce: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounce));
	const updateQuery = (value: string) => {
		setQuery(value);
		clearTimeout(debounce);
		debounce = setTimeout(
			() =>
				navigate({
					search: { q: value.trim() || undefined },
					replace: true,
				}),
			300,
		);
	};

	const words = () => query().toLowerCase().split(/\s+/).filter(Boolean);
	const matches = (product: AdminProduct, variant: AdminVariant) => {
		const text =
			`${variant.sku} ${variant.colorName} ${product.title}`.toLowerCase();
		return words().every((word) => text.includes(word));
	};
	const colorsOf = (product: AdminProduct) =>
		product.variants.filter((variant) => matches(product, variant));
	const visible = () => products.filter((p) => colorsOf(p).length > 0);
	const colorCount = () =>
		visible().reduce((sum, product) => sum + colorsOf(product).length, 0);

	const replaceProduct = (next: AdminProduct) =>
		setProducts((p) => p.id === next.id, reconcile(next, { key: "id" }));

	const removeProduct = async (product: AdminProduct) => {
		try {
			await deleteProductFn({ data: { productId: product.id } });
			setProducts((list) => list.filter((p) => p.id !== product.id));
			toastSuccess(`Deleted ${product.title}.`);
		} catch (error) {
			toastError(error);
		}
	};

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
			<div class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
				<label class="w-full sm:w-80">
					<span class="sr-only">Search products</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => updateQuery(e.currentTarget.value)}
						placeholder="Search flower code, color or product"
						class={adminInput}
					/>
				</label>
				<Show when={words().length > 0}>
					<p class="text-sm text-petal-900/60" aria-live="polite">
						{colorCount()} {colorCount() === 1 ? "match" : "matches"}
					</p>
				</Show>
			</div>
			<div class="flex flex-col gap-6">
				<For
					each={visible()}
					fallback={
						<p class="text-petal-900/60">
							{products.length
								? `Nothing matches “${query().trim()}”.`
								: "No products yet."}
						</p>
					}
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
									<ConfirmButton
										class={adminButton.danger}
										title={`Delete ${product.title}?`}
										description={
											<>
												This removes the product and all{" "}
												{product.variants.length} of its colors from the shop
												for good. Past orders keep their details.
											</>
										}
										confirmLabel="Delete product"
										onConfirm={() => removeProduct(product)}
									>
										Delete
									</ConfirmButton>
								</div>
							</header>
							<div class="relative overflow-x-auto">
								<table class="stack-table w-full text-left text-sm md:min-w-[640px]">
									<thead class="text-xs uppercase tracking-wide text-petal-900/55">
										<tr>
											<th class="px-5 py-2.5 font-medium">Color</th>
											<th class="px-3 py-2.5 font-medium">Price</th>
											<th class="px-3 py-2.5 font-medium">In stock</th>
											<th class="px-3 py-2.5 font-medium">Selling</th>
											<th class="px-3 py-2.5 font-medium">Status</th>
											<th class="px-5 py-2.5">
												<span class="sr-only">Actions</span>
											</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-petal-50">
										<For each={colorsOf(product)}>
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
	const navigate = useNavigate();

	/** The row opens this color in the editor, except where it has controls. */
	const openColor = (event: MouseEvent) => {
		const target = event.target as HTMLElement;
		if (target.closest("a, button, [data-controls]")) return;
		if (window.getSelection()?.toString()) return;
		if (event.ctrlKey || event.metaKey) {
			window.open(
				`/admin/products/${props.product.id}?color=${props.variant.id}`,
				"_blank",
			);
			return;
		}
		void navigate({
			to: "/admin/products/$productId",
			params: { productId: props.product.id },
			search: { color: props.variant.id },
		});
	};

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
		"flex size-10 items-center justify-center rounded-full text-petal-900/70 hover:bg-petal-100 disabled:opacity-35 sm:size-8";

	return (
		<tr
			data-variant={props.variant.id}
			onClick={openColor}
			class="cursor-pointer transition-colors hover:bg-petal-50/70"
		>
			<td data-wide class="px-5 py-3">
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
								style={{
									background: swatchBackground(
										props.variant.colorHex,
										props.variant.colorHex2,
									),
								}}
							/>
							<Link
								to="/admin/products/$productId"
								params={{ productId: props.product.id }}
								search={{ color: props.variant.id }}
								class="underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
							>
								{props.variant.colorName}
							</Link>
						</p>
						<p class="text-xs text-petal-900/50">
							Code: {props.variant.sku} ·{" "}
							{bouquetSize(props.variant.size)?.name ?? "No size set"}
						</p>
						<Show
							when={mainFlower(props.variant.recipe)}
							fallback={
								<p class="text-xs text-warning-foreground">No recipe yet</p>
							}
						>
							{(main) => (
								<p class="mt-0.5 text-xs font-medium text-petal-900/80">
									Main flower: {formatRecipeItem(main())}
								</p>
							)}
						</Show>
					</div>
				</div>
			</td>
			<td data-label="Price" class="px-5 py-2 md:px-3 md:py-3 tabular-nums">
				{formatPrice(
					props.variant.price ?? props.product.basePrice,
					props.product.currency,
				)}
			</td>
			<td
				data-controls
				data-label="In stock"
				data-wide
				class="px-5 py-2 md:px-3 md:py-3"
			>
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
						class="h-10 w-20 rounded-lg border border-petal-200 bg-white px-2 text-center text-base tabular-nums sm:h-9 sm:text-sm outline-none focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30"
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
			<td data-controls data-label="Selling" class="px-5 py-2 md:px-3 md:py-3">
				<Toggle
					label={`Sell ${label()}`}
					hideLabel
					checked={props.variant.isAvailable}
					onChange={(checked) => save({ isAvailable: checked })}
				/>
			</td>
			<td data-label="Status" class="px-5 py-2 md:px-3 md:py-3">
				<span
					class={cn(
						"rounded-full px-2.5 py-0.5 text-xs font-medium",
						status().class,
					)}
				>
					{status().label}
				</span>
			</td>
			<td class="px-5 py-3 text-right">
				<Show
					when={props.product.variants.length > 1}
					fallback={<span class="text-xs text-petal-900/45">Only color</span>}
				>
					<ConfirmButton
						class={cn(adminButton.ghost, "text-error-foreground")}
						aria-label={`Delete ${label()}`}
						title={`Delete ${label()}?`}
						description={
							<>
								{label()} ({props.variant.sku}) and its{" "}
								{props.variant.stockQuantity} in stock are removed from{" "}
								{props.product.title} for good. Past orders keep their details.
							</>
						}
						confirmLabel="Delete color"
						onConfirm={async () => {
							try {
								const product = await deleteVariantFn({
									data: {
										productId: props.product.id,
										variantId: props.variant.id,
									},
								});
								if (product) props.onSaved(product);
								toastSuccess(`Deleted ${label()}.`);
							} catch (error) {
								toastError(error);
							}
						}}
					>
						Delete
					</ConfirmButton>
				</Show>
			</td>
		</tr>
	);
}
