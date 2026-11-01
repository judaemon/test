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
import type { FlowerColor, FlowerRecord } from "~/lib/custom-bouquet";
import { formatPrice, LOW_STOCK_THRESHOLD } from "~/lib/product";
import { cn } from "~/lib/utils";
import { listFlowersAdmin, setFlowerEnabledFn } from "~/server/admin/flowers";

const SORTS = ["name", "name-desc", "price", "price-desc", "used"] as const;

/** Search, filters and sort, kept in the address so Back returns to them. */
interface FlowersSearch {
	q?: string;
	use?: "custom" | "recipes";
	stock?: "low" | "sold-out" | "counted" | "not-counted";
	/** Missing: the builder's order. */
	sort?: (typeof SORTS)[number];
}

export const Route = createFileRoute("/admin/_dashboard/flowers/")({
	validateSearch: (search: Record<string, unknown>): FlowersSearch => ({
		q: textParam(search, "q"),
		use: choiceParam(search, "use", ["custom", "recipes"] as const),
		stock: choiceParam(search, "stock", [
			"low",
			"sold-out",
			"counted",
			"not-counted",
		] as const),
		sort: choiceParam(search, "sort", SORTS),
	}),
	loader: () => listFlowersAdmin(),
	component: FlowersPage,
});

/** The cheapest color, for sorting by price. */
const lowestPrice = (flower: FlowerRecord) =>
	Math.min(...flower.colors.map((c) => c.price));

function stockLabel(color: FlowerColor) {
	if (color.stock === undefined) return "Not counted";
	if (color.stock === 0) return "Sold out";
	return `${color.stock} left`;
}

function FlowersPage() {
	const all = Route.useLoaderData();
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const setSearch = (patch: Partial<FlowersSearch>) =>
		navigate({
			search: (prev) => ({ ...prev, ...patch }),
			replace: true,
			resetScroll: false,
		});
	const filtered = () => !!(search().q || search().use || search().stock);
	const keep = (flower: FlowerRecord) => {
		const { q, use, stock } = search();
		if (
			!matchesQuery(
				q,
				`${flower.name} ${flower.kind.hint ?? ""} ${flower.colors.map((c) => c.name).join(" ")}`,
			)
		)
			return false;
		if (use && flower.enabled !== (use === "custom")) return false;
		const counted = flower.colors.filter((c) => c.stock !== undefined);
		if (stock === "counted" && counted.length === 0) return false;
		if (stock === "not-counted" && counted.length === flower.colors.length)
			return false;
		if (stock === "sold-out" && !counted.some((c) => c.stock === 0))
			return false;
		if (
			stock === "low" &&
			!counted.some((c) => (c.stock ?? 0) <= LOW_STOCK_THRESHOLD)
		)
			return false;
		return true;
	};
	const flowers = () => {
		const list = all().filter(keep);
		const by = search().sort;
		if (!by) return list;
		const sign = by.endsWith("-desc") ? -1 : 1;
		return [...list].sort((a, b) =>
			by === "used"
				? b.usedIn - a.usedIn || a.name.localeCompare(b.name)
				: by.startsWith("price")
					? sign * (lowestPrice(a) - lowestPrice(b)) ||
						a.name.localeCompare(b.name)
					: sign * a.name.localeCompare(b.name),
		);
	};

	const setEnabled = async (flower: FlowerRecord, enabled: boolean) => {
		try {
			await setFlowerEnabledFn({ data: { id: flower.id, enabled } });
		} catch (error) {
			toastError(error);
		}
		await router.invalidate();
	};

	const FlowerItem = (props: { flower: FlowerRecord }) => (
		<li class="flex flex-wrap items-start gap-4 px-5 py-4">
			<Show
				when={props.flower.image}
				fallback={
					<span class="flex size-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-[10px] text-petal-900/45">
						No photo
					</span>
				}
			>
				{(src) => (
					<ZoomableImage
						src={src()}
						alt={props.flower.name}
						hoverPreview
						class="size-14 shrink-0 rounded-lg border border-black/10 object-cover"
					/>
				)}
			</Show>
			<div class="min-w-0 flex-1 basis-56">
				<Link
					to="/admin/flowers/$flowerId"
					params={{ flowerId: props.flower.id }}
					class="font-medium underline-offset-2 hover:underline"
				>
					{props.flower.name}
				</Link>
				<span
					class={cn(
						"ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
						props.flower.enabled
							? "bg-sage-100 text-sage-600"
							: "bg-petal-50 text-petal-900/50",
					)}
				>
					{props.flower.enabled ? "Custom bouquets" : "Recipes only"}
				</span>
				<Show when={props.flower.kind.hint}>
					<p class="text-xs text-petal-900/55">{props.flower.kind.hint}</p>
				</Show>
				<ul class="mt-2 flex flex-wrap gap-1.5">
					<For each={props.flower.colors}>
						{(color) => (
							<li
								class={cn(
									"rounded-full border px-2.5 py-0.5 text-xs tabular-nums",
									!color.enabled
										? "border-petal-100 text-petal-900/40 line-through"
										: color.stock === 0
											? "border-error-foreground/30 bg-error text-error-foreground"
											: color.stock !== undefined &&
													color.stock <= LOW_STOCK_THRESHOLD
												? "border-warning-foreground/30 bg-warning text-warning-foreground"
												: "border-petal-200",
								)}
							>
								<Show when={props.flower.kind.colors}>
									<span class="font-medium">{color.name}</span> ·{" "}
								</Show>
								{formatPrice(color.price, "PHP")} · {stockLabel(color)}
							</li>
						)}
					</For>
				</ul>
				<Show when={props.flower.usedIn > 0}>
					<p class="mt-1.5 text-xs text-petal-900/55">
						In {props.flower.usedIn} signature bouquet{" "}
						{props.flower.usedIn === 1 ? "style" : "styles"}
					</p>
				</Show>
			</div>
			<div class="flex items-center gap-3">
				<Toggle
					label="Use in custom bouquets"
					checked={props.flower.enabled}
					onChange={(checked) => void setEnabled(props.flower, checked)}
				/>
				<Link
					to="/admin/flowers/$flowerId"
					params={{ flowerId: props.flower.id }}
					class={adminButton.secondary}
				>
					Edit
				</Link>
			</div>
		</li>
	);

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Flowers"
				description="Every flower the shop uses, with its colors, prices and stock. Flowers marked for custom bouquets can be picked in the bouquet builder; signature bouquet recipes can use any of them."
				actions={
					<Link
						to="/admin/flowers/$flowerId"
						params={{ flowerId: "new" }}
						class={adminButton.primary}
					>
						+ Add flower
					</Link>
				}
			/>
			<ListToolbar
				query={search().q ?? ""}
				onQuery={(q) => setSearch({ q: q || undefined })}
				placeholder="Flower, color or note"
				filters={[
					{
						label: "Custom bouquets",
						value: search().use ?? "",
						options: [
							{ value: "", label: "Used or not" },
							{ value: "custom", label: "Used in custom bouquets" },
							{ value: "recipes", label: "Recipes only" },
						],
						onChange: (use) =>
							setSearch({ use: (use || undefined) as FlowersSearch["use"] }),
					},
					{
						label: "Stock",
						value: search().stock ?? "",
						options: [
							{ value: "", label: "Any stock" },
							{ value: "low", label: `Low (${LOW_STOCK_THRESHOLD} or fewer)` },
							{ value: "sold-out", label: "A color sold out" },
							{ value: "counted", label: "Stock counted" },
							{ value: "not-counted", label: "A color not counted" },
						],
						onChange: (stock) =>
							setSearch({
								stock: (stock || undefined) as FlowersSearch["stock"],
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
						{ value: "used", label: "Most used in bouquets" },
					],
					onChange: (sort) =>
						setSearch({ sort: (sort || undefined) as FlowersSearch["sort"] }),
				}}
				summary={
					filtered()
						? `${flowers().length} of ${all().length} flowers`
						: `${all().length} flowers`
				}
				filtered={filtered()}
				onClear={() =>
					setSearch({ q: undefined, use: undefined, stock: undefined })
				}
			/>
			<section class={adminCard}>
				<Show
					when={flowers().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">
							{all().length ? "No flowers match these filters." : "None yet."}
						</p>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={flowers()}>
							{(flower) => <FlowerItem flower={flower} />}
						</For>
					</ul>
				</Show>
			</section>
		</div>
	);
}
