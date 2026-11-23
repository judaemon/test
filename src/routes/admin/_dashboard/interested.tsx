import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import {
	type ColumnFiltersState,
	type ColumnVisibilityState,
	createColumnHelper,
	createTable,
	type RowSelectionState,
	type SortingState,
} from "@tanstack/solid-table";
import { createEffect, createSignal, Show } from "solid-js";
import { needs } from "~/components/admin/access";
import {
	adminTableFeatures,
	DataTable,
	SortHeader,
	TableCheckbox,
	ViewOptions,
} from "~/components/admin/data-table";
import { textParam } from "~/components/admin/list-toolbar";
import {
	addressTableState,
	fitsWords,
	pageParam,
	ResetFilters,
	resolveUpdater,
	sortParam,
	TableSearch,
} from "~/components/admin/table-state";
import {
	adminButton,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { CompanyLabel } from "~/components/order/company-label";
import { FacetFilter } from "~/components/ui/facet-filter";
import { CIVILIAN } from "~/lib/cadets";
import { formatSerialNumber } from "~/lib/checkout";
import { shortDeliveryDate } from "~/lib/delivery-dates";
import { formatLogTime } from "~/lib/order-log";
import { can } from "~/lib/permissions";
import { joinList, parseList } from "~/lib/shop-filters";
import { deleteShopWishFn, listShopWishesFn } from "~/server/shop-status";
import type { ShopWish } from "~/server/shop-status-repo";

const PAGE_SIZES = [20, 50, 100] as const;
const SORTABLE = ["name", "company", "date", "event", "left"] as const;
const DEFAULT_SORT: SortingState = [{ id: "left", desc: true }];
/** Older entries have only a name; they filter as "No day given". */
const NO_DAY = "none";

interface InterestedSearch {
	q?: string;
	/** Delivery days, or "none". */
	day?: string;
	/** Event ids, or "none". */
	event?: string;
	sort?: string;
	page?: number;
	perPage?: number;
}

export const Route = createFileRoute("/admin/_dashboard/interested")({
	beforeLoad: needs("interested.view"),
	validateSearch: (search: Record<string, unknown>): InterestedSearch => ({
		q: textParam(search, "q"),
		day: textParam(search, "day"),
		event: textParam(search, "event"),
		sort: sortParam(search, SORTABLE),
		page: pageParam(search),
		perPage: PAGE_SIZES.find((size) => size === Number(search.perPage)),
	}),
	loader: () => listShopWishesFn(),
	head: () => ({ meta: [{ title: "Interested buyers · ORAIA Admin" }] }),
	component: InterestedPage,
});

const fitsDay = (wish: ShopWish, chosen: string[]) =>
	!chosen.length ||
	chosen.some((key) => (key === NO_DAY ? !wish.date : wish.date === key));

const fitsEvent = (wish: ShopWish, chosen: string[]) =>
	!chosen.length ||
	chosen.some((key) => (key === NO_DAY ? !wish.eventId : wish.eventId === key));

const fitsQuery = (wish: ShopWish, query: string) =>
	fitsWords(
		`${wish.name} ${wish.company} ${wish.serialNumber} ${
			wish.serialNumber ? formatSerialNumber(wish.serialNumber) : ""
		}`,
		query,
	);

/** "1. Juan · Alfa · C-28161 · Sat, Nov 14", one per line, oldest first. */
const nameList = (wishes: ShopWish[]) =>
	[...wishes]
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.map((wish, i) =>
			[
				`${i + 1}. ${wish.name}`,
				wish.company,
				wish.serialNumber && formatSerialNumber(wish.serialNumber),
				wish.date && shortDeliveryDate(wish.date),
			]
				.filter(Boolean)
				.join(" · "),
		)
		.join("\n");

const copy = async (text: string, done: string) => {
	try {
		await navigator.clipboard.writeText(text);
		toastSuccess(done);
	} catch (error) {
		toastError(error);
	}
};

const column = createColumnHelper<typeof adminTableFeatures, ShopWish>();

/**
 * The names people leave on the fully booked page, to buy a bouquet at the
 * event. They aren't orders.
 */
function InterestedPage() {
	const context = Route.useRouteContext();
	const canEdit = () => can(context().user, "interested.manage");
	const loaded = Route.useLoaderData();
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [wishes, setWishes] = createSignal(loaded());
	createEffect(() => setWishes(loaded()));

	const setSearch = (patch: Partial<InterestedSearch>, keepPage = false) =>
		navigate({
			search: (prev) => ({
				...prev,
				...(keepPage ? {} : { page: undefined }),
				...patch,
			}),
			replace: true,
			resetScroll: false,
		});
	const address = addressTableState({
		search,
		set: setSearch,
		defaultSort: DEFAULT_SORT,
		pageSizes: PAGE_SIZES,
	});
	const daysChosen = () => parseList(search().day);
	const eventsChosen = () => parseList(search().event);

	const remove = async (wish: ShopWish) => {
		try {
			setWishes(await deleteShopWishFn({ data: { id: wish.id } }));
			setRowSelection(({ [wish.id]: _, ...rest }) => rest);
			toastSuccess(`${wish.name} removed.`);
			void router.invalidate();
		} catch (error) {
			toastError(error);
		}
	};

	const columns = column.columns([
		column.display({
			id: "select",
			enableSorting: false,
			enableHiding: false,
			meta: { class: "w-12 pr-0" },
			header: ({ table }) => (
				<TableCheckbox
					label="Select all on this page"
					checked={table.getIsAllPageRowsSelected()}
					indeterminate={table.getIsSomePageRowsSelected()}
					onChange={table.getToggleAllPageRowsSelectedHandler()}
				/>
			),
			cell: ({ row }) => (
				<TableCheckbox
					label={`Select ${row.original.name}`}
					checked={row.getIsSelected()}
					onChange={row.getToggleSelectedHandler()}
				/>
			),
		}),
		column.accessor("name", {
			meta: { label: "Name", grow: true },
			sortFn: "text",
			header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
			cell: ({ getValue }) => (
				<span class="block truncate font-medium">{getValue()}</span>
			),
		}),
		column.accessor("company", {
			meta: { label: "Company" },
			sortFn: "text",
			sortUndefined: "last",
			header: ({ column }) => <SortHeader column={column}>Company</SortHeader>,
			cell: ({ row }) => (
				<Show
					when={row.original.company}
					fallback={<span class="text-petal-900/40">—</span>}
				>
					<CompanyLabel
						company={
							row.original.company === CIVILIAN ? "" : row.original.company
						}
						className={row.original.company === CIVILIAN ? CIVILIAN : ""}
					/>
				</Show>
			),
		}),
		column.accessor("serialNumber", {
			id: "serial",
			enableSorting: false,
			meta: { label: "Serial number" },
			header: () => "Serial number",
			cell: ({ getValue }) => (
				<Show
					when={getValue()}
					fallback={<span class="text-petal-900/40">—</span>}
				>
					<span class="tabular-nums">{formatSerialNumber(getValue())}</span>
				</Show>
			),
		}),
		column.accessor("date", {
			meta: { label: "Day" },
			sortUndefined: "last",
			header: ({ column }) => <SortHeader column={column}>Day</SortHeader>,
			filterFn: (row, _id, chosen: string[]) => fitsDay(row.original, chosen),
			cell: ({ getValue }) => (
				<Show
					when={getValue()}
					fallback={<span class="text-petal-900/40">—</span>}
				>
					{shortDeliveryDate(getValue())}
				</Show>
			),
		}),
		column.accessor("eventName", {
			id: "event",
			meta: { label: "Event" },
			sortFn: "text",
			header: ({ column }) => <SortHeader column={column}>Event</SortHeader>,
			filterFn: (row, _id, chosen: string[]) => fitsEvent(row.original, chosen),
			cell: ({ getValue }) => (
				<Show
					when={getValue()}
					fallback={<span class="text-petal-900/40">—</span>}
				>
					{getValue()}
				</Show>
			),
		}),
		column.accessor("createdAt", {
			id: "left",
			meta: { label: "Left on" },
			sortDescFirst: true,
			header: ({ column }) => <SortHeader column={column}>Left on</SortHeader>,
			cell: ({ getValue }) => (
				<span class="tabular-nums text-petal-900/70">
					{formatLogTime(getValue())}
				</span>
			),
		}),
		column.display({
			id: "remove",
			enableHiding: false,
			meta: { class: "w-24 text-right" },
			header: () => <span class="sr-only">Remove</span>,
			cell: ({ row }) => (
				<Show when={canEdit()}>
					<button
						type="button"
						class={adminButton.ghost}
						onClick={() => void remove(row.original)}
						aria-label={`Remove ${row.original.name}`}
					>
						Remove
					</button>
				</Show>
			),
		}),
	]);

	const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});
	const [columnVisibility, setColumnVisibility] =
		createSignal<ColumnVisibilityState>({});

	const table = createTable({
		features: adminTableFeatures,
		columns,
		get data() {
			return wishes();
		},
		getRowId: (wish) => wish.id,
		state: {
			get sorting() {
				return address.sorting();
			},
			get pagination() {
				return address.pagination();
			},
			get columnFilters(): ColumnFiltersState {
				return [
					...(daysChosen().length ? [{ id: "date", value: daysChosen() }] : []),
					...(eventsChosen().length
						? [{ id: "event", value: eventsChosen() }]
						: []),
				];
			},
			get globalFilter() {
				return search().q ?? "";
			},
			get rowSelection() {
				return rowSelection();
			},
			get columnVisibility() {
				return columnVisibility();
			},
		},
		globalFilterFn: (row, _id, query: string) => fitsQuery(row.original, query),
		onSortingChange: address.onSortingChange,
		onPaginationChange: address.onPaginationChange,
		onRowSelectionChange: (updater) =>
			setRowSelection((old) => resolveUpdater(updater, old)),
		onColumnVisibilityChange: (updater) =>
			setColumnVisibility((old) => resolveUpdater(updater, old)),
		autoResetPageIndex: false,
	});

	// Past the last page (a filter or a removal narrowed it), go to the last.
	createEffect(() => {
		const count = table.getPageCount();
		if (count > 0 && address.pagination().pageIndex >= count)
			setSearch({ page: count > 1 ? count : undefined }, true);
	});

	/** How many names a choice would show, given the other filters. */
	const countWhere = (
		fits: (wish: ShopWish) => boolean,
		skip: "day" | "event",
	) =>
		wishes().filter(
			(wish) =>
				fitsQuery(wish, search().q ?? "") &&
				(skip === "day" || fitsDay(wish, daysChosen())) &&
				(skip === "event" || fitsEvent(wish, eventsChosen())) &&
				fits(wish),
		).length;
	// The days and events the names were actually left for.
	const dayOptions = () => {
		const days = [...new Set(wishes().map((wish) => wish.date))]
			.filter(Boolean)
			.sort();
		return [
			...days.map((day) => ({
				key: day,
				label: shortDeliveryDate(day),
				count: countWhere((wish) => wish.date === day, "day"),
			})),
			...(wishes().some((wish) => !wish.date)
				? [
						{
							key: NO_DAY,
							label: "No day given",
							count: countWhere((wish) => !wish.date, "day"),
						},
					]
				: []),
		];
	};
	const eventOptions = () => {
		const events = new Map<string, string>();
		for (const wish of wishes())
			if (wish.eventId)
				events.set(wish.eventId, wish.eventName || "Deleted event");
		return [
			...[...events].map(([key, label]) => ({
				key,
				label,
				count: countWhere((wish) => wish.eventId === key, "event"),
			})),
			...(wishes().some((wish) => !wish.eventId)
				? [
						{
							key: NO_DAY,
							label: "No event",
							count: countWhere((wish) => !wish.eventId, "event"),
						},
					]
				: []),
		];
	};
	const filtered = () => !!(search().q || search().day || search().event);

	return (
		<div class="mx-auto flex h-[calc(100dvh-6.5rem)] min-h-[32rem] max-w-6xl flex-col lg:h-[calc(100dvh-8rem)]">
			<PageHeader
				title="Interested buyers"
				description="People who left their name on the fully booked page to buy a bouquet at the event. These aren’t orders."
				actions={
					<>
						<Link to="/admin/landing-page" class={adminButton.secondary}>
							Fully booked message
						</Link>
						<button
							type="button"
							class={adminButton.primary}
							disabled={!wishes().length}
							onClick={() =>
								void copy(
									nameList(
										table.getFilteredRowModel().rows.map((r) => r.original),
									),
									filtered() ? "Names shown copied." : "All names copied.",
								)
							}
						>
							{filtered() ? "Copy names shown" : "Copy all names"}
						</button>
					</>
				}
			/>

			<div class="mb-3 flex flex-wrap items-center gap-2">
				<TableSearch
					label="Search names"
					placeholder="Search name, company, serial…"
					value={search().q ?? ""}
					onChange={(q) => setSearch({ q })}
				/>
				<FacetFilter
					label="Event"
					options={eventOptions()}
					selected={eventsChosen()}
					onChange={(chosen) => setSearch({ event: joinList(chosen) })}
				/>
				<FacetFilter
					label="Day"
					options={dayOptions()}
					selected={daysChosen()}
					onChange={(chosen) => setSearch({ day: joinList(chosen) })}
				/>
				<Show when={filtered()}>
					<ResetFilters
						onClick={() =>
							setSearch({ q: undefined, day: undefined, event: undefined })
						}
					/>
				</Show>
				<div class="ml-auto">
					<ViewOptions table={table} />
				</div>
			</div>

			<DataTable
				class="flex-1"
				table={table}
				caption="Interested buyers"
				pageSizes={PAGE_SIZES}
				empty={
					<Show
						when={wishes().length}
						fallback="No names yet. They appear here as people leave them on the fully booked page."
					>
						No one matches these filters.
					</Show>
				}
				selectionActions={
					<>
						<button
							type="button"
							onClick={() =>
								void copy(
									nameList(
										table.getSelectedRowModel().rows.map((r) => r.original),
									),
									"Names copied.",
								)
							}
							class="inline-flex h-9 items-center rounded-lg border border-petal-200 bg-white px-3 font-medium text-petal-900 transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Copy names
						</button>
						<button
							type="button"
							onClick={() => table.resetRowSelection()}
							class="inline-flex h-9 items-center rounded-lg px-2.5 font-medium transition-colors outline-none hover:bg-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Clear
						</button>
					</>
				}
			/>
		</div>
	);
}
