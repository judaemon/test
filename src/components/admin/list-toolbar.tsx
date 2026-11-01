import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";

import { adminInput } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

export interface ToolbarSelect {
	label: string;
	/** "" is the first option, e.g. "All sizes" or the default order. */
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
	filters: ToolbarSelect[];
	sort: ToolbarSelect;
	/** e.g. "12 of 28 bouquets". */
	summary: string;
	/** Something narrows the list, so offer to clear it. */
	filtered: boolean;
	onClear: () => void;
}) {
	// Typing updates the address once the shopper pauses.
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

	const select =
		"h-11 rounded-xl border border-petal-200 bg-white pl-3 pr-8 text-base text-petal-900 outline-none transition-colors focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30 sm:h-10 sm:text-sm";

	const Select = (p: { field: ToolbarSelect; class?: string }) => (
		<label class={cn("flex min-w-0 flex-col gap-1", p.class)}>
			<span class="text-xs font-medium text-petal-900/60">{p.field.label}</span>
			<select
				value={p.field.value}
				onChange={(e) => p.field.onChange(e.currentTarget.value)}
				class={cn(select, p.field.value && "border-petal-500 font-medium")}
			>
				<For each={p.field.options}>
					{(option) => (
						<option
							value={option.value}
							selected={option.value === p.field.value}
						>
							{option.label}
						</option>
					)}
				</For>
			</select>
		</label>
	);

	return (
		<div class="mb-5 flex flex-col gap-3">
			<div class="flex flex-wrap items-end gap-3">
				<label class="flex min-w-0 flex-1 basis-60 flex-col gap-1 sm:max-w-md">
					<span class="text-xs font-medium text-petal-900/60">Search</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => type(e.currentTarget.value)}
						placeholder={props.placeholder}
						class={adminInput}
					/>
				</label>
				<Select field={props.sort} class="w-full sm:ml-auto sm:w-auto" />
			</div>
			<div class="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
				<For each={props.filters}>{(field) => <Select field={field} />}</For>
			</div>
			<p class="text-sm text-petal-900/60" aria-live="polite">
				{props.summary}
				<Show when={props.filtered}>
					{" · "}
					<button
						type="button"
						class="font-medium text-petal-700 underline underline-offset-2 hover:text-petal-900"
						onClick={() => {
							clearTimeout(debounce);
							setQuery("");
							props.onClear();
						}}
					>
						Clear filters
					</button>
				</Show>
			</p>
		</div>
	);
}

/** A text value from the address, trimmed; missing when blank. */
export function textParam(search: Record<string, unknown>, key: string) {
	const value = search[key];
	return typeof value === "string" && value.trim()
		? value.trim().slice(0, 80)
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
