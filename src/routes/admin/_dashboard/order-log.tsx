import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { ListPager } from "~/components/admin/list-pager";
import { OrderLogTable } from "~/components/admin/order-log-table";
import { adminCard, adminInput, PageHeader } from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { listOrderLogFn } from "~/server/admin/orders";

const PAGE_SIZES = [25, 50, 100] as const;

interface LogSearch {
	page?: number;
	size?: number;
	/** Only this person's changes. */
	who?: string;
	/** Only this order's changes, by its id. */
	order?: string;
}

export const Route = createFileRoute("/admin/_dashboard/order-log")({
	validateSearch: (search: Record<string, unknown>): LogSearch => {
		const page = Number(search.page);
		const size = Number(search.size);
		const text = (value: unknown, max: number) =>
			typeof value === "string" && value ? value.slice(0, max) : undefined;
		return {
			page: Number.isInteger(page) && page > 1 ? page : undefined,
			size: (PAGE_SIZES as readonly number[]).includes(size) ? size : undefined,
			who: text(search.who, 120),
			order: text(search.order, 64),
		};
	},
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		listOrderLogFn({
			data: {
				page: deps.page ?? 1,
				pageSize: deps.size ?? PAGE_SIZES[0],
				actor: deps.who,
				orderId: deps.order,
			},
		}),
	component: OrderLogPage,
});

function OrderLogPage() {
	const log = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const go = (next: Partial<LogSearch>) =>
		navigate({ search: (prev) => ({ ...prev, ...next }) });
	const orderNumber = () =>
		log().entries.find((entry) => entry.orderNumber)?.orderNumber;

	return (
		<div>
			<PageHeader
				title="Order log"
				description="Every change to an order: who made it, when, what it was before and after, and the page it was made from."
			/>
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<label class="flex items-center gap-2 text-sm">
					Who
					<select
						value={search().who ?? ""}
						onChange={(e) =>
							go({ who: e.currentTarget.value || undefined, page: undefined })
						}
						class={cn(adminInput, "h-9 w-auto py-0 pr-8 sm:h-9")}
					>
						<option value="">Everyone</option>
						<For each={log().people}>
							{(name) => <option value={name}>{name}</option>}
						</For>
					</select>
				</label>
				<Show when={search().order}>
					<span class="flex items-center gap-2 rounded-full bg-petal-50 px-3 py-1.5 text-sm">
						Order{" "}
						<Show when={orderNumber()} fallback="(no changes)">
							{(number) => (
								<Link
									to="/admin/orders/$orderId"
									params={{ orderId: search().order ?? "" }}
									class="font-medium underline-offset-2 hover:underline"
								>
									#{number()}
								</Link>
							)}
						</Show>
						<button
							type="button"
							class="text-petal-700 hover:underline"
							onClick={() => go({ order: undefined, page: undefined })}
						>
							Show all orders
						</button>
					</span>
				</Show>
				<span class="ml-auto text-sm text-petal-900/60">
					{log().total.toLocaleString()} change{log().total === 1 ? "" : "s"}
				</span>
			</div>
			<section class={adminCard}>
				<OrderLogTable
					entries={log().entries}
					showOrder={!search().order}
					empty="No changes match."
				/>
				<ListPager
					page={log().page}
					pageCount={log().pageCount}
					pageSize={log().pageSize}
					pageSizes={PAGE_SIZES}
					onPage={(page) => go({ page: page > 1 ? page : undefined })}
					onPageSize={(size) => go({ size, page: undefined })}
				/>
			</section>
		</div>
	);
}
