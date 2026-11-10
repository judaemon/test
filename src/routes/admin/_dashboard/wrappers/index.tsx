import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { ListPager } from "~/components/admin/list-pager";
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
	PageHeader,
	Toggle,
	toastError,
} from "~/components/admin/ui";
import { WrapperImport } from "~/components/admin/wrapper-import";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { type CustomWrapper, wrapperColors } from "~/lib/custom-bouquet";
import { formatPrice, LOW_STOCK_THRESHOLD, swatchColors } from "~/lib/product";
import { joinList, parseList } from "~/lib/shop-filters";
import { cn } from "~/lib/utils";
import { listSuppliersAdmin } from "~/server/admin/suppliers";
import {
	listWrappersAdmin,
	setWrapperEnabledFn,
} from "~/server/admin/wrappers";

const SORTS = ["name", "name-desc", "price", "price-desc"] as const;
const PAGE_SIZES = [25, 50, 100] as const;

/** Search, filters and sort, kept in the address so Back returns to them. */
interface WrappersSearch {
	q?: string;
	/** Comma-separated: "custom", "off". */
	use?: string;
	/** Comma-separated: "low", "sold-out", "not-counted". */
	stock?: string;
	/** Comma-separated supplier ids, or "none" for wrappers without one. */
	supplier?: string;
	/** Missing: the builder's order. */
	sort?: (typeof SORTS)[number];
	/** Missing: the first. */
	page?: number;
	/** Missing: the smallest of `PAGE_SIZES`. */
	perPage?: number;
}

/** "A", "A and B", "A, B and C". */
const joinNames = (names: string[]) =>
	names.length <= 1
		? (names[0] ?? "")
		: `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** A whole number from the address, if it's at least 1. */
const countParam = (search: Record<string, unknown>, key: string) => {
	const value = Number(search[key]);
	return Number.isInteger(value) && value >= 1 ? value : undefined;
};

export const Route = createFileRoute("/admin/_dashboard/wrappers/")({
	validateSearch: (search: Record<string, unknown>): WrappersSearch => ({
		q: textParam(search, "q"),
		use: textParam(search, "use"),
		stock: textParam(search, "stock"),
		supplier: textParam(search, "supplier"),
		sort: choiceParam(search, "sort", SORTS),
		page: countParam(search, "page"),
		perPage: PAGE_SIZES.find((size) => size === Number(search.perPage)),
	}),
	// Stepped back to after a save, wait for the fresh rows rather than
	// showing the old ones first and swapping them in.
	loader: {
		handler: async ({ abortController }) => {
			const [wrappers, suppliers] = await Promise.all([
				listWrappersAdmin({ signal: abortController.signal }),
				listSuppliersAdmin({ signal: abortController.signal }),
			]);
			return { wrappers, suppliers };
		},
		staleReloadMode: "blocking",
	},
	component: WrappersPage,
});

function WrappersPage() {
	const loaded = Route.useLoaderData();
	const all = () => loaded().wrappers;
	/** The wrapper's supplier names, as listed on it; deleted ones are gone. */
	const supplierNames = (wrapper: CustomWrapper) =>
		(wrapper.supplierIds ?? []).flatMap((id) => {
			const name = loaded().suppliers.find((s) => s.id === id)?.name;
			return name ? [name] : [];
		});
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	/** Any change of filter starts again from the first page. */
	const setSearch = (patch: Partial<WrappersSearch>) =>
		navigate({
			search: (prev) => ({ ...prev, page: undefined, ...patch }),
			replace: true,
			resetScroll: false,
		});
	const filtered = () =>
		!!(search().q || search().use || search().stock || search().supplier);
	const searched = () =>
		all().filter((wrapper) =>
			matchesQuery(
				search().q,
				`${wrapper.name} ${wrapper.code ?? ""} ${supplierNames(wrapper).join(" ")}`,
			),
		);
	const facets = (): Record<string, Facet<CustomWrapper>> => ({
		use: {
			chosen: parseList(search().use),
			matches: (wrapper, key) => wrapper.enabled === (key === "custom"),
		},
		stock: {
			chosen: parseList(search().stock),
			matches: (wrapper, key) => {
				if (key === "not-counted") return wrapper.stock === undefined;
				if (key === "sold-out") return wrapper.stock === 0;
				return (
					wrapper.stock !== undefined && wrapper.stock <= LOW_STOCK_THRESHOLD
				);
			},
		},
		supplier: {
			chosen: parseList(search().supplier),
			matches: (wrapper, key) =>
				key === "none"
					? !wrapper.supplierIds?.length
					: !!wrapper.supplierIds?.includes(key),
		},
	});
	const filterOf = (
		name: "use" | "stock" | "supplier",
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
	const wrappers = () => {
		const list = searched().filter((w) => fitsFacets(w, facets()));
		const by = search().sort;
		if (!by) return list;
		const sign = by.endsWith("-desc") ? -1 : 1;
		return [...list].sort((a, b) =>
			by.startsWith("price")
				? sign * (a.price - b.price) || a.name.localeCompare(b.name)
				: sign * a.name.localeCompare(b.name),
		);
	};

	const pageSize = () => search().perPage ?? PAGE_SIZES[0];
	const pageCount = () =>
		Math.max(1, Math.ceil(wrappers().length / pageSize()));
	// Past the end (say, after a delete) shows the last page.
	const page = () => Math.min(search().page ?? 1, pageCount());
	const shown = () =>
		wrappers().slice((page() - 1) * pageSize(), page() * pageSize());
	const goToPage = (n: number) => {
		setSearch({ page: n > 1 ? n : undefined });
		window.scrollTo({ top: 0 });
	};

	const setEnabled = async (wrapper: CustomWrapper, enabled: boolean) => {
		try {
			await setWrapperEnabledFn({ data: { id: wrapper.id, enabled } });
		} catch (error) {
			toastError(error);
		}
		await router.invalidate();
	};

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Wrappers"
				description="Shoppers pick one for each bouquet they build. A price of 0 shows as “Free”."
				actions={
					<>
						<WrapperImport wrappers={all()} />
						<Link
							to="/admin/wrappers/$wrapperId"
							params={{ wrapperId: "new" }}
							class={adminButton.primary}
						>
							+ Add wrapper
						</Link>
					</>
				}
			/>
			<ListToolbar
				query={search().q ?? ""}
				onQuery={(q) => setSearch({ q: q || undefined })}
				placeholder="Wrapper name, code or supplier"
				filters={[
					filterOf("use", "Custom bouquets", [
						{ key: "custom", label: "Offered" },
						{ key: "off", label: "Not offered" },
					]),
					filterOf("stock", "Stock", [
						{ key: "low", label: `Low (${LOW_STOCK_THRESHOLD} or fewer)` },
						{ key: "sold-out", label: "Sold out" },
						{ key: "not-counted", label: "Not counted" },
					]),
					filterOf("supplier", "Supplier", [
						...loaded().suppliers.map((supplier) => ({
							key: supplier.id,
							label: supplier.name,
						})),
						{ key: "none", label: "No supplier" },
					]),
				]}
				sort={{
					value: search().sort ?? "",
					options: [
						{ value: "", label: "Builder order" },
						{ value: "name", label: "Name, A–Z" },
						{ value: "name-desc", label: "Name, Z–A" },
						{ value: "price", label: "Price, low to high" },
						{ value: "price-desc", label: "Price, high to low" },
					],
					onChange: (sort) =>
						setSearch({ sort: (sort || undefined) as WrappersSearch["sort"] }),
				}}
				summary={
					filtered()
						? `${wrappers().length} of ${all().length} wrappers`
						: `${all().length} wrappers`
				}
				filtered={filtered()}
				onClear={() =>
					setSearch({
						q: undefined,
						use: undefined,
						stock: undefined,
						supplier: undefined,
					})
				}
			/>
			<section class={adminCard}>
				<Show
					when={wrappers().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">
							{all().length ? "No wrappers match these filters." : "None yet."}
						</p>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={shown()}>
							{(wrapper) => (
								<li class="flex flex-wrap items-center gap-4 px-5 py-4">
									<Show
										when={wrapper.image}
										fallback={
											<span
												aria-hidden="true"
												class="size-14 shrink-0 rounded-lg border border-black/10"
												style={{
													background: swatchColors(wrapperColors(wrapper)),
												}}
											/>
										}
									>
										{(src) => (
											<ZoomableImage
												src={src()}
												alt={`${wrapper.name} wrapper`}
												hoverPreview
												class="size-14 shrink-0 rounded-lg border border-black/10 object-cover"
											/>
										)}
									</Show>
									<div class="min-w-0 flex-1 basis-48">
										<Link
											to="/admin/wrappers/$wrapperId"
											params={{ wrapperId: wrapper.id }}
											class="font-medium underline-offset-2 hover:underline"
										>
											{wrapper.name}
										</Link>
										<Show when={wrapper.code && wrapper.code !== wrapper.name}>
											<span class="ml-2 font-mono text-xs text-petal-900/55">
												{wrapper.code}
											</span>
										</Show>
										<p class="text-sm text-petal-900/65 tabular-nums">
											{wrapper.price === 0
												? "Free"
												: formatPrice(wrapper.price, "PHP")}{" "}
											·{" "}
											<span
												class={cn(
													wrapper.stock === 0 && "text-error-foreground",
													wrapper.stock !== undefined &&
														wrapper.stock > 0 &&
														wrapper.stock <= LOW_STOCK_THRESHOLD &&
														"text-warning-foreground",
												)}
											>
												{wrapper.stock === undefined
													? "Stock not counted"
													: wrapper.stock === 0
														? "Sold out"
														: `${wrapper.stock} on hand`}
											</span>
											<Show when={wrapper.stockActual !== undefined}>
												{" "}
												· {wrapper.stockActual} actual
											</Show>
										</p>
										<Show when={supplierNames(wrapper).length > 0}>
											<p class="text-xs text-petal-900/55">
												From {joinNames(supplierNames(wrapper))}
											</p>
										</Show>
									</div>
									<div class="flex w-44 items-center gap-2.5">
										<span
											aria-hidden="true"
											class="size-8 shrink-0 rounded-full border border-black/15"
											style={{
												background: swatchColors(wrapperColors(wrapper)),
											}}
										/>
										<span class="grid grid-cols-2 gap-x-2 font-mono text-xs text-petal-900/65">
											<For each={wrapperColors(wrapper)}>
												{(color) => <span>{color}</span>}
											</For>
										</span>
									</div>
									<div class="flex items-center gap-3">
										<Toggle
											label="Offered"
											checked={wrapper.enabled}
											onChange={(checked) => void setEnabled(wrapper, checked)}
										/>
										<Link
											to="/admin/wrappers/$wrapperId"
											params={{ wrapperId: wrapper.id }}
											class={adminButton.secondary}
										>
											Edit
										</Link>
									</div>
								</li>
							)}
						</For>
					</ul>
					<ListPager
						page={page()}
						pageCount={pageCount()}
						pageSize={pageSize()}
						pageSizes={PAGE_SIZES}
						onPage={goToPage}
						onPageSize={(perPage) =>
							setSearch({
								perPage: perPage === PAGE_SIZES[0] ? undefined : perPage,
							})
						}
					/>
				</Show>
			</section>
		</div>
	);
}
