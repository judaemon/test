import type {
	PaginationState,
	SortingState,
	Updater,
} from "@tanstack/solid-table";
import { createEffect, createSignal, on, onCleanup } from "solid-js";

import { cn, SEARCH_DEBOUNCE_MS } from "~/lib/utils";

/** TanStack hands over either the next value or a function of the last one. */
export const resolveUpdater = <T,>(updater: Updater<T>, previous: T): T =>
	typeof updater === "function"
		? (updater as (old: T) => T)(previous)
		: updater;

/** "name.asc" from the address, when the column is one that sorts. */
export function sortParam(
	search: Record<string, unknown>,
	sortable: readonly string[],
) {
	const [column, dir] = String(search.sort ?? "").split(".");
	return column &&
		sortable.includes(column) &&
		(dir === "asc" || dir === "desc")
		? `${column}.${dir}`
		: undefined;
}

/** Page 2 onwards; page 1 stays out of the address. */
export function pageParam(search: Record<string, unknown>) {
	const page = Number(search.page);
	return Number.isInteger(page) && page > 1 ? page : undefined;
}

export interface AddressTableSearch {
	sort?: string;
	page?: number;
	perPage?: number;
}

/**
 * A table's order and page, read from and written to the address, so Back
 * and shared links keep them. The defaults (first page size, `defaultSort`)
 * stay out of it.
 */
export function addressTableState(options: {
	search: () => AddressTableSearch;
	set: (patch: AddressTableSearch, keepPage?: boolean) => void;
	defaultSort: SortingState;
	pageSizes: readonly number[];
}) {
	const sorting = (): SortingState => {
		const [id, dir] = (options.search().sort ?? "").split(".");
		return id ? [{ id, desc: dir === "desc" }] : options.defaultSort;
	};
	const pagination = (): PaginationState => ({
		pageIndex: (options.search().page ?? 1) - 1,
		pageSize: options.search().perPage ?? options.pageSizes[0] ?? 10,
	});
	return {
		sorting,
		pagination,
		onSortingChange: (updater: Updater<SortingState>) => {
			const [next] = resolveUpdater(updater, sorting());
			const fallback = options.defaultSort[0];
			const isDefault =
				!next || (next.id === fallback?.id && next.desc === fallback?.desc);
			options.set({
				sort: isDefault
					? undefined
					: `${next.id}.${next.desc ? "desc" : "asc"}`,
			});
		},
		onPaginationChange: (updater: Updater<PaginationState>) => {
			const next = resolveUpdater(updater, pagination());
			const sizeChanged = next.pageSize !== pagination().pageSize;
			options.set(
				{
					page:
						sizeChanged || next.pageIndex < 1 ? undefined : next.pageIndex + 1,
					perPage:
						next.pageSize === options.pageSizes[0] ? undefined : next.pageSize,
				},
				true,
			);
		},
	};
}

/**
 * The search box above a table. Typing updates the address once the person
 * pauses; a change from elsewhere (Reset, Back) shows here unless they're
 * typing.
 */
export function TableSearch(props: {
	value: string;
	onChange: (value: string | undefined) => void;
	label: string;
	placeholder: string;
}) {
	const [query, setQuery] = createSignal(props.value);
	let box: HTMLInputElement | undefined;
	let debounce: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounce));
	createEffect(
		on(
			() => props.value,
			(value) => {
				if (document.activeElement === box) return;
				clearTimeout(debounce);
				setQuery(value);
			},
			{ defer: true },
		),
	);
	return (
		<label class="flex h-10 w-full items-center gap-2 rounded-xl border border-petal-200 bg-white px-3 transition-colors focus-within:border-petal-500 focus-within:ring-2 focus-within:ring-petal-500/30 sm:w-64">
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
			<span class="sr-only">{props.label}</span>
			<input
				ref={box}
				type="search"
				value={query()}
				onInput={(e) => {
					const value = e.currentTarget.value;
					setQuery(value);
					clearTimeout(debounce);
					debounce = setTimeout(
						() => props.onChange(value.trim() || undefined),
						SEARCH_DEBOUNCE_MS,
					);
				}}
				placeholder={props.placeholder}
				class="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-petal-900/40 sm:text-sm"
			/>
		</label>
	);
}

/** Clears every filter; shown only while something narrows the table. */
export function ResetFilters(props: { onClick: () => void; class?: string }) {
	return (
		<button
			type="button"
			onClick={props.onClick}
			class={cn(
				"inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-petal-900/70 transition-colors outline-none hover:bg-petal-100 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500",
				props.class,
			)}
		>
			Reset
			<span aria-hidden="true">✕</span>
		</button>
	);
}

/** Words typed, all found somewhere in `text`. */
export const fitsWords = (text: string, query: string | undefined) => {
	const haystack = text.toLowerCase();
	return (query ?? "")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => haystack.includes(word));
};
