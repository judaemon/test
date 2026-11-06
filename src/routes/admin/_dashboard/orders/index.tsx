import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/solid-router";
import {
	createEffect,
	createSignal,
	For,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { CancelOrderButton } from "~/components/admin/cancel-order";
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
import { hasCard, orderCards, orderMessages } from "~/lib/bouquet-messages";
import { orderColor } from "~/lib/cadets";
import { cashTotal, formatBills } from "~/lib/custom-bouquet";
import { formatRecipeItem, stemCount } from "~/lib/flowers";
import { canCancelOneBouquet } from "~/lib/order-edit";
import {
	FACETS,
	isFiltering,
	type OrdersSearch,
	typeKeys,
	typeParam,
	validateOrdersSearch,
} from "~/lib/order-filters";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { type PricedLine, tracksWrapper } from "~/lib/pricing";
import { formatPrice, preorderNote } from "~/lib/product";
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
import type { ArrangementSummary, OrderRow } from "~/server/order-rows";
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
	// The first rows only; the table loads the rest as it's scrolled.
	loader: ({ deps, abortController }) =>
		listAdminOrderRows({
			signal: abortController.signal,
			data: { ...deps, page: undefined },
		}),
	component: OrdersPage,
});

function OrdersPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const loading = useRouterState({
		select: (state) => state.status === "pending",
	});
	let scroller: HTMLDivElement | undefined;
	let sentinel: HTMLDivElement | undefined;

	/** Any change of filter starts again from the top. */
	const setSearch = (patch: Partial<OrdersSearch>) => {
		scroller?.scrollTo({ top: 0 });
		return navigate({
			search: (prev) => ({
				...prev,
				page: undefined,
				perPage: undefined,
				...patch,
			}),
			replace: true,
			resetScroll: false,
		});
	};

	// Infinite scroll: the loader brings the first rows, and each time the end
	// of the table comes into view the next lot is added under them.
	const [more, setMore] = createSignal<OrderRow[]>([]);
	const [pagesLoaded, setPagesLoaded] = createSignal(1);
	const [loadingMore, setLoadingMore] = createSignal(false);
	const [moreFailed, setMoreFailed] = createSignal(false);
	const rows = () => [...data().rows, ...more()];
	const hasMore = () => rows().length < data().total;
	const viewKey = () =>
		JSON.stringify({ ...search(), page: undefined, perPage: undefined });
	let shownKey = viewKey();
	// Bumped whenever the view changes, so a late answer for the old one is dropped.
	let generation = 0;
	const fetchPage = (page: number) =>
		listAdminOrderRows({ data: { ...search(), page } });
	createEffect(
		on(
			data,
			async () => {
				const key = viewKey();
				const keep = key === shownKey ? pagesLoaded() : 1;
				shownKey = key;
				const mine = ++generation;
				setMoreFailed(false);
				if (keep <= 1) {
					setMore([]);
					setPagesLoaded(1);
					return;
				}
				// The same view refreshed, e.g. after a status change in a row: load
				// as many rows as were on screen so nothing jumps.
				try {
					const pages = await Promise.all(
						Array.from({ length: keep - 1 }, (_, i) => fetchPage(i + 2)),
					);
					if (mine === generation) setMore(pages.flatMap((page) => page.rows));
				} catch {
					if (mine === generation) setMoreFailed(true);
				}
			},
			{ defer: true },
		),
	);
	const loadMore = async () => {
		if (loadingMore() || loading() || !hasMore()) return;
		const mine = generation;
		const next = pagesLoaded() + 1;
		setLoadingMore(true);
		setMoreFailed(false);
		try {
			const page = await fetchPage(next);
			if (mine !== generation) return;
			setMore((list) => [...list, ...page.rows]);
			setPagesLoaded(next);
		} catch {
			if (mine === generation) setMoreFailed(true);
		} finally {
			setLoadingMore(false);
		}
	};
	onMount(() => {
		if (!sentinel) return;
		// Starts loading a little before the end, so scrolling rarely waits.
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ rootMargin: "600px 0px" },
		);
		observer.observe(sentinel);
		onCleanup(() => observer.disconnect());
	});
	// A short first page can leave the end in view; keep filling until it isn't.
	createEffect(
		on([rows, loadingMore], () => {
			if (loadingMore() || !hasMore() || !sentinel) return;
			const box = sentinel.getBoundingClientRect();
			if (box.top < window.innerHeight + 600) void loadMore();
		}),
	);

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

			<ArrangementCards
				cards={data().summary}
				selected={parseList(search().arrangement)}
				onSelect={(key) => setSearch({ arrangement: key })}
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
							{rows().length.toLocaleString()}
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
								each={rows()}
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
												const target = event.target as HTMLElement;
												// Dialogs opened from a row aren't inside it, but their
												// clicks still bubble to it.
												if (!event.currentTarget.contains(target)) return;
												if (target.closest("a, button, select")) return;
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
												<Show when={order.cancelledBouquets.length > 0}>
													<p class="max-w-40 text-xs text-error-foreground">
														{order.cancelledBouquets.length} bouquet
														{order.cancelledBouquets.length === 1 ? "" : "s"}{" "}
														cancelled
													</p>
												</Show>
												<Show when={order.cancelReason}>
													{(reason) => (
														<p class="max-w-40 text-xs wrap-anywhere text-error-foreground">
															{order.cancelledBy ? "Reason" : "By customer"}:{" "}
															{reason()}
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
												<Show
													when={
														order.stage === "new" || order.stage === "making"
													}
												>
													<Show when={canCancelOneBouquet(order)}>
														<CancelOrderButton
															order={order}
															line={line}
															class="block whitespace-nowrap py-1 text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80"
															onCancelled={() => router.invalidate()}
														>
															Cancel this bouquet
														</CancelOrderButton>
													</Show>
													<CancelOrderButton
														order={order}
														class="block whitespace-nowrap py-1 text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80"
														onCancelled={() => router.invalidate()}
													>
														{order.itemCount > 1
															? "Cancel whole order"
															: "Cancel order"}
													</CancelOrderButton>
												</Show>
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
													{line.preorder ? ` · ${preorderNote(line)}` : ""}
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
													when={rowMessages(order, index).length > 0}
													fallback="—"
												>
													<ul class="flex flex-col gap-1.5 wrap-anywhere">
														<For each={rowMessages(order, index)}>
															{(entry) => (
																<li>
																	<Show when={(entry.of ?? 1) > 1}>
																		<p class="font-semibold text-petal-900/60">
																			Bouquet {(entry.unit ?? 0) + 1} of{" "}
																			{entry.of}
																		</p>
																	</Show>
																	<Show when={entry.note}>
																		<p class="whitespace-pre-line">
																			<span class="font-semibold">Notes:</span>{" "}
																			{entry.note}
																		</p>
																	</Show>
																	<Show when={hasCard(entry)}>
																		<button
																			type="button"
																			onClick={() =>
																				printDedicationCard(
																					order.id,
																					orderCards(order).findIndex(
																						(card) =>
																							card.lineIndex ===
																								entry.lineIndex &&
																							card.unit === entry.unit,
																					),
																				)
																			}
																			title="Print this dedication card (A5)"
																			class="-mx-1 mt-1 block w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left whitespace-pre-line outline-none hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-petal-500"
																		>
																			<span class="font-semibold">
																				To {entry.to || "—"}:
																			</span>{" "}
																			“{entry.message}”
																			<span class="mt-0.5 block font-medium text-petal-700">
																				🖨 Print card
																			</span>
																		</button>
																	</Show>
																</li>
															)}
														</For>
													</ul>
												</Show>
											</td>
										</tr>
									);
								}}
							</For>
						</tbody>
					</table>
					{/* Coming into view loads the next rows. */}
					<div ref={sentinel} aria-hidden="true" class="h-px" />
					<Show when={data().total > 0}>
						<div class="flex items-center justify-center gap-3 px-4 py-4 text-sm text-petal-900/55">
							<Show
								when={hasMore()}
								fallback={
									<span>
										That’s all {data().total.toLocaleString()}{" "}
										{data().total === 1 ? "bouquet" : "bouquets"}.
									</span>
								}
							>
								<Show
									when={!moreFailed()}
									fallback={
										<>
											<span>Couldn’t load more.</span>
											<button
												type="button"
												onClick={() => void loadMore()}
												class={adminButton.secondary}
											>
												Try again
											</button>
										</>
									}
								>
									<span aria-live="polite">
										{loadingMore() ? "Loading more…" : "Scroll for more"}
									</span>
								</Show>
							</Show>
						</div>
					</Show>
				</div>
			</div>
		</div>
	);
}

const SUMMARY_STAGES = [
	{ key: "new", label: "New", class: "bg-petal-100 text-petal-700" },
	{
		key: "making",
		label: "Being made",
		class: "bg-warning text-warning-foreground",
	},
	{ key: "done", label: "Done", class: "bg-success text-success-foreground" },
] as const;

/**
 * One card per arrangement type: how many were ordered and how far they are.
 * Picking a card shows only that type; picking it again shows them all.
 */
function ArrangementCards(props: {
	cards: ArrangementSummary[];
	selected: string[];
	onSelect: (key: string | undefined) => void;
}) {
	return (
		<section
			aria-label="Bouquets by arrangement type"
			class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
		>
			<For each={props.cards}>
				{(card) => {
					const active = () =>
						props.selected.length === 1 && props.selected[0] === card.key;
					const dimmed = () => props.selected.length > 0 && !active();
					return (
						<button
							type="button"
							aria-pressed={active()}
							title={
								active()
									? "Show every type again"
									: `Show only ${card.label.toLowerCase()}`
							}
							onClick={() => props.onSelect(active() ? undefined : card.key)}
							class={cn(
								"flex flex-col items-start gap-1 rounded-2xl border bg-white p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
								active()
									? "border-petal-700 shadow-[inset_0_0_0_1px] shadow-petal-700"
									: "border-petal-100 hover:border-petal-300",
								dimmed() && "opacity-60 hover:opacity-100",
							)}
						>
							<span class="text-sm font-medium text-petal-900/70">
								{card.label}
							</span>
							<span class="font-display text-3xl font-semibold tabular-nums">
								{card.bouquets.toLocaleString()}
							</span>
							<span class="mt-1 flex flex-wrap gap-1.5">
								<For each={SUMMARY_STAGES}>
									{(stage) => (
										<span
											class={cn(
												"rounded-full px-2 py-0.5 text-xs tabular-nums",
												card.stages[stage.key]
													? stage.class
													: "bg-petal-50 text-petal-900/40",
											)}
										>
											{stage.label} {card.stages[stage.key]}
										</span>
									)}
								</For>
								<Show when={card.stages.cancelled > 0}>
									<span class="rounded-full bg-petal-50 px-2 py-0.5 text-xs tabular-nums text-petal-900/50">
										Cancelled {card.stages.cancelled}
									</span>
								</Show>
							</span>
							<Show when={card.wrappers.needed > 0}>
								<span class="mt-2 flex w-full flex-col gap-1">
									<span class="flex items-baseline justify-between gap-2 text-xs text-petal-900/65">
										<span>Wrappers made</span>
										<span class="font-medium tabular-nums text-petal-900">
											{card.wrappers.made} of {card.wrappers.needed}
										</span>
									</span>
									<span
										role="progressbar"
										aria-label={`${card.label} wrappers made`}
										aria-valuemin={0}
										aria-valuemax={card.wrappers.needed}
										aria-valuenow={card.wrappers.made}
										class="h-1.5 w-full overflow-hidden rounded-full bg-petal-100"
									>
										<span
											class={cn(
												"block h-full rounded-full transition-[width]",
												card.wrappers.made === card.wrappers.needed
													? "bg-success-foreground"
													: "bg-petal-500",
											)}
											style={{
												width: `${(card.wrappers.made / card.wrappers.needed) * 100}%`,
											}}
										/>
									</span>
								</span>
							</Show>
						</button>
					);
				}}
			</For>
		</section>
	);
}

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
			// Cancelling restocks and can't be undone: it has its own button and
			// dialog, which asks why.
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
		<Show when={tracksWrapper(props.line)} fallback="—">
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

/**
 * A table row's cards and notes: its bouquet's own, plus (on older orders)
 * the one for the whole order.
 */
function rowMessages(
	order: Parameters<typeof orderMessages>[0],
	index: number,
) {
	return orderMessages(order).filter(
		(entry) => entry.lineIndex === undefined || entry.lineIndex === index,
	);
}
