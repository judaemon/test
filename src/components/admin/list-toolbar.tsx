import * as PopoverPrimitive from "@kobalte/core/popover";
import {
	createEffect,
	createSignal,
	For,
	Index,
	on,
	onCleanup,
	Show,
} from "solid-js";

import { FacetFilter, type FacetOption } from "~/components/ui/facet-filter";
import { cn } from "~/lib/utils";

export interface ToolbarFilter {
	label: string;
	options: FacetOption[];
	selected: string[];
	onChange: (selected: string[]) => void;
}

export interface ToolbarSort {
	/** "" is the first option, the default order. */
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
}

/**
 * Search, filters and sort above an admin list. The page keeps the values in
 * its address (so Back and shared links keep them); this only shows them.
 */
export function ListToolbar(props: {
	query: string;
	onQuery: (query: string) => void;
	placeholder: string;
	filters: ToolbarFilter[];
	sort: ToolbarSort;
	/** e.g. "12 of 28 bouquets". */
	summary: string;
	/** Something narrows the list, so offer to clear it. */
	filtered: boolean;
	onClear: () => void;
}) {
	// Typing updates the address once the person pauses.
	const [query, setQuery] = createSignal(props.query);
	createEffect(
		on(
			() => props.query,
			(value) => setQuery(value),
			{ defer: true },
		),
	);
	let debounce: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounce));
	const type = (value: string) => {
		setQuery(value);
		clearTimeout(debounce);
		debounce = setTimeout(() => props.onQuery(value.trim()), 300);
	};

	return (
		<div class="mb-5 flex flex-col gap-2">
			<div class="flex flex-wrap items-center gap-2">
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
					<span class="sr-only">Search</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => type(e.currentTarget.value)}
						placeholder={props.placeholder}
						class="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-petal-900/40 sm:text-sm"
					/>
				</label>
				{/* By position: counts change on every tick, and an open panel must stay. */}
				<Index each={props.filters}>
					{(filter) => (
						<FacetFilter
							label={filter().label}
							options={filter().options}
							selected={filter().selected}
							onChange={(selected) => filter().onChange(selected)}
						/>
					)}
				</Index>
				<Show when={props.filtered}>
					<button
						type="button"
						onClick={() => {
							clearTimeout(debounce);
							setQuery("");
							props.onClear();
						}}
						class="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-petal-900/70 transition-colors outline-none hover:bg-petal-100 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						Reset
						<span aria-hidden="true">✕</span>
					</button>
				</Show>
				<SortMenu sort={props.sort} />
			</div>
			<p class="text-sm text-petal-900/60" aria-live="polite">
				{props.summary}
			</p>
		</div>
	);
}

/** The list's order: a compact button that opens the choices. */
function SortMenu(props: { sort: ToolbarSort }) {
	const [open, setOpen] = createSignal(false);
	const current = () =>
		props.sort.options.find((option) => option.value === props.sort.value) ??
		props.sort.options[0];
	return (
		<PopoverPrimitive.Root
			open={open()}
			onOpenChange={setOpen}
			placement="bottom-end"
			gutter={6}
		>
			<PopoverPrimitive.Trigger
				aria-label={`Sort by: ${current()?.label}`}
				class="inline-flex h-10 items-center gap-2 rounded-xl border border-petal-200 bg-white px-3 text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500 sm:ml-auto"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="size-4 text-petal-900/60"
				>
					<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
				</svg>
				{current()?.label}
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content class="z-50 w-56 rounded-xl border border-petal-100 bg-white p-1 text-petal-900 shadow-lg outline-none">
					<PopoverPrimitive.Title class="sr-only">
						Sort by
					</PopoverPrimitive.Title>
					<For each={props.sort.options}>
						{(option) => (
							<button
								type="button"
								aria-pressed={option.value === props.sort.value}
								onClick={() => {
									props.sort.onChange(option.value);
									setOpen(false);
								}}
								class={cn(
									"flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-petal-50 focus-visible:bg-petal-50",
									option.value === props.sort.value && "font-medium",
								)}
							>
								{option.label}
								<Show when={option.value === props.sort.value}>
									<span aria-hidden="true" class="text-petal-700">
										✓
									</span>
								</Show>
							</button>
						)}
					</For>
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

/** A filter on a list: what's ticked, and whether an item fits a choice. */
export interface Facet<T> {
	chosen: string[];
	matches: (item: T, key: string) => boolean;
}

/**
 * Whether an item fits every filter: any ticked choice within one filter, all
 * the filters together. `skip` leaves one out, for counting its own choices.
 */
export function fitsFacets<T>(
	item: T,
	facets: Record<string, Facet<T>>,
	skip?: string,
) {
	return Object.entries(facets).every(
		([name, facet]) =>
			name === skip ||
			!facet.chosen.length ||
			facet.chosen.some((key) => facet.matches(item, key)),
	);
}

/** How many items a choice would show, given the other filters. */
export function facetCount<T>(
	items: readonly T[],
	facets: Record<string, Facet<T>>,
	name: string,
	key: string,
) {
	const facet = facets[name];
	return items.filter(
		(item) => fitsFacets(item, facets, name) && facet?.matches(item, key),
	).length;
}

/** A text value from the address, trimmed; missing when blank. */
export function textParam(search: Record<string, unknown>, key: string) {
	const value = search[key];
	return typeof value === "string" && value.trim()
		? value.trim().slice(0, 400)
		: undefined;
}

/** A value from the address that must be one of `options`. */
export function choiceParam<T extends string>(
	search: Record<string, unknown>,
	key: string,
	options: readonly T[],
) {
	const value = search[key];
	return options.includes(value as T) ? (value as T) : undefined;
}

/** Every word typed appears somewhere in `text`. */
export function matchesQuery(query: string | undefined, text: string) {
	const haystack = text.toLowerCase();
	return (query ?? "")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => haystack.includes(word));
}
