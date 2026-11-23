import * as DropdownMenu from "@kobalte/core/dropdown-menu";
import { createFileRoute } from "@tanstack/solid-router";
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
import { DateRangeFilter } from "~/components/admin/date-range-filter";
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
import { PageHeader, toastError, toastSuccess } from "~/components/admin/ui";
import { FacetFilter } from "~/components/ui/facet-filter";
import { joinList, parseList } from "~/lib/shop-filters";
import { cn } from "~/lib/utils";
import { listShopUsers, type ShopUser } from "~/server/admin/users";

const PAGE_SIZES = [10, 20, 30, 50, 100] as const;
const SORTABLE = ["name", "email", "joined", "orders", "lastOrder"] as const;
const DEFAULT_SORT: SortingState = [{ id: "joined", desc: true }];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface UsersSearch {
	q?: string;
	/** "ordered", "none", or both. */
	orders?: string;
	from?: string;
	to?: string;
	/** e.g. "name.asc"; missing is newest first. */
	sort?: string;
	page?: number;
	perPage?: number;
}

export const Route = createFileRoute("/admin/_dashboard/users")({
	beforeLoad: needs("customers.view"),
	validateSearch: (search: Record<string, unknown>): UsersSearch => {
		const day = (key: string) =>
			typeof search[key] === "string" && DAY.test(search[key] as string)
				? (search[key] as string)
				: undefined;
		return {
			q: textParam(search, "q"),
			orders: textParam(search, "orders"),
			from: day("from"),
			to: day("to"),
			sort: sortParam(search, SORTABLE),
			page: pageParam(search),
			perPage: PAGE_SIZES.find((size) => size === Number(search.perPage)),
		};
	},
	loader: () => listShopUsers(),
	head: () => ({ meta: [{ title: "Users · ORAIA Admin" }] }),
	component: UsersPage,
});

/** The day in the shop (Asia/Manila), YYYY-MM-DD, to match the date filter. */
const shopDay = (at: string) =>
	new Date(new Date(at).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

const longDay = (at: string) =>
	new Date(at).toLocaleDateString("en-PH", {
		timeZone: "Asia/Manila",
		month: "long",
		day: "numeric",
		year: "numeric",
	});

const ORDER_CHOICES = [
	{ key: "ordered", label: "Has ordered" },
	{ key: "none", label: "No orders yet" },
] as const;

const fitsOrders = (user: ShopUser, chosen: string[]) =>
	!chosen.length ||
	chosen.some((key) => (key === "ordered" ? user.orders > 0 : !user.orders));

const fitsJoined = (user: ShopUser, range: { from?: string; to?: string }) => {
	const day = shopDay(user.createdAt);
	return (!range.from || day >= range.from) && (!range.to || day <= range.to);
};

const fitsQuery = (user: ShopUser, query: string) =>
	fitsWords(`${user.name} ${user.email}`, query);

const features = adminTableFeatures;

const column = createColumnHelper<typeof features, ShopUser>();

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
				label={`Select ${row.original.name || row.original.email}`}
				checked={row.getIsSelected()}
				onChange={row.getToggleSelectedHandler()}
			/>
		),
	}),
	column.accessor("name", {
		meta: { label: "Name", grow: true },
		sortFn: "text",
		header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
		cell: ({ row }) => (
			<span class="block truncate font-medium">
				{row.original.name || "No name"}
			</span>
		),
	}),
	column.accessor("email", {
		meta: { label: "Email" },
		sortFn: "text",
		header: ({ column }) => <SortHeader column={column}>Email</SortHeader>,
		cell: ({ getValue }) => <span class="text-petal-900/75">{getValue()}</span>,
	}),
	column.accessor("orders", {
		meta: { label: "Orders", class: "text-right" },
		sortDescFirst: true,
		header: ({ column }) => <SortHeader column={column}>Orders</SortHeader>,
		filterFn: (row, _id, chosen: string[]) => fitsOrders(row.original, chosen),
		cell: ({ getValue }) => (
			<Show
				when={getValue()}
				fallback={<span class="text-petal-900/40">None</span>}
			>
				<span class="tabular-nums">{getValue()}</span>
			</Show>
		),
	}),
	column.accessor((user) => user.lastOrderAt ?? "", {
		id: "lastOrder",
		meta: { label: "Last order" },
		sortDescFirst: true,
		sortUndefined: "last",
		header: ({ column }) => <SortHeader column={column}>Last order</SortHeader>,
		cell: ({ row }) => (
			<Show
				when={row.original.lastOrderAt}
				fallback={<span class="text-petal-900/40">—</span>}
			>
				{(at) => <span class="tabular-nums">{longDay(at())}</span>}
			</Show>
		),
	}),
	column.accessor("createdAt", {
		id: "joined",
		meta: { label: "Joined" },
		sortDescFirst: true,
		header: ({ column }) => <SortHeader column={column}>Joined</SortHeader>,
		filterFn: (row, _id, range: { from?: string; to?: string }) =>
			fitsJoined(row.original, range),
		cell: ({ getValue }) => (
			<span class="tabular-nums">{longDay(getValue())}</span>
		),
	}),
	column.display({
		id: "actions",
		enableHiding: false,
		meta: { class: "w-12 pl-0 text-right" },
		header: () => <span class="sr-only">Actions</span>,
		cell: ({ row }) => <RowActions user={row.original} />,
	}),
]);

/** Everyone who made an account on the shop, in a table to sort and filter. */
function UsersPage() {
	const users = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const setSearch = (patch: Partial<UsersSearch>, keepPage = false) =>
		navigate({
			search: (prev) => ({
				...prev,
				...(keepPage ? {} : { page: undefined }),
				...patch,
			}),
			replace: true,
			resetScroll: false,
		});

	// The table's order and page live in the address.
	const address = addressTableState({
		search,
		set: setSearch,
		defaultSort: DEFAULT_SORT,
		pageSizes: PAGE_SIZES,
	});
	const { sorting, pagination } = address;
	const ordersChosen = () => parseList(search().orders);
	const columnFilters = (): ColumnFiltersState => [
		...(ordersChosen().length ? [{ id: "orders", value: ordersChosen() }] : []),
		...(search().from || search().to
			? [{ id: "joined", value: { from: search().from, to: search().to } }]
			: []),
	];
	const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});
	const [columnVisibility, setColumnVisibility] =
		createSignal<ColumnVisibilityState>({});

	const table = createTable({
		features,
		columns,
		get data() {
			return users();
		},
		getRowId: (user) => user.id,
		state: {
			get sorting() {
				return sorting();
			},
			get pagination() {
				return pagination();
			},
			get columnFilters() {
				return columnFilters();
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
		// The address sets the page; a new filter already starts at page one.
		autoResetPageIndex: false,
	});

	// Past the last page (a filter narrowed it), go to the last one there is.
	createEffect(() => {
		const count = table.getPageCount();
		if (count > 0 && pagination().pageIndex >= count)
			setSearch({ page: count > 1 ? count : undefined }, true);
	});

	/** People each orders choice would show, given the other filters. */
	const orderCount = (key: string) =>
		users().filter(
			(user) =>
				fitsQuery(user, search().q ?? "") &&
				fitsJoined(user, { from: search().from, to: search().to }) &&
				fitsOrders(user, [key]),
		).length;

	const filtered = () =>
		!!(search().q || search().orders || search().from || search().to);
	const reset = () =>
		setSearch({
			q: undefined,
			orders: undefined,
			from: undefined,
			to: undefined,
		});

	const copySelected = async () => {
		const emails = table
			.getSelectedRowModel()
			.rows.map((row) => row.original.email);
		try {
			await navigator.clipboard.writeText(emails.join(", "));
			toastSuccess(
				emails.length === 1
					? "Email copied."
					: `${emails.length} emails copied.`,
			);
		} catch (error) {
			toastError(error);
		}
	};

	return (
		// Fills the screen under the top bar; the rows scroll, not the page.
		<div class="mx-auto flex h-[calc(100dvh-6.5rem)] min-h-[32rem] max-w-6xl flex-col lg:h-[calc(100dvh-8rem)]">
			<PageHeader
				title="Users"
				description={`${users().length} people made an account on the shop. Staff accounts are on Staff.`}
			/>

			<div class="mb-3 flex flex-wrap items-center gap-2">
				<TableSearch
					label="Search users"
					placeholder="Search name or email…"
					value={search().q ?? ""}
					onChange={(q) => setSearch({ q })}
				/>
				<FacetFilter
					label="Orders"
					options={ORDER_CHOICES.map((choice) => ({
						key: choice.key,
						label: choice.label,
						count: orderCount(choice.key),
					}))}
					selected={ordersChosen()}
					onChange={(chosen) => setSearch({ orders: joinList(chosen) })}
				/>
				<DateRangeFilter
					label="Joined"
					title="Joined on"
					from={search().from}
					to={search().to}
					onChange={(from, to) => setSearch({ from, to })}
				/>
				<Show when={filtered()}>
					<ResetFilters onClick={reset} />
				</Show>
				<div class="ml-auto">
					<ViewOptions table={table} />
				</div>
			</div>

			<DataTable
				class="flex-1"
				table={table}
				caption="Shop accounts"
				pageSizes={PAGE_SIZES}
				empty={
					<Show
						when={users().length}
						fallback="No accounts yet. They appear here as people sign up on the shop."
					>
						No one matches these filters.
					</Show>
				}
				selectionActions={
					<>
						<button
							type="button"
							onClick={() => void copySelected()}
							class="inline-flex h-9 items-center rounded-lg border border-petal-200 bg-white px-3 font-medium text-petal-900 transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Copy emails
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

/** The "…" at the end of a row. */
function RowActions(props: { user: ShopUser }) {
	const copy = async (text: string, done: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toastSuccess(done);
		} catch (error) {
			toastError(error);
		}
	};
	const item =
		"flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-petal-50";
	return (
		<DropdownMenu.Root placement="bottom-end" gutter={4}>
			<DropdownMenu.Trigger
				aria-label={`Actions for ${props.user.name || props.user.email}`}
				class={cn(
					"inline-flex size-8 items-center justify-center rounded-lg text-petal-900/60 transition-colors outline-none hover:bg-petal-100 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 data-[expanded]:bg-petal-100",
				)}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-4"
				>
					<circle cx="5" cy="12" r="1.6" />
					<circle cx="12" cy="12" r="1.6" />
					<circle cx="19" cy="12" r="1.6" />
				</svg>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class="z-50 w-44 rounded-xl border border-petal-100 bg-white p-1 text-petal-900 shadow-lg outline-none">
					<DropdownMenu.Item
						class={item}
						onSelect={() => void copy(props.user.email, "Email copied.")}
					>
						Copy email
					</DropdownMenu.Item>
					<Show when={props.user.name}>
						<DropdownMenu.Item
							class={item}
							onSelect={() => void copy(props.user.name, "Name copied.")}
						>
							Copy name
						</DropdownMenu.Item>
					</Show>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}
