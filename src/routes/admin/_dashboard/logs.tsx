import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";

import { ActivityLogTable } from "~/components/admin/activity-log-table";
import { ListPager } from "~/components/admin/list-pager";
import { adminCard, adminInput, PageHeader } from "~/components/admin/ui";
import { isLogArea, LOG_AREAS, type LogArea } from "~/lib/activity-log";
import { isCalendarDate } from "~/lib/delivery-dates";
import { cn } from "~/lib/utils";
import { listLogsFn } from "~/server/admin/logs";

const PAGE_SIZES = [25, 50, 100] as const;

/** The Who menu's groups, staff first; each starts with "All …". */
const ACTOR_TYPES = {
	staff: { group: "Staff", all: "All staff" },
	customer: { group: "Customers", all: "All customers" },
} as const;
type ActorType = keyof typeof ACTOR_TYPES;
const isActorType = (value: unknown): value is ActorType =>
	typeof value === "string" && value in ACTOR_TYPES;

export interface LogsSearch {
	/** Only this kind of change; missing: everything. */
	area?: LogArea;
	/** Only this order, arrangement, wrapper or supplier (with `area`). */
	item?: string;
	/** Only this person's changes. */
	who?: string;
	/** Only changes by staff, or by customers. */
	by?: ActorType;
	/** An order number ("80"), or text to find in names and values. */
	q?: string;
	/** First and last day, `YYYY-MM-DD`, Manila time. */
	from?: string;
	to?: string;
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
			by: isActorType(search.by) ? search.by : undefined,
			q: text(search.q, 120),
			from: isCalendarDate(String(search.from ?? "")) ? String(search.from) : undefined,
			to: isCalendarDate(String(search.to ?? "")) ? String(search.to) : undefined,
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
				actorType: deps.by,
				search: deps.q,
				from: deps.from,
				to: deps.to,
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
	const filtered = () => {
		const { area, item, who, by, q, from, to } = search();
		return !!(area || item || who || by || q || from || to);
	};

	// Typing searches once they pause, without a request per key.
	const [query, setQuery] = createSignal(search().q ?? "");
	createEffect(
		on(
			() => search().q,
			(q) => setQuery(q ?? ""),
		),
	);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const searchFor = (value: string, wait = 400) => {
		setQuery(value);
		clearTimeout(timer);
		timer = setTimeout(() => {
			if ((search().q ?? "") !== value.trim())
				go({ q: value.trim() || undefined });
		}, wait);
	};
	onCleanup(() => clearTimeout(timer));

	return (
		<div>
			<PageHeader
				title="Logs"
				description="Every change staff and customers make: to orders, floral arrangements, wrappers, suppliers and florists. Who made it, when, what it was before and after, and the page it was made from."
			/>
			<div class="mb-4 flex flex-col gap-3">
				<form
					class="flex flex-wrap items-end gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						searchFor(query(), 0);
					}}
				>
					<label class="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-1 text-sm">
						Find
						<input
							type="search"
							value={query()}
							onInput={(e) => searchFor(e.currentTarget.value)}
							placeholder="Order number (e.g. 80), name or value"
							class={cn(adminInput, "h-9 sm:h-9")}
						/>
					</label>
					<label class="flex flex-col gap-1 text-sm">
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
					<label class="flex flex-col gap-1 text-sm">
						Who
						<select
							value={
								search().who ?? (search().by ? `by:${search().by}` : "")
							}
							onChange={(e) => {
								const value = e.currentTarget.value;
								const by = value.startsWith("by:") ? value.slice(3) : "";
								go(
									isActorType(by)
										? { by, who: undefined }
										: { who: value || undefined, by: undefined },
								);
							}}
							class={select}
						>
							<option value="">Everyone</option>
							<For each={Object.entries(ACTOR_TYPES)}>
								{([type, labels]) => (
									<optgroup label={labels.group}>
										<option value={`by:${type}`}>{labels.all}</option>
										<For
											each={log().people.filter(
												(person) => person.type === type,
											)}
										>
											{(person) => (
												<option value={person.name}>{person.name}</option>
											)}
										</For>
									</optgroup>
								)}
							</For>
							<Show
								when={log().people.filter((person) => !isActorType(person.type))
									.length}
							>
								<optgroup label="Other">
									<For
										each={log().people.filter(
											(person) => !isActorType(person.type),
										)}
									>
										{(person) => (
											<option value={person.name}>{person.name}</option>
										)}
									</For>
								</optgroup>
							</Show>
						</select>
					</label>
					<label class="flex flex-col gap-1 text-sm">
						From
						<input
							type="date"
							value={search().from ?? ""}
							max={search().to}
							onChange={(e) =>
								go({ from: e.currentTarget.value || undefined })
							}
							class={cn(select, "pr-2")}
						/>
					</label>
					<label class="flex flex-col gap-1 text-sm">
						To
						<input
							type="date"
							value={search().to ?? ""}
							min={search().from}
							onChange={(e) => go({ to: e.currentTarget.value || undefined })}
							class={cn(select, "pr-2")}
						/>
					</label>
				</form>
				<div class="flex flex-wrap items-center gap-3">
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
					<span class="text-sm text-petal-900/60">
						{log().total.toLocaleString()} change{log().total === 1 ? "" : "s"}
					</span>
					<Show when={filtered()}>
						<button
							type="button"
							class="text-sm font-medium text-petal-700 hover:underline"
							onClick={() => {
								clearTimeout(timer);
								setQuery("");
								navigate({ search: { size: search().size } });
							}}
						>
							Clear filters
						</button>
					</Show>
				</div>
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
