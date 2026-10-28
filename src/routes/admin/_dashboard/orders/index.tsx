import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createSignal, For, onCleanup, Show } from "solid-js";

import { adminCard, adminInput, PageHeader } from "~/components/admin/ui";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { formatSlot, getSlot } from "~/lib/checkout";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { formatDate } from "~/lib/time";
import { cn } from "~/lib/utils";
import { listAdminOrders } from "~/server/admin/orders";
import { type OrderStage, STAGE_LABELS } from "~/types/order";

const STAGE_TABS = [
	"all",
	"new",
	"making",
	"delivering",
	"done",
	"cancelled",
] as const;
type StageTab = (typeof STAGE_TABS)[number];

interface OrdersSearch {
	stage?: Exclude<StageTab, "all">;
	payment?: "pending";
	q?: string;
}

export const Route = createFileRoute("/admin/_dashboard/orders/")({
	validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
		stage:
			STAGE_TABS.includes(search.stage as StageTab) && search.stage !== "all"
				? (search.stage as OrdersSearch["stage"])
				: undefined,
		payment: search.payment === "pending" ? "pending" : undefined,
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
				search: deps.q,
			},
		}),
	component: OrdersPage,
});

function OrdersPage() {
	const orders = Route.useLoaderData();
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

	return (
		<div>
			<PageHeader
				title="Orders"
				description="Every order, newest delivery first. Open one to check its payment."
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
						payment: prev.payment ? undefined : "pending",
					})}
					aria-pressed={search().payment === "pending"}
					class={cn(
						"rounded-full border px-3 py-1.5 text-sm transition-colors",
						search().payment === "pending"
							? "border-warning-foreground/40 bg-warning font-medium text-warning-foreground"
							: "border-petal-200 bg-white text-petal-900/70 hover:bg-petal-50",
					)}
				>
					Needs payment check
				</Link>
				<label class="ml-auto w-full sm:w-72">
					<span class="sr-only">Search orders</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => updateQuery(e.currentTarget.value)}
						placeholder="Search name, phone, order or ref no."
						class={adminInput}
					/>
				</label>
			</div>

			<div class={cn(adminCard, "overflow-x-auto")}>
				<table class="w-full min-w-[760px] text-left text-sm">
					<thead class="border-b border-petal-100 text-xs uppercase tracking-wide text-petal-900/55">
						<tr>
							<th class="px-4 py-3 font-medium">Order</th>
							<th class="px-4 py-3 font-medium">Recipient</th>
							<th class="px-4 py-3 font-medium">Delivery</th>
							<th class="px-4 py-3 font-medium">Payment</th>
							<th class="px-4 py-3 font-medium">Stage</th>
							<th class="px-4 py-3 text-right font-medium">Total</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-petal-50">
						<For
							each={orders()}
							fallback={
								<tr>
									<td
										colSpan={6}
										class="px-4 py-12 text-center text-petal-900/55"
									>
										No orders match these filters.
									</td>
								</tr>
							}
						>
							{(order) => {
								const slot = getSlot(order.details.deliverySlot);
								return (
									<tr class="transition-colors hover:bg-petal-50/60">
										<td class="px-4 py-3">
											<Link
												to="/admin/orders/$orderId"
												params={{ orderId: order.id }}
												class="font-mono font-semibold text-petal-700 underline-offset-2 hover:underline"
											>
												#{order.number}
											</Link>
											<p class="text-xs text-petal-900/50">
												{new Date(order.createdAt).toLocaleString("en-PH", {
													timeZone: "Asia/Manila",
													month: "short",
													day: "numeric",
													hour: "numeric",
													minute: "2-digit",
												})}
											</p>
										</td>
										<td class="px-4 py-3">
											<p class="font-medium">{order.details.recipientName}</p>
											<p class="text-xs text-petal-900/55">
												{order.details.phone}
											</p>
										</td>
										<td class="px-4 py-3">
											<p>
												{formatDate(order.details.deliveryDate, {
													weekday: "short",
													month: "short",
													day: "numeric",
												})}
											</p>
											<p class="text-xs text-petal-900/55">
												{slot ? formatSlot(slot) : "—"}
											</p>
										</td>
										<td class="px-4 py-3">
											<PaymentStatusPill status={order.payment.status} />
											<p class="mt-1 text-xs text-petal-900/55">
												{PAYMENT_METHOD_LABELS[order.payment.method]}
												<Show when={order.payment.referenceNumber}>
													{" "}
													· {order.payment.referenceNumber}
												</Show>
											</p>
										</td>
										<td class="px-4 py-3 text-petal-900/80">
											{STAGE_LABELS[order.stage]}
										</td>
										<td class="px-4 py-3 text-right font-medium tabular-nums">
											{formatPrice(order.total, order.currency)}
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
