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
import { OptimizePhotos } from "~/components/admin/photo-thumbnails";
import { WatermarkPhotos } from "~/components/admin/photo-watermarks";
import {
	AdminIcons,
	adminButton,
	adminCard,
	ConfirmButton,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { findArrangementType, sizesForType } from "~/lib/arrangements";
import { formatRecipeItem, mainFlower } from "~/lib/flowers";
import {
	formatPrice,
	stockLabel,
	swatchBackground,
	wrapperNames,
} from "~/lib/product";
import { joinList, parseList } from "~/lib/shop-filters";
import { findSize } from "~/lib/sizes";
import { useArrangementTypes, useSizes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import {
	deleteProductFn,
	deleteVariantFn,
	listInventory,
	setProductVisibleFn,
	updateStyleFn,
} from "~/server/admin/catalog";
import type { AdminProduct, AdminVariant } from "~/types/product";

const SORTS = [
	"shop",
	"oldest",
	"name",
	"name-desc",
	"price",
	"price-desc",
] as const;

/** Quiet until hovered, so a list of bouquets isn't a column of red. */
const DELETE_ICON_BUTTON = cn(
	adminButton.ghost,
	"size-10 px-0 hover:bg-error hover:text-error-foreground",
);

/** Search, filters and sort, kept in the address so Back returns to them. */
interface InventorySearch {
	q?: string;
	/** Comma-separated: bouquet, corsage, boutonniere. */
	type?: string;
	/** Comma-separated: size ids, or "none" for bouquets without one. */
	size?: string;
	/** Comma-separated: "shown", "hidden". */
	status?: string;
	/** Comma-separated: "all-available", "some-unavailable". */
	themes?: string;
	/** Comma-separated flower names. */
	flower?: string;
	/** Comma-separated wrapper ids, or "none" for styles without one. */
	wrapper?: string;
	/** Missing: newest first. "shop": the shop's order. */
	sort?: (typeof SORTS)[number];
}

export const Route = createFileRoute("/admin/_dashboard/signature-bouquets/")({
	validateSearch: (search: Record<string, unknown>): InventorySearch => ({
		q: textParam(search, "q"),
		type: textParam(search, "type"),
		size: textParam(search, "size"),
		status: textParam(search, "status"),
		themes: textParam(search, "themes"),
		flower: textParam(search, "flower"),
		wrapper: textParam(search, "wrapper"),
		sort: choiceParam(search, "sort", SORTS),
	}),
	// Stepped back to after a save, wait for the fresh rows rather than
	// showing the old ones first and swapping them in.
	loader: {
		handler: ({ abortController }) =>
			listInventory({ signal: abortController.signal }),
		staleReloadMode: "blocking",
	},
	component: InventoryPage,
});

function InventoryPage() {
	const loaded = Route.useLoaderData();
	const context = Route.useRouteContext();
	const sizes = useSizes();
	const arrangementTypes = useArrangementTypes();
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
			search().type ||
			search().size ||
			search().status ||
			search().themes ||
			search().flower ||
			search().wrapper
		);

	const flowersOf = (product: AdminProduct) =>
		new Set(product.variants.flatMap((v) => v.recipe.map((i) => i.flower)));
	const flowerNames = () =>
		[...new Set(products.flatMap((p) => [...flowersOf(p)]))].sort();
	/** The wrapper ids a bouquet's styles use; "none" if a style has none. */
	const wrappersOf = (product: AdminProduct) =>
		new Set(
			product.variants.flatMap((v) =>
				v.wrapperIds.length ? v.wrapperIds : ["none"],
			),
		);
	/** Keyed by id: some wrapper names have commas, which the address splits on. */
	const wrapperChoices = () => {
		const names = new Map<string, string>();
		for (const variant of products.flatMap((p) => p.variants)) {
			const labels = wrapperNames(variant.wrapperColor);
			variant.wrapperIds.forEach((id, i) => {
				if (!names.has(id)) names.set(id, labels[i] ?? id);
			});
		}
		const hasNone = products.some((p) => wrappersOf(p).has("none"));
		return [
			...[...names]
				.sort(([, a], [, b]) => a.localeCompare(b))
				.map(([key, label]) => ({ key, label })),
			...(hasNone ? [{ key: "none", label: "No wrapper" }] : []),
		];
	};

	/** A bouquet's styles that match the search (all, if it names the bouquet). */
	const colorsOf = (product: AdminProduct) =>
		product.variants.filter((variant) =>
			matchesQuery(search().q, `${product.title} ${variant.colorName}`),
		);
	const searched = () => products.filter((p) => colorsOf(p).length > 0);
	const facets = (): Record<string, Facet<AdminProduct>> => ({
		type: {
			chosen: parseList(search().type),
			matches: (p, key) => p.arrangement === key,
		},
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
		wrapper: {
			chosen: parseList(search().wrapper),
			matches: (p, key) => wrappersOf(p).has(key),
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
		const by = search().sort ?? "newest";
		if (by === "shop") return list;
		const sign = by.endsWith("-desc") || by === "newest" ? -1 : 1;
		return [...list].sort((a, b) =>
			by.startsWith("price")
				? sign * (a.basePrice - b.basePrice) || a.title.localeCompare(b.title)
				: by === "newest" || by === "oldest"
					? // ISO dates sort as text; bouquets added together go by name.
						sign * a.createdAt.localeCompare(b.createdAt) ||
						a.title.localeCompare(b.title)
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
			<WatermarkPhotos />
			<OptimizePhotos />
			{/* Stays in view on wider screens; on phones it would fill the screen. */}
			<div class="flow-root lg:sticky lg:top-0 lg:z-10 lg:-mx-8 lg:-mt-8 lg:bg-cream lg:px-8 lg:pt-8">
				<PageHeader
					title="Floral arrangements"
					description="Changes here save straight away. Show in shop lists or hides the whole bouquet; a style that isn’t Available stays listed but can’t be ordered."
					actions={
						<>
							{/* A copy of the photos without the watermark, off the server. */}
							<Show when={context().user.role === "owner"}>
								<a
									href="/api/admin/photo-backup"
									download=""
									class={adminButton.secondary}
									title="Every bouquet photo without the watermark, as a zip"
								>
									Download original photos
								</a>
							</Show>
							<Link
								to="/admin/signature-bouquets/florist"
								class={adminButton.secondary}
							>
								Florist list
							</Link>
							<Link
								to="/admin/signature-bouquets/arrange"
								class={adminButton.secondary}
							>
								<AdminIcons.grip class="size-4" />
								Rearrange shop
							</Link>
							<Link
								to="/admin/signature-bouquets/$productId"
								params={{ productId: "new" }}
								class={adminButton.primary}
							>
								+ New arrangement
							</Link>
						</>
					}
				/>
				<ListToolbar
					query={search().q ?? ""}
					onQuery={(q) => setSearch({ q: q || undefined })}
					placeholder="Arrangement or style name"
					filters={[
						filterOf(
							"type",
							"Type",
							arrangementTypes().map((type) => ({
								key: type.id,
								label: type.pluralName,
							})),
						),
						filterOf("size", "Size", [
							...sizes().map((size) => ({ key: size.id, label: size.name })),
							{ key: "none", label: "No size set" },
						]),
						filterOf(
							"flower",
							"Flower",
							flowerNames().map((name) => ({ key: name, label: name })),
						),
						filterOf("wrapper", "Wrapper", wrapperChoices()),
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
							{ value: "", label: "Newest first" },
							{ value: "oldest", label: "Oldest first" },
							{ value: "shop", label: "Shop order" },
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
							? `${visible().length} of ${products.length} arrangements`
							: `${products.length} arrangements`
					}
					filtered={filtered()}
					onClear={() =>
						setSearch({
							q: undefined,
							type: undefined,
							size: undefined,
							status: undefined,
							themes: undefined,
							flower: undefined,
							wrapper: undefined,
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
							<header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-petal-100 px-5 py-3">
								<div class="min-w-48 flex-1">
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
										{findArrangementType(
											arrangementTypes(),
											product.arrangement,
										)?.name ?? "No type"}
										<Show
											when={
												sizesForType(sizes(), product.arrangement).length > 0
											}
										>
											{" "}
											· {findSize(sizes(), product.size)?.name ?? "No size set"}
										</Show>{" "}
										· {product.variants.length}{" "}
										{product.variants.length === 1 ? "style" : "styles"} · from{" "}
										{formatPrice(product.basePrice, product.currency)}
									</p>
								</div>
								<ShopToggle product={product} onSaved={replaceProduct} />
								<div class="flex items-center gap-1">
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
										class={DELETE_ICON_BUTTON}
										aria-label={`Delete ${product.title}`}
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
										<AdminIcons.trash class="size-4" />
									</ConfirmButton>
								</div>
							</header>
							<div
								class={cn(
									"relative overflow-x-auto",
									!product.isVisible && "opacity-60",
								)}
							>
								<table class="stack-table w-full text-left text-sm md:min-w-[900px] md:table-fixed">
									<thead class="text-xs uppercase tracking-wide text-petal-900/55">
										<tr>
											<th class="px-5 py-2 font-medium">Style</th>
											<th class="px-3 py-2 font-medium md:w-52">Price</th>
											<th class="px-3 py-2 font-medium md:w-56">Available</th>
											<th class="px-3 py-2 font-medium md:w-56">
												Ready-made stock
											</th>
											<th class="px-3 py-2 md:w-16">
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

/** Shows or hides a whole bouquet in the shop, saving straight away. */
function ShopToggle(props: {
	product: AdminProduct;
	onSaved: (product: AdminProduct) => void;
}) {
	const [saving, setSaving] = createSignal(false);
	const [saved, setSaved] = createSignal(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(savedTimer));

	// Stays enabled while saving, like the style controls, to keep keyboard focus.
	const save = async (isVisible: boolean) => {
		if (saving()) return;
		setSaving(true);
		try {
			const product = await setProductVisibleFn({
				data: { productId: props.product.id, isVisible },
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
		<div class="flex h-10 items-center gap-2 rounded-full bg-petal-50 pl-2 pr-3.5">
			<Toggle
				label={`Show ${props.product.title} in shop`}
				hideLabel
				checked={props.product.isVisible}
				onChange={(checked) => void save(checked)}
			/>
			<span
				aria-live="polite"
				class={cn(
					"min-w-[4.75rem] whitespace-nowrap text-xs font-medium",
					saved() && "text-sage-600",
				)}
			>
				{saved() ? "Saved ✓" : "Show in shop"}
			</span>
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
	const [saved, setSaved] = createSignal<
		"price" | "available" | "stock" | null
	>(null);
	const currentStock = () =>
		props.variant.readyStock === undefined
			? ""
			: String(props.variant.readyStock);
	const [stock, setStock] = createSignal(currentStock());
	createEffect(on(currentStock, (value) => setStock(value), { defer: true }));
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
		field: "price" | "available" | "stock",
		patch: {
			isAvailable?: boolean;
			price?: number;
			readyStock?: number | null;
		},
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
			setStock(currentStock());
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

	/** Saves typed ready-made stock once it's left; blank is made to order. */
	const commitStock = () => {
		const typed = stock().trim();
		const next = typed === "" ? null : Number(typed);
		if (next !== null && (!Number.isInteger(next) || next < 0)) {
			setStock(currentStock());
			toastError(new Error("Stock must be a whole number, or blank."));
			return;
		}
		if (typed !== currentStock()) void save("stock", { readyStock: next });
	};

	return (
		<tr
			data-variant={props.variant.id}
			onClick={openColor}
			class="cursor-pointer transition-colors hover:bg-petal-50/70"
		>
			<td data-wide class="px-5 py-2.5">
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
						<p class="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-petal-900/60">
							<span>
								{props.variant.wrapperColor
									? `${props.variant.wrapperColor} ${
											wrapperNames(props.variant.wrapperColor).length > 1
												? "wrappers"
												: "wrapper"
										}`
									: "No wrapper"}
							</span>
							<span aria-hidden="true">·</span>
							<Show
								when={mainFlower(props.variant.recipe)}
								fallback={
									<span class="text-warning-foreground">No recipe yet</span>
								}
							>
								{(main) => <span>{formatRecipeItem(main())}</span>}
							</Show>
						</p>
					</div>
				</div>
			</td>
			<td data-controls data-label="Price" class="px-5 py-2 md:px-3 md:py-2.5">
				<div class="flex items-center gap-2">
					<label class="flex h-10 w-28 items-center rounded-lg border border-petal-200 bg-white pl-2.5 transition-colors focus-within:border-petal-500 focus-within:ring-2 focus-within:ring-petal-500/30 hover:border-petal-300 sm:h-9">
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
				class="px-5 py-2 md:px-3 md:py-2.5"
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
			<td
				data-controls
				data-label="Ready-made stock"
				class="px-5 py-2 md:px-3 md:py-2.5"
			>
				<div class="flex items-center gap-2">
					<input
						type="number"
						inputMode="numeric"
						min="0"
						step="1"
						placeholder="No limit"
						value={stock()}
						aria-label={`${label()} ready-made stock`}
						aria-busy={saving()}
						onInput={(e) => setStock(e.currentTarget.value)}
						onChange={commitStock}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
							if (e.key === "Escape") {
								setStock(currentStock());
								e.currentTarget.blur();
							}
						}}
						class="h-10 w-20 rounded-lg border border-petal-200 bg-white px-2.5 text-base tabular-nums outline-none transition-colors focus:border-petal-500 focus:ring-2 focus:ring-petal-500/30 hover:border-petal-300 sm:h-9 sm:text-sm"
					/>
					<span
						class={cn(
							"whitespace-nowrap text-xs",
							props.variant.inStock
								? "text-petal-900/60"
								: "text-error-foreground",
						)}
					>
						{saved() === "stock"
							? "Saved ✓"
							: props.variant.isAvailable
								? stockLabel(props.variant)
								: ""}
					</span>
				</div>
			</td>
			<td class="px-5 py-2 text-right md:px-3 md:py-2.5">
				{/* A bouquet keeps at least one style. */}
				<Show when={props.product.variants.length > 1}>
					<ConfirmButton
						class={DELETE_ICON_BUTTON}
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
						<AdminIcons.trash class="size-4" />
					</ConfirmButton>
				</Show>
			</td>
		</tr>
	);
}
