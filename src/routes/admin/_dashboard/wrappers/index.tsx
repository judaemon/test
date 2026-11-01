import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import {
	choiceParam,
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
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import type { CustomWrapper } from "~/lib/custom-bouquet";
import { formatPrice, LOW_STOCK_THRESHOLD } from "~/lib/product";
import { cn } from "~/lib/utils";
import {
	listWrappersAdmin,
	setWrapperEnabledFn,
} from "~/server/admin/wrappers";

const SORTS = ["name", "name-desc", "price", "price-desc"] as const;

/** Search, filters and sort, kept in the address so Back returns to them. */
interface WrappersSearch {
	q?: string;
	use?: "custom" | "off";
	stock?: "low" | "sold-out" | "not-counted";
	/** Missing: the builder's order. */
	sort?: (typeof SORTS)[number];
}

export const Route = createFileRoute("/admin/_dashboard/wrappers/")({
	validateSearch: (search: Record<string, unknown>): WrappersSearch => ({
		q: textParam(search, "q"),
		use: choiceParam(search, "use", ["custom", "off"] as const),
		stock: choiceParam(search, "stock", [
			"low",
			"sold-out",
			"not-counted",
		] as const),
		sort: choiceParam(search, "sort", SORTS),
	}),
	loader: () => listWrappersAdmin(),
	component: WrappersPage,
});

function WrappersPage() {
	const all = Route.useLoaderData();
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const setSearch = (patch: Partial<WrappersSearch>) =>
		navigate({
			search: (prev) => ({ ...prev, ...patch }),
			replace: true,
			resetScroll: false,
		});
	const filtered = () => !!(search().q || search().use || search().stock);
	const keep = (wrapper: CustomWrapper) => {
		const { q, use, stock } = search();
		if (!matchesQuery(q, wrapper.name)) return false;
		if (use && wrapper.enabled !== (use === "custom")) return false;
		if (stock === "not-counted") return wrapper.stock === undefined;
		if (stock === "sold-out") return wrapper.stock === 0;
		if (stock === "low")
			return (
				wrapper.stock !== undefined && wrapper.stock <= LOW_STOCK_THRESHOLD
			);
		return true;
	};
	const wrappers = () => {
		const list = all().filter(keep);
		const by = search().sort;
		if (!by) return list;
		const sign = by.endsWith("-desc") ? -1 : 1;
		return [...list].sort((a, b) =>
			by.startsWith("price")
				? sign * (a.price - b.price) || a.name.localeCompare(b.name)
				: sign * a.name.localeCompare(b.name),
		);
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
					<Link
						to="/admin/wrappers/$wrapperId"
						params={{ wrapperId: "new" }}
						class={adminButton.primary}
					>
						+ Add wrapper
					</Link>
				}
			/>
			<ListToolbar
				query={search().q ?? ""}
				onQuery={(q) => setSearch({ q: q || undefined })}
				placeholder="Wrapper name"
				filters={[
					{
						label: "Custom bouquets",
						value: search().use ?? "",
						options: [
							{ value: "", label: "Offered or not" },
							{ value: "custom", label: "Offered" },
							{ value: "off", label: "Not offered" },
						],
						onChange: (use) =>
							setSearch({ use: (use || undefined) as WrappersSearch["use"] }),
					},
					{
						label: "Stock",
						value: search().stock ?? "",
						options: [
							{ value: "", label: "Any stock" },
							{ value: "low", label: `Low (${LOW_STOCK_THRESHOLD} or fewer)` },
							{ value: "sold-out", label: "Sold out" },
							{ value: "not-counted", label: "Not counted" },
						],
						onChange: (stock) =>
							setSearch({
								stock: (stock || undefined) as WrappersSearch["stock"],
							}),
					},
				]}
				sort={{
					label: "Sort by",
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
					setSearch({ q: undefined, use: undefined, stock: undefined })
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
						<For each={wrappers()}>
							{(wrapper) => (
								<li class="flex flex-wrap items-center gap-4 px-5 py-4">
									<Show
										when={wrapper.image}
										fallback={
											<span
												aria-hidden="true"
												class="size-14 shrink-0 rounded-lg border border-black/10"
												style={{ background: wrapper.colorHex }}
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
										<p class="flex items-center gap-1.5 text-sm text-petal-900/65 tabular-nums">
											<span
												aria-hidden="true"
												class="size-3 rounded-full border border-black/15"
												style={{ background: wrapper.colorHex }}
											/>
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
														: `${wrapper.stock} left`}
											</span>
										</p>
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
				</Show>
			</section>
		</div>
	);
}
