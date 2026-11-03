import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";

import { DateRangeFilter } from "~/components/admin/date-range-filter";
import {
	adminButton,
	adminCard,
	adminInput,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { CompanyLabel } from "~/components/order/company-label";
import {
	OrderStatusPill,
	PaymentStatusPill,
	paymentStatusClass,
	paymentStatusLabel,
} from "~/components/order/payment-status";
import { printDedicationCard } from "~/components/order/print-card";
import { FacetFilter } from "~/components/ui/facet-filter";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { orderColor } from "~/lib/cadets";
import { cashTotal, formatBills } from "~/lib/custom-bouquet";
import { formatRecipeItem, stemCount } from "~/lib/flowers";
import {
	FACETS,
	isFiltering,
	type OrdersSearch,
	PAGE_SIZES,
	typeKeys,
	typeParam,
	validateOrdersSearch,
} from "~/lib/order-filters";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import type { PricedLine } from "~/lib/pricing";
import { formatPrice } from "~/lib/product";
import { joinList, parseList } from "~/lib/shop-filters";
import { cn, SEARCH_DEBOUNCE_MS } from "~/lib/utils";
import {
	listAdminOrderRows,
	markOrderTest,
	moveOrder,
	type OrderActionResult,
	reviewOrderPayment,
	updateWrapperStatus,
} from "~/server/admin/orders";
import {
	BOARD_STAGES,
	canStartMaking,
	isPaymentSettled,
	type Order,
	PAYMENT_STATUSES,
	type PaymentStatus,
	STAGE_LABELS,
	WRAPPER_STATUS_LABELS,
	WRAPPER_STATUSES,
	type WrapperStatus,
} from "~/types/order";

/** The stages an order can be moved to from its row. */
const ROW_STAGES = BOARD_STAGES;
type RowStage = (typeof ROW_STAGES)[number];

const STAGE_CLASS: Record<RowStage, string> = {
	new: "bg-petal-100 text-petal-700",
	making: "bg-warning text-warning-foreground",
	done: "bg-success text-success-foreground",
};

const WRAPPER_CLASS: Record<WrapperStatus, string> = {
	todo: "bg-petal-100 text-petal-700",
	in_progress: "bg-warning text-warning-foreground",
	made: "bg-success text-success-foreground",
};

export const Route = createFileRoute("/admin/_dashboard/orders/")({
	validateSearch: validateOrdersSearch,
	loaderDeps: ({ search }) => search,
	loader: ({ deps, abortController }) =>
		listAdminOrderRows({ signal: abortController.signal, data: deps }),
	component: OrdersPage,
});

/** Page numbers to offer: the ends, and a couple either side of this one. */
function pageList(page: number, count: number) {
	const pages: (number | "…")[] = [];
	for (let n = 1; n <= count; n++) {
		if (n === 1 || n === count || Math.abs(n - page) <= 1) pages.push(n);
		else if (pages.at(-1) !== "…") pages.push("…");
	}
	return pages;
}

function OrdersPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const loading = useRouterState({
		select: (state) => state.status === "pending",
	});
	let scroller: HTMLDivElement | undefined;

	/** Any change of filter starts again from the first page. */
	const setSearch = (patch: Partial<OrdersSearch>) =>
		navigate({
			search: (prev) => ({ ...prev, page: undefined, ...patch }),
			replace: true,
			resetScroll: false,
		});
	const goToPage = (page: number) => {
		setSearch({ page: page > 1 ? page : undefined });
		scroller?.scrollTo({ top: 0 });
	};

	// The box shows each keystroke; the list and address follow a pause.
	const [query, setQuery] = createSignal(search().q ?? "");
	let searchBox: HTMLInputElement | undefined;
	createEffect(
		on(
			() => search().q,
			(value) => {
				// An older search landing late mustn't undo what's typed since.
				if (document.activeElement !== searchBox) setQuery(value ?? "");
			},
			{ defer: true },
		),
	);
	let debounce: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounce));
	const updateQuery = (value: string) => {
		setQuery(value);
		clearTimeout(debounce);
		debounce = setTimeout(
			() => setSearch({ q: value.trim() || undefined }),
			SEARCH_DEBOUNCE_MS,
		);
	};
	const resetFilters = () => {
		clearTimeout(debounce);
		setQuery("");
		setSearch({
			...Object.fromEntries(FACETS.map((facet) => [facet.id, undefined])),
			from: undefined,
			to: undefined,
			q: undefined,
		});
	};

	const stageTabs = () => {
		const stages = data().options.stage;
		return [
			{
				key: undefined,
				label: "All",
				count: stages.reduce((sum, option) => sum + option.count, 0),
			},
			...stages,
		];
	};
	const facetOptions = (id: (typeof FACETS)[number]["id"]) => {
		const options = data().options[id];
		return id === "payment"
			? options.map((option) => ({
					...option,
					label: paymentStatusLabel(option.key as PaymentStatus),
				}))
			: options;
	};
	const firstRow = () => (data().page - 1) * data().pageSize + 1;
	const lastRow = () => Math.min(data().page * data().pageSize, data().total);

	const router = useRouter();
	const [marking, setMarking] = createSignal<string | null>(null);
	const markTest = async (id: string, isTest: boolean) => {
		if (marking()) return;
		setMarking(id);
		try {
			const result = await markOrderTest({ data: { id, isTest } });
			if (!result.ok) throw new Error(result.message);
			toastSuccess(
				isTest
					? "Marked as a test. It won’t count in reports."
					: "Now a real order again.",
			);
			await router.invalidate();
		} catch (error) {
			toastError(error);
		} finally {
			setMarking(null);
		}
	};

	return (
		<div>
			<PageHeader
				title="Orders"
				description="Every bouquet ordered, colored by company. Change a status right in its row, or open the order to check its payment."
				actions={
					<Link to="/admin/orders/new" class={adminButton.primary}>
						+ Add custom order
					</Link>
				}
			/>

			<nav
				aria-label="Filter by status"
				class="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1"
			>
				<For each={stageTabs()}>
					{(tab) => {
						const active = () => search().stage === tab.key;
						return (
							<button
								type="button"
								onClick={() => setSearch({ stage: tab.key })}
								aria-current={active() ? "page" : undefined}
								class={cn(
									"inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
									active()
										? "bg-petal-700 font-medium text-white"
										: "bg-white text-petal-900/70 hover:bg-petal-100",
								)}
							>
								{tab.label}
								<span
									class={cn(
										"rounded-full px-1.5 text-xs tabular-nums",
										active() ? "bg-white/20" : "bg-petal-100 text-petal-900/60",
									)}
								>
									{tab.count.toLocaleString()}
								</span>
							</button>
						);
					}}
				</For>
			</nav>

			<div class="mb-3 flex flex-wrap items-center gap-2">
				<label class="flex h-10 w-full items-center gap-2 rounded-xl border border-petal-200 bg-white px-3 transition-colors focus-within:border-petal-500 focus-within:ring-2 focus-within:ring-petal-500/30 sm:w-72">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						class="size-4 shrink-0 text-petal-900/45"
					>
						<circle cx="11" cy="11" r="6.5" />
						<path d="m20 20-4.2-4.2" />
					</svg>
					<span class="sr-only">Search orders</span>
					<input
						ref={searchBox}
						type="search"
						value={query()}
						onInput={(e) => updateQuery(e.currentTarget.value)}
						placeholder="Name, company, class, order or ref no."
						class="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-petal-900/40 sm:text-sm"
					/>
				</label>
				<DateRangeFilter
					from={search().from}
					to={search().to}
					onChange={(from, to) => setSearch({ from, to })}
				/>
				<For each={FACETS}>
					{(facet) => (
						<Show when={facetOptions(facet.id).length}>
							<FacetFilter
								label={facet.label}
								options={facetOptions(facet.id)}
								selected={
									facet.id === "type"
										? typeKeys(search().type)
										: parseList(search()[facet.id])
								}
								onChange={(chosen) =>
									setSearch({
										[facet.id]:
											facet.id === "type"
												? typeParam(chosen)
												: joinList(chosen),
									})
								}
							/>
						</Show>
					)}
				</For>
				<Show when={isFiltering(search())}>
					<button
						type="button"
						onClick={resetFilters}
						class="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-petal-900/70 transition-colors outline-none hover:bg-petal-100 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						Reset filters
						<span aria-hidden="true">✕</span>
					</button>
				</Show>
			</div>

			<div class="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-petal-900/65">
				<p aria-live="polite">
					<Show when={data().total} fallback="No bouquets">
						Showing{" "}
						<span class="font-medium text-petal-900 tabular-nums">
							{firstRow().toLocaleString()}–{lastRow().toLocaleString()}
						</span>{" "}
						of{" "}
						<span class="font-medium text-petal-900 tabular-nums">
							{data().total.toLocaleString()}
						</span>{" "}
						{data().total === 1 ? "bouquet" : "bouquets"}
					</Show>
				</p>
				<label class="flex items-center gap-2">
					Sort
					<select
						value={search().sort ?? "newest"}
						onChange={(e) =>
							setSearch({
								sort: e.currentTarget.value === "oldest" ? "oldest" : undefined,
							})
						}
						class={cn(adminInput, "h-9 w-auto py-0 pr-8 sm:h-9")}
					>
						<option value="newest">Latest order on top</option>
						<option value="oldest">First order on top</option>
					</select>
				</label>
			</div>

			<div class={cn(adminCard, "overflow-hidden")}>
				{/*
				 * The table scrolls inside a screen-high box, so its header and its
				 * side-scrollbar are always in view, however many rows there are.
				 */}
				<div
					ref={scroller}
					aria-busy={loading()}
					class={cn(
						"relative overflow-x-auto transition-opacity md:max-h-[calc(100svh-15rem)] md:min-h-80 md:overflow-y-auto",
						loading() && "opacity-60",
					)}
				>
					<table class="stack-table w-full text-left text-sm md:min-w-[1780px]">
						<thead class="sticky top-0 z-10 bg-white text-xs uppercase tracking-wide text-petal-900/55 shadow-[0_1px_0_var(--color-petal-100)]">
							<tr>
								<th class="px-3 py-3 pl-5 font-medium">Order</th>
								<th class="px-3 py-3 font-medium">Name</th>
								<th class="px-3 py-3 font-medium">Company</th>
								<th class="px-3 py-3 font-medium">Class</th>
								<th class="px-3 py-3 font-medium">Status</th>
								<th class="px-3 py-3 font-medium">Wrapper status</th>
								<th class="px-3 py-3 text-right font-medium">Price</th>
								<th class="px-3 py-3 font-medium">Payment</th>
								<th class="px-3 py-3 font-medium">Method</th>
								<th class="px-3 py-3 font-medium">Ref no.</th>
								<th class="px-3 py-3 font-medium">Style</th>
								<th class="px-3 py-3 font-medium">Photo</th>
								<th class="px-3 py-3 font-medium">Flowers</th>
								<th class="px-3 py-3 font-medium">Wrapper</th>
								<th class="px-3 py-3 font-medium">Notes / Dedication</th>
							</tr>
						</thead>
						<tbody>
							<For
								each={data().rows}
								fallback={
									<tr>
										<td
											colSpan={15}
											data-wide
											class="px-4 py-12 text-center text-petal-900/55"
										>
											<Show
												when={isFiltering(search())}
												fallback="No orders here yet."
											>
												No bouquets match these filters.{" "}
												<button
													type="button"
													onClick={resetFilters}
													class="font-medium text-petal-700 underline underline-offset-2"
												>
													Reset filters
												</button>
											</Show>
										</td>
									</tr>
								}
							>
								{({ order, line, index }) => {
									const details = order.details;
									const color = orderColor(details.company, details.className);
									return (
										<tr
											// The whole row opens the order; the order number stays a
											// real link for keyboard users and opening in a new tab.
											onClick={(event) => {
												if (
													(event.target as HTMLElement).closest(
														"a, button, select",
													)
												)
													return;
												// Don't hijack selecting text to copy it.
												if (window.getSelection()?.toString()) return;
												if (event.ctrlKey || event.metaKey) {
													window.open(`/admin/orders/${order.id}`, "_blank");
													return;
												}
												void navigate({
													to: "/admin/orders/$orderId",
													params: { orderId: order.id },
												});
											}}
											class={cn(
												"cursor-pointer border-b border-black/5 align-top transition-[filter] hover:brightness-[0.95]",
												order.isTest && "opacity-60",
											)}
											style={{
												"background-color": color ? `${color}2e` : "#ffffff",
											}}
										>
											<td
												data-wide
												class="px-5 py-2 md:px-3 md:py-3 pl-5"
												style={{
													// Company stripe; the outline keeps Bravo's white visible.
													"box-shadow": color
														? `inset 6px 0 0 ${color}, inset 7px 0 0 rgb(0 0 0 / 0.15)`
														: undefined,
												}}
											>
												<Link
													to="/admin/orders/$orderId"
													params={{ orderId: order.id }}
													class="font-semibold text-petal-700 tabular-nums underline-offset-2 hover:underline"
												>
													#{order.number}
												</Link>
												<Show when={order.isTest}>
													<span class="ml-1.5 rounded-full bg-petal-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
														Test
													</span>
												</Show>
												<p class="whitespace-nowrap text-xs text-petal-900/55">
													{new Date(order.createdAt).toLocaleString("en-PH", {
														timeZone: "Asia/Manila",
														month: "short",
														day: "numeric",
														hour: "numeric",
														minute: "2-digit",
													})}
												</p>
												<Show when={order.cancelReason}>
													{(reason) => (
														<p class="max-w-40 text-xs text-error-foreground">
															By customer: {reason()}
														</p>
													)}
												</Show>
												<button
													type="button"
													disabled={marking() === order.id}
													onClick={() => markTest(order.id, !order.isTest)}
													class="mt-1 whitespace-nowrap py-1 text-xs font-medium text-petal-700 underline underline-offset-2 hover:text-petal-900 disabled:opacity-50"
												>
													{order.isTest ? "Not a test" : "Mark as test"}
												</button>
											</td>
											<td
												data-label="Name"
												class="px-5 py-2 md:px-3 md:py-3 font-medium"
											>
												{details.lastName
													? `${details.lastName}, ${details.firstName}`
													: details.fullName}
											</td>
											<td
												data-label="Company"
												class="px-5 py-2 md:px-3 md:py-3 font-medium"
											>
												<Show when={details.company} fallback="—">
													<CompanyLabel
														company={details.company}
														className=""
													/>
												</Show>
											</td>
											<td data-label="Class" class="px-5 py-2 md:px-3 md:py-3">
												{details.className || "—"}
											</td>
											<td data-label="Status" class="px-5 py-2 md:px-3 md:py-3">
												<OrderStageSelect order={order} />
											</td>
											<td
												data-label="Wrapper status"
												class="px-5 py-2 md:px-3 md:py-3"
											>
												<WrapperStatusSelect
													order={order}
													line={line}
													index={index}
												/>
											</td>
											<td
												data-label="Price"
												class="px-5 py-2 md:px-3 md:py-3 font-medium tabular-nums md:text-right"
											>
												{formatPrice(line.lineTotal, order.currency)}
											</td>
											<td
												data-label="Payment"
												class="px-5 py-2 md:px-3 md:py-3"
											>
												<PaymentStatusSelect order={order} />
												<Show
													when={
														order.payment.amountPaid !== undefined &&
														!isPaymentSettled(order.payment.status)
													}
												>
													<p class="mt-1 whitespace-nowrap text-xs tabular-nums text-petal-900/65">
														{formatPrice(
															order.payment.amountPaid ?? 0,
															order.currency,
														)}{" "}
														paid
													</p>
												</Show>
											</td>
											<td data-label="Method" class="px-5 py-2 md:px-3 md:py-3">
												{PAYMENT_METHOD_LABELS[order.payment.method]}
											</td>
											<td
												data-label="Ref no."
												class="px-5 py-2 md:px-3 md:py-3 font-mono text-xs"
											>
												{order.payment.referenceNumber ?? "—"}
											</td>
											<td data-label="Style" class="px-5 py-2 md:px-3 md:py-3">
												<span class="font-semibold">{line.sku}</span>
												<Show when={line.quantity > 1}>
													<span class="ml-1 text-xs font-semibold">
														× {line.quantity}
													</span>
												</Show>
												<p class="text-xs text-petal-900/60">
													{line.title} · {line.colorName}
												</p>
											</td>
											<td data-label="Photo" class="px-5 py-2 md:px-3 md:py-3">
												<Show when={line.image} fallback="—">
													{(src) => (
														<ZoomableImage
															src={src()}
															alt={`${line.title}, ${line.colorName}`}
															caption={`#${order.number} · ${line.sku}`}
															hoverPreview
															class="size-14 rounded-lg border border-black/10 bg-white object-cover"
														/>
													)}
												</Show>
											</td>
											<td
												data-label="Flowers"
												data-wide
												class="px-5 py-2 md:px-3 md:py-3"
											>
												<Show when={line.custom?.referenceImages?.length}>
													<span class="mb-1 flex gap-1">
														<For each={line.custom?.referenceImages}>
															{(url, index) => (
																<ZoomableImage
																	src={url}
																	alt={`Reference photo ${index() + 1}`}
																	caption={`#${order.number} · reference ${index() + 1}`}
																	hoverPreview
																	class="size-9 rounded-md border border-black/10 object-cover"
																/>
															)}
														</For>
													</span>
												</Show>
												<Show when={line.custom?.bills?.length}>
													<p class="font-semibold tabular-nums">
														{formatPrice(
															cashTotal(line.custom?.bills),
															order.currency,
														)}{" "}
														cash
													</p>
													<p class="mb-1 whitespace-nowrap text-xs tabular-nums text-petal-900/70">
														{formatBills(line.custom?.bills)}
													</p>
												</Show>
												<Show
													when={line.recipe?.length}
													fallback={line.custom?.bills?.length ? null : "—"}
												>
													<Show when={stemCount(line.recipe)}>
														{(count) => (
															<p class="font-semibold tabular-nums">
																{count()} flowers
															</p>
														)}
													</Show>
													<ul class="text-xs text-petal-900/70">
														<For each={line.recipe}>
															{(item) => (
																<li class="whitespace-nowrap tabular-nums">
																	{formatRecipeItem(item)}
																</li>
															)}
														</For>
													</ul>
												</Show>
											</td>
											<td
												data-label="Wrapper"
												class="px-5 py-2 md:px-3 md:py-3"
											>
												{line.wrapperColor || "—"}
											</td>
											<td
												data-label="Notes / Dedication"
												data-wide
												class="px-5 py-2 md:px-3 md:py-3 text-xs md:max-w-64"
											>
												<Show
													when={details.notes || details.addDedication}
													fallback="—"
												>
													<Show when={details.notes}>
														<p class="whitespace-pre-line">
															<span class="font-semibold">Notes:</span>{" "}
															{details.notes}
														</p>
													</Show>
													<Show when={details.addDedication}>
														<button
															type="button"
															onClick={() => printDedicationCard(order.id)}
															title="Print this dedication card (A5)"
															class="-mx-1 mt-1 block w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left whitespace-pre-line outline-none hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-petal-500"
														>
															<span class="font-semibold">
																To {details.dedicationFor || "—"}:
															</span>{" "}
															“{details.dedicationMessage}”
															<span class="mt-0.5 block font-medium text-petal-700">
																🖨 Print card
															</span>
														</button>
													</Show>
												</Show>
											</td>
										</tr>
									);
								}}
							</For>
						</tbody>
					</table>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-3 border-t border-petal-100 px-4 py-3 text-sm text-petal-900/65">
					<label class="flex items-center gap-2">
						Rows per page
						<select
							value={data().pageSize}
							onChange={(e) =>
								setSearch({ perPage: Number(e.currentTarget.value) })
							}
							class={cn(adminInput, "h-9 w-auto py-0 pr-8 sm:h-9")}
						>
							<For each={PAGE_SIZES}>
								{(size) => <option value={size}>{size}</option>}
							</For>
						</select>
					</label>
					<Show when={data().pageCount > 1}>
						<nav aria-label="Pages" class="flex items-center gap-1">
							<button
								type="button"
								disabled={data().page <= 1}
								onClick={() => goToPage(data().page - 1)}
								class={PAGE_BUTTON}
							>
								<span aria-hidden="true">←</span> Previous
							</button>
							<For each={pageList(data().page, data().pageCount)}>
								{(page) => (
									<Show
										when={typeof page === "number" && page}
										fallback={
											<span aria-hidden="true" class="px-1">
												…
											</span>
										}
									>
										{(n) => (
											<button
												type="button"
												onClick={() => goToPage(n())}
												aria-current={n() === data().page ? "page" : undefined}
												aria-label={`Page ${n()}`}
												class={cn(
													PAGE_BUTTON,
													"hidden min-w-9 justify-center tabular-nums sm:inline-flex",
													n() === data().page &&
														"bg-petal-700 font-medium text-white hover:bg-petal-700",
												)}
											>
												{n()}
											</button>
										)}
									</Show>
								)}
							</For>
							<span class="px-2 tabular-nums sm:hidden">
								{data().page} / {data().pageCount}
							</span>
							<button
								type="button"
								disabled={data().page >= data().pageCount}
								onClick={() => goToPage(data().page + 1)}
								class={PAGE_BUTTON}
							>
								Next <span aria-hidden="true">→</span>
							</button>
						</nav>
					</Show>
				</div>
			</div>
		</div>
	);
}

const PAGE_BUTTON =
	"inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-petal-900 transition-colors outline-none hover:bg-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500 disabled:pointer-events-none disabled:opacity-40";

/** A status changed right in its row. Saves as soon as it's picked. */
function RowSelect<T extends string>(props: {
	label: string;
	value: T;
	options: { value: T; label: string; disabled?: boolean }[];
	class: string;
	onSave: (value: T) => Promise<OrderActionResult>;
	saved: (label: string) => string;
}) {
	const router = useRouter();
	const [saving, setSaving] = createSignal(false);

	const save = async (select: HTMLSelectElement) => {
		const value = select.value as T;
		setSaving(true);
		try {
			const result = await props.onSave(value);
			if (!result.ok) throw new Error(result.message);
			const option = props.options.find((o) => o.value === value);
			toastSuccess(props.saved(option?.label ?? value));
			await router.invalidate();
		} catch (error) {
			select.value = props.value;
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<select
			aria-label={props.label}
			disabled={saving()}
			onChange={(e) => void save(e.currentTarget)}
			class={cn(
				"h-10 max-w-full cursor-pointer rounded-full border-0 px-2.5 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-petal-500 disabled:opacity-50 sm:h-8 sm:text-xs",
				props.class,
			)}
		>
			<For each={props.options}>
				{(option) => (
					<option
						value={option.value}
						selected={option.value === props.value}
						disabled={option.disabled}
					>
						{option.label}
					</option>
				)}
			</For>
		</select>
	);
}

function OrderStageSelect(props: { order: Order }) {
	const stage = () => props.order.stage as RowStage;
	return (
		<Show
			// Cancelling restocks and can't be undone: it stays on the order page,
			// behind its confirmation.
			when={props.order.stage !== "cancelled"}
			fallback={<OrderStatusPill status="cancelled" />}
		>
			<RowSelect
				label={`Status of order ${props.order.number}`}
				value={stage()}
				options={ROW_STAGES.map((value) => ({
					value,
					label: STAGE_LABELS[value],
					// Unpaid orders stay in "New orders" until the payment is settled
					// (or, for orders added from a chat, a deposit is in).
					disabled: value !== "new" && !canStartMaking(props.order.payment),
				}))}
				class={STAGE_CLASS[stage()]}
				onSave={(value) =>
					moveOrder({ data: { id: props.order.id, stage: value } })
				}
				saved={(label) => `Order #${props.order.number}: ${label}.`}
			/>
		</Show>
	);
}

function PaymentStatusSelect(props: { order: Order }) {
	const status = () => props.order.payment.status;
	return (
		<Show
			// Card payments are settled at checkout, and cancelled orders are closed.
			when={
				props.order.payment.method !== "card" &&
				props.order.stage !== "cancelled"
			}
			fallback={<PaymentStatusPill status={status()} />}
		>
			<RowSelect
				label={`Payment status for order ${props.order.number}`}
				value={status()}
				options={PAYMENT_STATUSES.map((value) => ({
					value,
					label: paymentStatusLabel(value),
					// Past "New orders" a payment has to stay settled.
					disabled: props.order.stage !== "new" && !isPaymentSettled(value),
				}))}
				class={paymentStatusClass(status())}
				onSave={(value) =>
					reviewOrderPayment({ data: { id: props.order.id, status: value } })
				}
				saved={(label) => `Order #${props.order.number}: ${label}.`}
			/>
		</Show>
	);
}

function WrapperStatusSelect(props: {
	order: Order;
	line: PricedLine;
	index: number;
}) {
	const status = () => props.line.wrapperStatus ?? "todo";
	return (
		<Show when={props.line.wrapperColor} fallback="—">
			<Show
				when={props.order.stage !== "cancelled"}
				fallback={WRAPPER_STATUS_LABELS[status()]}
			>
				<RowSelect
					label={`Wrapper status for ${props.line.sku}, order ${props.order.number}`}
					value={status()}
					options={WRAPPER_STATUSES.map((value) => ({
						value,
						label: WRAPPER_STATUS_LABELS[value],
					}))}
					class={WRAPPER_CLASS[status()]}
					onSave={(value) =>
						updateWrapperStatus({
							data: { id: props.order.id, line: props.index, status: value },
						})
					}
					saved={(label) => `${props.line.sku} wrapper: ${label}.`}
				/>
			</Show>
		</Show>
	);
}
