import * as PopoverPrimitive from "@kobalte/core/popover";
import {
	type Column,
	columnFilteringFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	FlexRender,
	filterFns,
	globalFilteringFeature,
	type RowData,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	type SolidTable,
	sortFns,
	type TableFeatures,
	tableFeatures,
} from "@tanstack/solid-table";
import { For, type JSX, Show } from "solid-js";

import { cn } from "~/lib/utils";

/**
 * Column options the admin tables read: a plain name for the View menu and
 * screen readers, and classes for the header and its cells.
 */
declare module "@tanstack/solid-table" {
	interface ColumnMeta<
		TFeatures extends TableFeatures,
		TData extends RowData,
		TValue,
	> {
		label?: string;
		class?: string;
		/** Spans the leftover width; the other columns keep to their content. */
		grow?: boolean;
	}
}

/**
 * What every admin table can do, all in the browser: sort, search and
 * filter, page, tick rows, and hide columns.
 */
export const adminTableFeatures = tableFeatures({
	rowSortingFeature,
	columnFilteringFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	columnVisibilityFeature,
	sortedRowModel: createSortedRowModel(),
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortFns,
	filterFns,
});
type Features = typeof adminTableFeatures;

const ICON = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": 1.8,
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

const PAGE_BUTTON =
	"inline-flex size-9 items-center justify-center rounded-lg border border-petal-200 bg-white text-petal-900 transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500 disabled:pointer-events-none disabled:opacity-40";

/** A tickbox drawn to match the filters; `mixed` when only some rows are. */
export function TableCheckbox(props: {
	checked: boolean;
	indeterminate?: boolean;
	label: string;
	onChange: (event: Event) => void;
}) {
	return (
		<label class="relative -m-2 flex size-8 cursor-pointer items-center justify-center">
			<input
				type="checkbox"
				class="peer sr-only"
				checked={props.checked}
				ref={(el) => {
					// Solid can't set this as an attribute.
					queueMicrotask(() => {
						el.indeterminate = !!props.indeterminate;
					});
				}}
				aria-checked={
					props.indeterminate && !props.checked ? "mixed" : props.checked
				}
				onChange={props.onChange}
				aria-label={props.label}
			/>
			<span
				aria-hidden="true"
				class={cn(
					"flex size-4 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500",
					props.checked || props.indeterminate
						? "border-petal-900 bg-petal-900 text-white"
						: "border-petal-300 bg-white",
				)}
			>
				<Show
					when={props.checked}
					fallback={
						<Show when={props.indeterminate}>
							<span class="h-0.5 w-2 rounded bg-current" />
						</Show>
					}
				>
					<svg aria-hidden="true" {...ICON} stroke-width={3} class="size-3">
						<path d="m5 12 5 5 9-10" />
					</svg>
				</Show>
			</span>
		</label>
	);
}

/** A header that sorts its column: once ascending, again descending. */
export function SortHeader<TData extends RowData, TValue>(props: {
	column: Column<Features, TData, TValue>;
	children: JSX.Element;
}) {
	const sorted = () => props.column.getIsSorted();
	return (
		<button
			type="button"
			onClick={props.column.getToggleSortingHandler()}
			class="-mx-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium whitespace-nowrap transition-colors outline-none hover:bg-petal-100/70 focus-visible:ring-2 focus-visible:ring-petal-500"
		>
			{props.children}
			<svg aria-hidden="true" {...ICON} class="size-3.5 text-petal-900/50">
				<Show when={sorted() === "asc"}>
					<path d="m7 14 5-5 5 5" />
				</Show>
				<Show when={sorted() === "desc"}>
					<path d="m7 10 5 5 5-5" />
				</Show>
				<Show when={!sorted()}>
					<path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
				</Show>
			</svg>
		</button>
	);
}

/** Which columns show: a menu of the ones that can be hidden. */
export function ViewOptions<TData extends RowData>(props: {
	table: SolidTable<Features, TData>;
}) {
	const columns = () =>
		props.table.getAllLeafColumns().filter((column) => column.getCanHide());
	return (
		<PopoverPrimitive.Root placement="bottom-end" gutter={6}>
			<PopoverPrimitive.Trigger class="inline-flex h-10 items-center gap-2 rounded-xl border border-petal-200 bg-white px-3 text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500">
				<svg aria-hidden="true" {...ICON} class="size-4 text-petal-900/60">
					<path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
					<circle cx="16" cy="7" r="2" />
					<circle cx="8" cy="17" r="2" />
				</svg>
				View
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content class="z-50 w-52 rounded-xl border border-petal-100 bg-white p-1 text-petal-900 shadow-lg outline-none">
					<PopoverPrimitive.Title class="px-2.5 pt-1.5 pb-1 text-xs font-medium text-petal-900/55">
						Show columns
					</PopoverPrimitive.Title>
					<For each={columns()}>
						{(column) => (
							<label class="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-petal-50">
								<input
									type="checkbox"
									checked={column.getIsVisible()}
									onChange={(e) =>
										column.toggleVisibility(e.currentTarget.checked)
									}
									class="size-4 accent-petal-900"
								/>
								{column.columnDef.meta?.label ?? column.id}
							</label>
						)}
					</For>
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

/**
 * The table and its footer, filling the space it's given: with many rows the
 * rows scroll under a header that stays put, and the page itself doesn't.
 */
export function DataTable<TData extends RowData>(props: {
	table: SolidTable<Features, TData>;
	/** Read out to screen readers before the rows. */
	caption: string;
	/** Shown when nothing fits the filters. */
	empty: JSX.Element;
	pageSizes: readonly number[];
	/** Next to "N of M selected", for what to do with them. */
	selectionActions?: JSX.Element;
	class?: string;
}) {
	const table = () => props.table;
	const pageCount = () => Math.max(table().getPageCount(), 1);
	const pageIndex = () => table().atoms.pagination.get().pageIndex;
	const selected = () => table().getSelectedRowModel().rows.length;
	const rows = () => table().getRowModel().rows;

	return (
		<div class={cn("flex min-h-0 flex-col", props.class)}>
			<div class="min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl border border-petal-100 bg-white">
				<table class="w-full border-separate border-spacing-0 text-sm">
					<caption class="sr-only">{props.caption}</caption>
					<thead>
						<For each={table().getHeaderGroups()}>
							{(group) => (
								<tr>
									<For each={group.headers}>
										{(header) => (
											<th
												scope="col"
												aria-sort={
													header.column.getIsSorted() === "asc"
														? "ascending"
														: header.column.getIsSorted() === "desc"
															? "descending"
															: undefined
												}
												class={cn(
													"sticky top-0 z-10 h-11 border-b border-petal-100 bg-petal-50/95 px-4 text-left font-medium whitespace-nowrap text-petal-900/75 backdrop-blur",
													header.column.columnDef.meta?.class,
												)}
											>
												<Show when={!header.isPlaceholder}>
													<FlexRender header={header} />
												</Show>
											</th>
										)}
									</For>
								</tr>
							)}
						</For>
					</thead>
					<tbody>
						<For
							each={rows()}
							fallback={
								<tr>
									<td
										colSpan={table().getVisibleLeafColumns().length}
										class="h-40 px-4 text-center text-petal-900/60"
									>
										{props.empty}
									</td>
								</tr>
							}
						>
							{(row) => (
								<tr
									data-selected={row.getIsSelected() || undefined}
									class="transition-colors hover:bg-petal-50/60 data-selected:bg-petal-50"
								>
									<For each={row.getVisibleCells()}>
										{(cell) => (
											<td
												class={cn(
													"h-14 border-b border-petal-100 px-4 align-middle",
													cell.column.columnDef.meta?.grow
														? "min-w-56 max-w-0 w-full"
														: "whitespace-nowrap",
													cell.column.columnDef.meta?.class,
												)}
											>
												<FlexRender cell={cell} />
											</td>
										)}
									</For>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-3 text-sm text-petal-900/70">
				<div class="flex min-h-9 flex-wrap items-center gap-3">
					<p aria-live="polite" class="tabular-nums">
						{selected()} of {table().getFilteredRowModel().rows.length}{" "}
						{selected() === 1 ? "row" : "rows"} selected.
					</p>
					<Show when={selected() > 0}>{props.selectionActions}</Show>
				</div>
				<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
					<label class="flex items-center gap-2 font-medium text-petal-900">
						Rows per page
						<select
							value={table().atoms.pagination.get().pageSize}
							onChange={(e) =>
								table().setPageSize(Number(e.currentTarget.value))
							}
							class="h-9 rounded-lg border border-petal-200 bg-white pr-8 pl-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							<For each={props.pageSizes}>
								{(size) => (
									// Set on the option: the box's own value lands before its options do.
									<option
										value={size}
										selected={size === table().atoms.pagination.get().pageSize}
									>
										{size}
									</option>
								)}
							</For>
						</select>
					</label>
					<p class="font-medium text-petal-900 tabular-nums">
						Page {pageIndex() + 1} of {pageCount()}
					</p>
					<nav aria-label="Pages" class="flex items-center gap-1.5">
						<button
							type="button"
							class={PAGE_BUTTON}
							aria-label="First page"
							disabled={!table().getCanPreviousPage()}
							onClick={() => table().firstPage()}
						>
							<svg aria-hidden="true" {...ICON} class="size-4">
								<path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
							</svg>
						</button>
						<button
							type="button"
							class={PAGE_BUTTON}
							aria-label="Previous page"
							disabled={!table().getCanPreviousPage()}
							onClick={() => table().previousPage()}
						>
							<svg aria-hidden="true" {...ICON} class="size-4">
								<path d="m15 18-6-6 6-6" />
							</svg>
						</button>
						<button
							type="button"
							class={PAGE_BUTTON}
							aria-label="Next page"
							disabled={!table().getCanNextPage()}
							onClick={() => table().nextPage()}
						>
							<svg aria-hidden="true" {...ICON} class="size-4">
								<path d="m9 18 6-6-6-6" />
							</svg>
						</button>
						<button
							type="button"
							class={PAGE_BUTTON}
							aria-label="Last page"
							disabled={!table().getCanNextPage()}
							onClick={() => table().lastPage()}
						>
							<svg aria-hidden="true" {...ICON} class="size-4">
								<path d="m13 17 5-5-5-5M6 17l5-5-5-5" />
							</svg>
						</button>
					</nav>
				</div>
			</div>
		</div>
	);
}
