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
import { formatPrice, swatchBackground } from "~/lib/product";
import { bouquetSize } from "~/lib/sizes";
import { cn } from "~/lib/utils";
import {
	deleteProductFn,
	deleteVariantFn,
	listInventory,
	setStyleAvailableFn,
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
		const text = `${product.title} ${variant.colorName}`.toLowerCase();
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
				title="Signature bouquets"
				description="Each bouquet and its styles. Switching a style off keeps it in the shop but stops it being ordered; it saves right away."
				actions={
					<Link
						to="/admin/products/$productId"
						params={{ productId: "new" }}
						class={adminButton.primary}
					>
						+ New bouquet
					</Link>
				}
			/>
			<div class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
				<label class="w-full sm:w-80">
					<span class="sr-only">Search bouquets</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => updateQuery(e.currentTarget.value)}
						placeholder="Search bouquet or style"
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
								: "No bouquets yet."}
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
										{bouquetSize(product.size)?.name ?? "No size set"} ·{" "}
										{product.variants.length}{" "}
										{product.variants.length === 1 ? "style" : "styles"} · from{" "}
										{formatPrice(product.basePrice, product.currency)}
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
												This removes the bouquet and all{" "}
												{product.variants.length} of its styles from the shop
												for good. Past orders keep their details.
											</>
										}
										confirmLabel="Delete bouquet"
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
											<th class="px-5 py-2.5 font-medium">Style</th>
											<th class="px-3 py-2.5 font-medium">Price</th>
											<th class="px-3 py-2.5 font-medium">Available</th>
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
	const [saving, setSaving] = createSignal(false);
	const [saved, setSaved] = createSignal(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(savedTimer));

	const label = () => `${props.variant.colorName}`;
	const navigate = useNavigate();

	/** The row opens this style in the editor, except where it has controls. */
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

	// The switch stays enabled while saving: disabling it would drop keyboard
	// focus. Extra clicks during a save are ignored instead.
	const setAvailable = async (isAvailable: boolean) => {
		if (saving()) return;
		setSaving(true);
		try {
			const product = await setStyleAvailableFn({
				data: {
					productId: props.product.id,
					variantId: props.variant.id,
					isAvailable,
				},
			});
			if (product) props.onSaved(product);
			setSaved(true);
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => setSaved(false), 1500);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

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
						<p class="flex items-center gap-1.5 font-semibold">
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
							{props.variant.wrapperColor
								? `${props.variant.wrapperColor} wrapper`
								: "No wrapper set"}
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
				data-label="Available"
				class="px-5 py-2 md:px-3 md:py-3"
			>
				<div class="flex items-center gap-2">
					<Toggle
						label={`${label()} available`}
						hideLabel
						checked={props.variant.isAvailable}
						onChange={(checked) => void setAvailable(checked)}
					/>
					<span
						class={cn(
							"text-xs",
							props.variant.isAvailable
								? "text-petal-900/60"
								: "text-error-foreground",
						)}
					>
						{props.variant.isAvailable ? "Available" : "Not available"}
					</span>
					<span class="w-14 text-xs text-sage-600" aria-live="polite">
						{saved() ? "Saved ✓" : ""}
					</span>
				</div>
			</td>
			<td class="px-5 py-3 text-right">
				<Show
					when={props.product.variants.length > 1}
					fallback={<span class="text-xs text-petal-900/45">Only style</span>}
				>
					<ConfirmButton
						class={cn(adminButton.ghost, "text-error-foreground")}
						aria-label={`Delete ${label()}`}
						title={`Delete ${label()}?`}
						description={
							<>
								{label()} is removed from {props.product.title} for good. Past
								orders keep their details.
							</>
						}
						confirmLabel="Delete style"
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
