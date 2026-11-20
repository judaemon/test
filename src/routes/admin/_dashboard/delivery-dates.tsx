import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import {
	type ColumnVisibilityState,
	createColumnHelper,
	createTable,
	type RowSelectionState,
	type SortingState,
} from "@tanstack/solid-table";
import { createEffect, createSignal, Show } from "solid-js";

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
	pageParam,
	ResetFilters,
	resolveUpdater,
	sortParam,
	TableSearch,
} from "~/components/admin/table-state";
import {
	adminButton,
	adminInput,
	ConfirmButton,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { FacetFilter } from "~/components/ui/facet-filter";
import { formatDeliveryDate } from "~/lib/checkout";
import {
	DELIVERY_DATES_MAX,
	isCalendarDate,
	tidyDates,
	upcomingDeliveryDates,
} from "~/lib/delivery-dates";
import { joinList, parseList } from "~/lib/shop-filters";
import { cn } from "~/lib/utils";
import {
	getDeliveryDatesAdmin,
	saveDeliveryDatesFn,
} from "~/server/admin/delivery-dates";

const PAGE_SIZES = [10, 20, 50] as const;
const SORTABLE = ["date", "orders", "bouquets"] as const;
const DEFAULT_SORT: SortingState = [{ id: "date", desc: false }];
const STATUSES = [
	{ key: "offered", label: "Offered at checkout" },
	{ key: "past", label: "Past" },
] as const;

interface DatesSearch {
	q?: string;
	/** "offered", "past", or both. */
	status?: string;
	sort?: string;
	page?: number;
	perPage?: number;
}

export const Route = createFileRoute("/admin/_dashboard/delivery-dates")({
	validateSearch: (search: Record<string, unknown>): DatesSearch => ({
		q: textParam(search, "q"),
		status: textParam(search, "status"),
		sort: sortParam(search, SORTABLE),
		page: pageParam(search),
		perPage: PAGE_SIZES.find((size) => size === Number(search.perPage)),
	}),
	loader: () => getDeliveryDatesAdmin(),
	head: () => ({ meta: [{ title: "Delivery dates · ORAIA Admin" }] }),
	component: DeliveryDatesPage,
});

/** One day in the table: when, whether checkout still offers it, what's on it. */
interface DayRow {
	date: string;
	offered: boolean;
	orders: number;
	bouquets: number;
}

/**
 * Whether a day fits what's typed: every word starts a word of the day, so
 * "nov 14", "sat" and "2026-11-14" find it, but "6" doesn't find Dec 5 (2026).
 */
const fitsDay = (date: string, query: string | undefined) => {
	const words = `${formatDeliveryDate(date)} ${date}`
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	return (query ?? "")
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.every((typed) =>
			words.some(
				(word) =>
					word.startsWith(typed) ||
					// "06" in 2026-12-06 and "6" mean the same day.
					(/^\d+$/.test(typed) && Number(word) === Number(typed)),
			),
		);
};

const column = createColumnHelper<typeof adminTableFeatures, DayRow>();

/** The days checkout offers, in a table to search, filter and change. */
function DeliveryDatesPage() {
	const loaded = Route.useLoaderData();
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [dates, setDates] = createSignal<string[]>(loaded().dates);
	createEffect(() => setDates(loaded().dates));
	const [adding, setAdding] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	const setSearch = (patch: Partial<DatesSearch>, keepPage = false) =>
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
	const statusChosen = () => parseList(search().status);

	const rows = (): DayRow[] => {
		const upcoming = new Set(upcomingDeliveryDates(dates()));
		return dates().map((date) => ({
			date,
			offered: upcoming.has(date),
			orders: loaded().booked[date]?.orders ?? 0,
			bouquets: loaded().booked[date]?.bouquets ?? 0,
		}));
	};

	/** Saves the list as it'll be, straight away; puts it back if that fails. */
	const save = async (next: string[], done: string) => {
		const before = dates();
		setDates(next);
		setSaving(true);
		try {
			setDates(await saveDeliveryDatesFn({ data: { dates: next } }));
			toastSuccess(done);
			await router.invalidate();
			return true;
		} catch (error) {
			setDates(before);
			toastError(error);
			return false;
		} finally {
			setSaving(false);
		}
	};

	const add = async (event: SubmitEvent) => {
		event.preventDefault();
		const date = adding();
		if (!isCalendarDate(date)) return toastError("Pick a day first.");
		if (dates().includes(date))
			return toastError(`${formatDeliveryDate(date)} is already on the list.`);
		if (dates().length >= DELIVERY_DATES_MAX)
			return toastError(`Offer up to ${DELIVERY_DATES_MAX} dates at a time.`);
		if (
			await save(
				tidyDates([...dates(), date]),
				`${formatDeliveryDate(date)} added. Checkout offers it now.`,
			)
		)
			setAdding("");
	};

	const remove = async (gone: string[]) => {
		const ok = await save(
			dates().filter((date) => !gone.includes(date)),
			gone.length === 1
				? `${formatDeliveryDate(gone[0] as string)} removed.`
				: `${gone.length} days removed.`,
		);
		if (ok) table.resetRowSelection();
	};

	/** What removing these days means, for the confirm. */
	const removeNote = (days: DayRow[]) => {
		const orders = days.reduce((sum, day) => sum + day.orders, 0);
		const them = days.length === 1 ? "it" : "them";
		return orders
			? `${orders} ${orders === 1 ? "order is" : "orders are"} booked on ${them}. They keep their day; checkout just stops offering ${them}.`
			: `Checkout stops offering ${them}. No orders are booked on ${them}.`;
	};

	const countCell = (value: number) => (
		<Show when={value} fallback={<span class="text-petal-900/40">None</span>}>
			<span class="tabular-nums">{value}</span>
		</Show>
	);

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
					label={`Select ${formatDeliveryDate(row.original.date)}`}
					checked={row.getIsSelected()}
					onChange={row.getToggleSelectedHandler()}
				/>
			),
		}),
		column.accessor("date", {
			meta: { label: "Date", grow: true },
			header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
			cell: ({ getValue }) => (
				<span class="font-medium">{formatDeliveryDate(getValue())}</span>
			),
		}),
		column.accessor("offered", {
			id: "status",
			enableSorting: false,
			meta: { label: "Status" },
			header: () => "Status",
			filterFn: (row, _id, chosen: string[]) =>
				chosen.includes(row.original.offered ? "offered" : "past"),
			cell: ({ getValue }) => (
				<span
					class={cn(
						"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
						getValue()
							? "bg-success text-success-foreground"
							: "bg-petal-900/5 text-petal-900/60",
					)}
				>
					<Show when={getValue()}>
						<span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
					</Show>
					{getValue() ? "Offered at checkout" : "Past: not offered"}
				</span>
			),
		}),
		column.accessor("orders", {
			meta: { label: "Orders", class: "text-right" },
			sortDescFirst: true,
			header: ({ column }) => <SortHeader column={column}>Orders</SortHeader>,
			cell: ({ getValue }) => countCell(getValue()),
		}),
		column.accessor("bouquets", {
			meta: { label: "Bouquets", class: "text-right" },
			sortDescFirst: true,
			header: ({ column }) => <SortHeader column={column}>Bouquets</SortHeader>,
			cell: ({ getValue }) => countCell(getValue()),
		}),
		column.display({
			id: "remove",
			enableHiding: false,
			meta: { class: "w-28 text-right" },
			header: () => <span class="sr-only">Remove</span>,
			cell: ({ row }) => (
				<ConfirmButton
					class={adminButton.ghost}
					title={`Remove ${formatDeliveryDate(row.original.date)}?`}
					description={removeNote([row.original])}
					confirmLabel="Remove day"
					disabled={saving()}
					aria-label={`Remove ${formatDeliveryDate(row.original.date)}`}
					onConfirm={() => remove([row.original.date])}
				>
					Remove
				</ConfirmButton>
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
			return rows();
		},
		getRowId: (row) => row.date,
		state: {
			get sorting() {
				return address.sorting();
			},
			get pagination() {
				return address.pagination();
			},
			get columnFilters() {
				return statusChosen().length
					? [{ id: "status", value: statusChosen() }]
					: [];
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
		globalFilterFn: (row, _id, query: string) =>
			fitsDay(row.original.date, query),
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

	const statusOptions = () =>
		STATUSES.map((status) => ({
			key: status.key,
			label: status.label,
			count: rows().filter(
				(row) =>
					(row.offered ? "offered" : "past") === status.key &&
					fitsDay(row.date, search().q),
			).length,
		}));
	const filtered = () => !!(search().q || search().status);
	const selectedRows = () =>
		table.getSelectedRowModel().rows.map((row) => row.original);

	return (
		<div class="mx-auto flex h-[calc(100dvh-6.5rem)] min-h-[32rem] max-w-5xl flex-col lg:h-[calc(100dvh-8rem)]">
			<PageHeader
				title="Delivery dates"
				description="The days shoppers can choose at checkout. They must pick one of these. Past days drop off checkout on their own."
			/>

			{/* Which event these days belong to, and where else to change them. */}
			<Show
				when={loaded().event}
				fallback={
					<p class="mb-4 rounded-2xl border border-petal-100 bg-white px-4 py-3 text-sm text-petal-900/75">
						No event is current, so these days are the shop’s own.{" "}
						<Link
							to="/admin/events"
							class="font-medium text-petal-700 underline-offset-4 hover:underline"
						>
							Mark an event current
						</Link>{" "}
						to use its delivery days.
					</p>
				}
			>
				{(event) => (
					<p class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-petal-200 bg-petal-50 px-4 py-3 text-sm">
						<span class="min-w-0 flex-1">
							These are the delivery days of{" "}
							<strong class="font-semibold">{event().name}</strong>, the current
							event. Changing them here changes the event.
						</span>
						<Link
							to="/admin/events/$eventId"
							params={{ eventId: event().id }}
							class="shrink-0 font-medium text-petal-700 underline-offset-4 hover:underline"
						>
							Open the event <span aria-hidden="true">→</span>
						</Link>
					</p>
				)}
			</Show>

			<div class="mb-3 flex flex-wrap items-center gap-2">
				<TableSearch
					label="Search dates"
					placeholder="Search a day, e.g. Nov 14…"
					value={search().q ?? ""}
					onChange={(q) => setSearch({ q })}
				/>
				<FacetFilter
					label="Status"
					options={statusOptions()}
					selected={statusChosen()}
					onChange={(chosen) => setSearch({ status: joinList(chosen) })}
				/>
				<Show when={filtered()}>
					<ResetFilters
						onClick={() => setSearch({ q: undefined, status: undefined })}
					/>
				</Show>
				<div class="ml-auto">
					<ViewOptions table={table} />
				</div>
				{/* Adding saves straight away, like removing. */}
				<form onSubmit={add} class="flex w-full items-center gap-2 sm:w-auto">
					<label class="sr-only" for="add-delivery-date">
						Add a delivery date
					</label>
					<input
						id="add-delivery-date"
						type="date"
						class={cn(
							adminInput,
							"h-10 min-w-0 flex-1 sm:h-10 sm:w-44 sm:flex-none",
						)}
						value={adding()}
						onInput={(e) => setAdding(e.currentTarget.value)}
					/>
					<button
						type="submit"
						class={cn(adminButton.primary, "shrink-0")}
						disabled={saving() || !adding()}
					>
						+ Add date
					</button>
				</form>
			</div>

			<DataTable
				class="flex-1"
				table={table}
				caption="Delivery dates"
				pageSizes={PAGE_SIZES}
				empty={
					<Show
						when={dates().length}
						fallback="No dates yet. Checkout’s delivery date is optional, and any day can be picked. Add one above."
					>
						No day matches these filters.
					</Show>
				}
				selectionActions={
					<>
						<ConfirmButton
							class="inline-flex h-9 items-center rounded-lg border border-error-foreground/30 bg-white px-3 font-medium text-error-foreground transition-colors outline-none hover:bg-error focus-visible:ring-2 focus-visible:ring-error-foreground/40"
							title={`Remove ${selectedRows().length} ${
								selectedRows().length === 1 ? "day" : "days"
							}?`}
							description={removeNote(selectedRows())}
							confirmLabel="Remove"
							disabled={saving()}
							onConfirm={() => remove(selectedRows().map((row) => row.date))}
						>
							Remove selected
						</ConfirmButton>
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
