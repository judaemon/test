import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { ActivityLogTable } from "~/components/admin/activity-log-table";
import { ListPager } from "~/components/admin/list-pager";
import { adminCard, adminInput, PageHeader } from "~/components/admin/ui";
import { isLogArea, LOG_AREAS, type LogArea } from "~/lib/activity-log";
import { cn } from "~/lib/utils";
import { listLogsFn } from "~/server/admin/logs";

const PAGE_SIZES = [25, 50, 100] as const;

export interface LogsSearch {
	/** Only this kind of change; missing: everything. */
	area?: LogArea;
	/** Only this order, arrangement, wrapper or supplier (with `area`). */
	item?: string;
	/** Only this person's changes. */
	who?: string;
	page?: number;
	size?: number;
}

export const Route = createFileRoute("/admin/_dashboard/logs")({
	validateSearch: (search: Record<string, unknown>): LogsSearch => {
		const page = Number(search.page);
		const size = Number(search.size);
		const text = (value: unknown, max: number) =>
			typeof value === "string" && value ? value.slice(0, max) : undefined;
		const area = isLogArea(search.area) ? search.area : undefined;
		return {
			area,
			item: area ? text(search.item, 80) : undefined,
			who: text(search.who, 120),
			page: Number.isInteger(page) && page > 1 ? page : undefined,
			size: (PAGE_SIZES as readonly number[]).includes(size) ? size : undefined,
		};
	},
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		listLogsFn({
			data: {
				area: deps.area,
				itemId: deps.item,
				actor: deps.who,
				page: deps.page ?? 1,
				pageSize: deps.size ?? PAGE_SIZES[0],
			},
		}),
	component: LogsPage,
});

const select = cn(adminInput, "h-9 w-auto py-0 pr-8 sm:h-9");

function LogsPage() {
	const log = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const go = (next: Partial<LogsSearch>) =>
		navigate({ search: (prev) => ({ ...prev, page: undefined, ...next }) });
	const itemName = () => log().entries[0]?.itemName;

	return (
		<div>
			<PageHeader
				title="Logs"
				description="Every change staff and customers make: to orders, floral arrangements, wrappers and suppliers. Who made it, when, what it was before and after, and the page it was made from."
			/>
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<label class="flex items-center gap-2 text-sm">
					Show
					<select
						value={search().area ?? ""}
						onChange={(e) => {
							const value = e.currentTarget.value;
							go({
								area: isLogArea(value) ? value : undefined,
								item: undefined,
							});
						}}
						class={select}
					>
						<option value="">Everything</option>
						<For each={Object.entries(LOG_AREAS)}>
							{([value, label]) => <option value={value}>{label}</option>}
						</For>
					</select>
				</label>
				<label class="flex items-center gap-2 text-sm">
					Who
					<select
						value={search().who ?? ""}
						onChange={(e) => go({ who: e.currentTarget.value || undefined })}
						class={select}
					>
						<option value="">Everyone</option>
						<For each={log().people}>
							{(name) => <option value={name}>{name}</option>}
						</For>
					</select>
				</label>
				<Show when={search().item}>
					<span class="flex items-center gap-2 rounded-full bg-petal-50 px-3 py-1.5 text-sm">
						Only {itemName() ?? "this one"}
						<button
							type="button"
							class="text-petal-700 hover:underline"
							onClick={() => go({ item: undefined })}
						>
							Show all
						</button>
					</span>
				</Show>
				<span class="ml-auto text-sm text-petal-900/60">
					{log().total.toLocaleString()} change{log().total === 1 ? "" : "s"}
				</span>
			</div>
			<section class={adminCard}>
				<ActivityLogTable
					entries={log().entries}
					showArea={!search().area}
					empty="No changes match."
				/>
				<ListPager
					page={log().page}
					pageCount={log().pageCount}
					pageSize={log().pageSize}
					pageSizes={PAGE_SIZES}
					onPage={(page) =>
						navigate({
							search: (prev) => ({
								...prev,
								page: page > 1 ? page : undefined,
							}),
						})
					}
					onPageSize={(size) => go({ size })}
				/>
			</section>
		</div>
	);
}
