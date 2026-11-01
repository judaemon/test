import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
	choiceParam,
	type Facet,
	facetCount,
	fitsFacets,
	ListToolbar,
	matchesQuery,
	textParam,
} from "~/components/admin/list-toolbar";
import {
	adminButton,
	adminCard,
	ConfirmButton,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { formatRecipeItem, mainFlower } from "~/lib/flowers";
import { formatPrice, swatchBackground } from "~/lib/product";
import { joinList, parseList } from "~/lib/shop-filters";
import { findSize } from "~/lib/sizes";
import { useSizes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import {
	deleteProductFn,
	deleteVariantFn,
	listInventory,
	updateStyleFn,
} from "~/server/admin/catalog";
import type { AdminProduct, AdminVariant } from "~/types/product";

const SORTS = ["name", "name-desc", "price", "price-desc"] as const;

/** Search, filters and sort, kept in the address so Back returns to them. */
interface InventorySearch {
	q?: string;
	/** Comma-separated: size ids, or "none" for bouquets without one. */
	size?: string;
	/** Comma-separated: "shown", "hidden". */
	status?: string;
	/** Comma-separated: "all-available", "some-unavailable". */
	themes?: string;
	/** Comma-separated flower names. */
	flower?: string;
	/** Missing: the shop's order. */
	sort?: (typeof SORTS)[number];
}

export const Route = createFileRoute("/admin/_dashboard/signature-bouquets/")({
	validateSearch: (search: Record<string, unknown>): InventorySearch => ({
		q: textParam(search, "q"),
		size: textParam(search, "size"),
		status: textParam(search, "status"),
		themes: textParam(search, "themes"),
		flower: textParam(search, "flower"),
		sort: choiceParam(search, "sort", SORTS),
	}),
	loader: () => listInventory(),
	component: InventoryPage,
});

function InventoryPage() {
	const loaded = Route.useLoaderData();
	const sizes = useSizes();
	// A keyed store keeps each row's DOM (and keyboard focus) across saves.
	const [products, setProducts] = createStore<AdminProduct[]>(loaded());
	createEffect(
		on(loaded, (fresh) => setProducts(reconcile(fresh, { key: "id" })), {
			defer: true,
		}),
	);

	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const setSearch = (patch: Partial<InventorySearch>) =>
		navigate({
			search: (prev) => ({ ...prev, ...patch }),
			replace: true,
			resetScroll: false,
		});
	const filtered = () =>
		!!(
			search().q ||
			search().size ||
			search().status ||
			search().themes ||
			search().flower
		);

	const flowersOf = (product: AdminProduct) =>
		new Set(product.variants.flatMap((v) => v.recipe.map((i) => i.flower)));
	const flowerNames = () =>
		[...new Set(products.flatMap((p) => [...flowersOf(p)]))].sort();

	/** A bouquet's styles that match the search (all, if it names the bouquet). */
	const colorsOf = (product: AdminProduct) =>
		product.variants.filter((variant) =>
			matchesQuery(search().q, `${product.title} ${variant.colorName}`),
		);
	const searched = () => products.filter((p) => colorsOf(p).length > 0);
	const facets = (): Record<string, Facet<AdminProduct>> => ({
		size: {
			chosen: parseList(search().size),
			matches: (p, key) => (p.size || "none") === key,
		},
		status: {
			chosen: parseList(search().status),
			matches: (p, key) => p.isVisible === (key === "shown"),
		},
		themes: {
			chosen: parseList(search().themes),
			matches: (p, key) =>
				p.variants.some((v) => !v.isAvailable) === (key === "some-unavailable"),
		},
		flower: {
			chosen: parseList(search().flower),
			matches: (p, key) => flowersOf(p).has(key),
		},
	});
	const filterOf = (
		name: keyof InventorySearch & string,
		label: string,
		choices: { key: string; label: string }[],
	) => ({
		label,
		selected: parseList(search()[name]),
		onChange: (chosen: string[]) => setSearch({ [name]: joinList(chosen) }),
		options: choices.map((choice) => ({
			...choice,
			count: facetCount(searched(), facets(), name, choice.key),
		})),
	});
	const visible = () => {
		const list = searched().filter((p) => fitsFacets(p, facets()));
		const by = search().sort;
		if (!by) return list;
		const sign = by.endsWith("-desc") ? -1 : 1;
		return [...list].sort((a, b) =>
			by.startsWith("price")
				? sign * (a.basePrice - b.basePrice) || a.title.localeCompare(b.title)
				: sign * a.title.localeCompare(b.title),
		);
	};

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
			{/* Stays in view on wider screens; on phones it would fill the screen. */}
			<div class="flow-root lg:sticky lg:top-0 lg:z-10 lg:-mx-8 lg:-mt-8 lg:bg-cream lg:px-8 lg:pt-8">
				<PageHeader
					title="Signature bouquets"
					description="Each bouquet and its styles. Change a price or switch a style off right here; it saves straight away. A style that’s off stays in the shop but can’t be ordered."
					actions={
						<Link
							to="/admin/signature-bouquets/$productId"
							params={{ productId: "new" }}
							class={adminButton.primary}
						>
							+ New bouquet
						</Link>
					}
				/>
				<ListToolbar
					query={search().q ?? ""}
					onQuery={(q) => setSearch({ q: q || undefined })}
					placeholder="Bouquet or style name"
					filters={[
						filterOf("size", "Size", [
							...sizes().map((size) => ({ key: size.id, label: size.name })),
							{ key: "none", label: "No size set" },
						]),
						filterOf(
							"flower",
							"Flower",
							flowerNames().map((name) => ({ key: name, label: name })),
						),
						filterOf("status", "In the shop", [
							{ key: "shown", label: "Shown" },
							{ key: "hidden", label: "Hidden" },
						]),
						filterOf("themes", "Styles", [
							{ key: "all-available", label: "All available" },
							{ key: "some-unavailable", label: "Some not available" },
						]),
					]}
					sort={{
						value: search().sort ?? "",
						options: [
							{ value: "", label: "Shop order" },
							{ value: "name", label: "Name, A–Z" },
							{ value: "name-desc", label: "Name, Z–A" },
							{ value: "price", label: "Price, low to high" },
							{ value: "price-desc", label: "Price, high to low" },
						],
						onChange: (sort) =>
							setSearch({
								sort: (sort || undefined) as InventorySearch["sort"],
							}),
					}}
					summary={
						filtered()
							? `${visible().length} of ${products.length} bouquets`
							: `${products.length} bouquets`
					}
					filtered={filtered()}
					onClear={() =>
						setSearch({
							q: undefined,
							size: undefined,
							status: undefined,
							themes: undefined,
							flower: undefined,
						})
					}
				/>
			</div>
			<div class="flex flex-col gap-6">
				<For
					each={visible()}
					fallback={
						<p class="text-petal-900/60">
							{products.length
								? "No bouquets match these filters."
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
										{findSize(sizes(), product.size)?.name ?? "No size set"} ·{" "}
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
										to="/admin/signature-bouquets/$productId"
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
	/** Which control just saved, for its "Saved ✓". */
	const [saved, setSaved] = createSignal<"price" | "available" | null>(null);
	const currentPrice = () =>
		String(props.variant.price ?? props.product.basePrice);
	const [price, setPrice] = createSignal(currentPrice());
	// Follow saves from elsewhere (or a reverted edit).
	createEffect(on(currentPrice, (value) => setPrice(value), { defer: true }));
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
				`/admin/signature-bouquets/${props.product.id}?color=${props.variant.id}`,
				"_blank",
			);
			return;
		}
		void navigate({
			to: "/admin/signature-bouquets/$productId",
			params: { productId: props.product.id },
			search: { color: props.variant.id },
		});
	};

	// Controls stay enabled while saving: disabling them would drop keyboard
	// focus. Extra changes during a save are ignored instead.
	const save = async (
		field: "price" | "available",
		patch: { isAvailable?: boolean; price?: number },
	) => {
		if (saving()) return;
		setSaving(true);
		try {
			const product = await updateStyleFn({
				data: {
					productId: props.product.id,
					variantId: props.variant.id,
					...patch,
				},
			});
			if (product) props.onSaved(product);
			setSaved(field);
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => setSaved(null), 1500);
		} catch (error) {
			setPrice(currentPrice());
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	/** Saves a typed price once it's left (Enter or clicking away). */
	const commitPrice = () => {
		const next = Math.round(Number(price()) * 100) / 100;
		if (!price().trim() || !Number.isFinite(next) || next <= 0) {
			setPrice(currentPrice());
			toastError(new Error("Price must be more than zero."));
			return;
		}
		if (String(next) !== currentPrice()) void save("price", { price: next });
		else setPrice(currentPrice());
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
								to="/admin/signature-bouquets/$productId"
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
			<td data-controls data-label="Price" class="px-5 py-2 md:px-3 md:py-3">
				<div class="flex items-center gap-2">
					<label class="flex h-10 w-32 items-center rounded-lg border border-petal-200 bg-white pl-2.5 transition-colors focus-within:border-petal-500 focus-within:ring-2 focus-within:ring-petal-500/30 hover:border-petal-300 sm:h-9">
						<span aria-hidden="true" class="text-petal-900/55">
							₱
						</span>
						<input
							type="number"
							inputMode="decimal"
							min="1"
							step="0.01"
							value={price()}
							aria-label={`${label()} price`}
							aria-busy={saving()}
							onInput={(e) => setPrice(e.currentTarget.value)}
							onChange={commitPrice}
							onKeyDown={(e) => {
								if (e.key === "Enter") e.currentTarget.blur();
								if (e.key === "Escape") {
									setPrice(currentPrice());
									e.currentTarget.blur();
								}
							}}
							class="h-full w-full min-w-0 bg-transparent px-1.5 text-base tabular-nums outline-none sm:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
						/>
					</label>
					<span class="w-14 text-xs text-sage-600" aria-live="polite">
						{saved() === "price" ? "Saved ✓" : ""}
					</span>
				</div>
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
						onChange={(checked) =>
							void save("available", { isAvailable: checked })
						}
					/>
					<span
						class={cn(
							"whitespace-nowrap text-xs",
							props.variant.isAvailable
								? "text-petal-900/60"
								: "text-error-foreground",
						)}
					>
						{props.variant.isAvailable ? "Available" : "Not available"}
					</span>
					<span class="w-14 text-xs text-sage-600" aria-live="polite">
						{saved() === "available" ? "Saved ✓" : ""}
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
