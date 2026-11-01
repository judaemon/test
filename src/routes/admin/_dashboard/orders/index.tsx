import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createSignal, For, onCleanup, Show } from "solid-js";

import {
	adminCard,
	adminInput,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { CompanyLabel } from "~/components/order/company-label";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { printDedicationCard } from "~/components/order/print-card";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { orderColor } from "~/lib/cadets";
import { cashTotal, formatBills } from "~/lib/custom-bouquet";
import { formatRecipeItem, stemCount } from "~/lib/flowers";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { cn } from "~/lib/utils";
import { listAdminOrders, markOrderTest } from "~/server/admin/orders";
import {
	ORDER_STATUS_LABELS,
	type OrderStage,
	orderStatus,
	STAGE_LABELS,
} from "~/types/order";

const STAGE_TABS = ["all", "new", "making", "done", "cancelled"] as const;
type StageTab = (typeof STAGE_TABS)[number];

interface OrdersSearch {
	stage?: Exclude<StageTab, "all">;
	payment?: "pending" | "on_hold";
	/** Show only test orders. */
	test?: "only";
	q?: string;
}

export const Route = createFileRoute("/admin/_dashboard/orders/")({
	validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
		stage:
			STAGE_TABS.includes(search.stage as StageTab) && search.stage !== "all"
				? (search.stage as OrdersSearch["stage"])
				: undefined,
		payment:
			search.payment === "pending" || search.payment === "on_hold"
				? search.payment
				: undefined,
		test: search.test === "only" ? "only" : undefined,
		q:
			typeof search.q === "string" && search.q.trim()
				? search.q.trim().slice(0, 80)
				: undefined,
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		listAdminOrders({
			data: {
				stages: deps.stage ? [deps.stage] : undefined,
				needsVerification: deps.payment === "pending",
				onHold: deps.payment === "on_hold",
				test: deps.test,
				search: deps.q,
			},
		}),
	component: OrdersPage,
});

function OrdersPage() {
	const orders = Route.useLoaderData();
	/** One row per bouquet, so each line gets its own code, photo and recipe. */
	const rows = () =>
		[...orders()]
			// First order on top (#1, #2, …). The server sends the latest orders,
			// newest first, so the newest are never cut off.
			.sort(
				(a, b) =>
					Number(a.number) - Number(b.number) ||
					a.createdAt.localeCompare(b.createdAt),
			)
			.flatMap((order) => order.lines.map((line) => ({ order, line })));
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [query, setQuery] = createSignal(search().q ?? "");

	let debounce: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounce));
	const updateQuery = (value: string) => {
		setQuery(value);
		clearTimeout(debounce);
		debounce = setTimeout(
			() =>
				navigate({
					search: (prev) => ({ ...prev, q: value.trim() || undefined }),
					replace: true,
				}),
			300,
		);
	};

	const stageTab = (): StageTab => search().stage ?? "all";

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
				description="Every bouquet ordered, first order on top, colored by company. Open an order to check its payment."
			/>

			<div class="mb-4 flex flex-wrap items-center gap-3">
				<nav aria-label="Filter by stage" class="flex flex-wrap gap-1">
					<For each={STAGE_TABS}>
						{(tab) => (
							<Link
								from={Route.fullPath}
								search={(prev) => ({
									...prev,
									stage: tab === "all" ? undefined : tab,
								})}
								aria-current={stageTab() === tab ? "page" : undefined}
								class={cn(
									"rounded-full px-3 py-1.5 text-sm transition-colors",
									stageTab() === tab
										? "bg-petal-700 font-medium text-white"
										: "bg-white text-petal-900/70 hover:bg-petal-100",
								)}
							>
								{tab === "all" ? "All" : STAGE_LABELS[tab as OrderStage]}
							</Link>
						)}
					</For>
				</nav>
				<Link
					from={Route.fullPath}
					search={(prev) => ({
						...prev,
						payment: prev.payment === "pending" ? undefined : "pending",
					})}
					aria-pressed={search().payment === "pending"}
					class={cn(
						"rounded-full border px-3 py-1.5 text-sm transition-colors",
						search().payment === "pending"
							? "border-warning-foreground/40 bg-warning font-medium text-warning-foreground"
							: "border-petal-200 bg-white text-petal-900/70 hover:bg-petal-50",
					)}
				>
					Verifying payment
				</Link>
				<Link
					from={Route.fullPath}
					search={(prev) => ({
						...prev,
						payment: prev.payment === "on_hold" ? undefined : "on_hold",
					})}
					aria-pressed={search().payment === "on_hold"}
					class={cn(
						"rounded-full border px-3 py-1.5 text-sm transition-colors",
						search().payment === "on_hold"
							? "border-error-foreground/40 bg-error font-medium text-error-foreground"
							: "border-petal-200 bg-white text-petal-900/70 hover:bg-petal-50",
					)}
				>
					On hold
				</Link>
				<Link
					from={Route.fullPath}
					search={(prev) => ({
						...prev,
						test: prev.test === "only" ? undefined : "only",
					})}
					aria-pressed={search().test === "only"}
					class={cn(
						"rounded-full border px-3 py-1.5 text-sm transition-colors",
						search().test === "only"
							? "border-petal-700 bg-petal-100 font-medium text-petal-900"
							: "border-petal-200 bg-white text-petal-900/70 hover:bg-petal-50",
					)}
				>
					Test orders
				</Link>
				<label class="ml-auto w-full sm:w-72">
					<span class="sr-only">Search orders</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => updateQuery(e.currentTarget.value)}
						placeholder="Search name, company, class, order or ref no."
						class={adminInput}
					/>
				</label>
			</div>

			<div class={cn(adminCard, "relative overflow-x-auto")}>
				<table class="stack-table w-full text-left text-sm md:min-w-[1500px]">
					<thead class="border-b border-petal-100 text-xs uppercase tracking-wide text-petal-900/55">
						<tr>
							<th class="px-3 py-3 pl-5 font-medium">Order</th>
							<th class="px-3 py-3 font-medium">Company</th>
							<th class="px-3 py-3 font-medium">Class</th>
							<th class="px-3 py-3 font-medium">Name</th>
							<th class="px-3 py-3 font-medium">Style</th>
							<th class="px-3 py-3 font-medium">Photo</th>
							<th class="px-3 py-3 text-right font-medium">Price</th>
							<th class="px-3 py-3 font-medium">Payment</th>
							<th class="px-3 py-3 font-medium">Method</th>
							<th class="px-3 py-3 font-medium">Ref no.</th>
							<th class="px-3 py-3 font-medium">Notes / Dedication</th>
							<th class="px-3 py-3 font-medium">Flowers</th>
							<th class="px-3 py-3 font-medium">Wrapper</th>
						</tr>
					</thead>
					<tbody>
						<For
							each={rows()}
							fallback={
								<tr>
									<td
										colSpan={13}
										data-wide
										class="px-4 py-12 text-center text-petal-900/55"
									>
										No orders match these filters.
									</td>
								</tr>
							}
						>
							{({ order, line }) => {
								const details = order.details;
								const color = orderColor(details.company, details.className);
								return (
									<tr
										// The whole row opens the order; the order number stays a
										// real link for keyboard users and opening in a new tab.
										onClick={(event) => {
											if ((event.target as HTMLElement).closest("a, button"))
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
											<p class="text-xs text-petal-900/55">
												{
													ORDER_STATUS_LABELS[
														orderStatus(order.stage, order.payment.status)
													]
												}
												<Show when={order.cancelReason}>
													{(reason) => (
														<span class="block max-w-40 text-error-foreground">
															By customer: {reason()}
														</span>
													)}
												</Show>
											</p>
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
											data-label="Company"
											class="px-5 py-2 md:px-3 md:py-3 font-medium"
										>
											<Show when={details.company} fallback="—">
												<CompanyLabel company={details.company} className="" />
											</Show>
										</td>
										<td data-label="Class" class="px-5 py-2 md:px-3 md:py-3">
											{details.className || "—"}
										</td>
										<td
											data-label="Name"
											class="px-5 py-2 md:px-3 md:py-3 font-medium"
										>
											{details.lastName
												? `${details.lastName}, ${details.firstName}`
												: details.fullName}
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
											data-label="Price"
											class="px-5 py-2 md:px-3 md:py-3 font-medium tabular-nums md:text-right"
										>
											{formatPrice(line.lineTotal, order.currency)}
										</td>
										<td data-label="Payment" class="px-5 py-2 md:px-3 md:py-3">
											<PaymentStatusPill status={order.payment.status} />
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
										<td
											data-label="Flowers"
											data-wide
											class="px-5 py-2 md:px-3 md:py-3"
										>
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
										<td data-label="Wrapper" class="px-5 py-2 md:px-3 md:py-3">
											{line.wrapperColor || "—"}
										</td>
									</tr>
								);
							}}
						</For>
					</tbody>
				</table>
			</div>
		</div>
	);
}
