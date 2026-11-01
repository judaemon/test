import * as PopoverPrimitive from "@kobalte/core/popover";
import { createSignal, For, Index, Show } from "solid-js";

import { cn } from "~/lib/utils";

export interface FacetOption {
	key: string;
	label: string;
	/** Bouquets this choice would show, given the other filters. */
	count: number;
}

/**
 * A shop filter: a button that opens a searchable list of choices to tick.
 * Several can be ticked; the button shows what is.
 */
export function FacetFilter(props: {
	label: string;
	options: FacetOption[];
	selected: string[];
	onChange: (selected: string[]) => void;
}) {
	const [query, setQuery] = createSignal("");
	// A short list is quicker to read than to search.
	const searchable = () => props.options.length > 6;
	const chosen = () =>
		props.options.filter((option) => props.selected.includes(option.key));
	const shown = () => {
		const words = query().trim().toLowerCase();
		return props.options.filter((option) =>
			option.label.toLowerCase().includes(words),
		);
	};
	const toggle = (key: string) =>
		props.onChange(
			props.selected.includes(key)
				? props.selected.filter((k) => k !== key)
				: [...props.selected, key],
		);

	return (
		<PopoverPrimitive.Root
			placement="bottom-start"
			gutter={6}
			onOpenChange={(open) => !open && setQuery("")}
		>
			<PopoverPrimitive.Trigger
				class={cn(
					"inline-flex h-10 items-center gap-2 rounded-xl border border-dashed bg-white px-3 text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500",
					chosen().length ? "border-petal-400" : "border-petal-300",
				)}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					class="size-4 text-petal-900/60"
				>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 8v8M8 12h8" />
				</svg>
				{props.label}
				<Show when={chosen().length}>
					<span aria-hidden="true" class="h-4 w-px bg-petal-200" />
					<Show
						when={chosen().length <= 5}
						fallback={
							<span class="rounded-md bg-petal-100 px-1.5 py-0.5 text-xs font-normal">
								{chosen().length} selected
							</span>
						}
					>
						<For each={chosen()}>
							{(option) => (
								<span class="rounded-md bg-petal-100 px-1.5 py-0.5 text-xs font-normal">
									{option.label}
								</span>
							)}
						</For>
					</Show>
				</Show>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content class="z-50 w-64 overflow-hidden rounded-xl border border-petal-100 bg-white text-petal-900 shadow-lg outline-none">
					<PopoverPrimitive.Title class="sr-only">
						Filter by {props.label.toLowerCase()}
					</PopoverPrimitive.Title>
					<Show when={searchable()}>
						<div class="border-b border-petal-100 p-2">
							<label class="flex items-center gap-2 rounded-lg bg-petal-50 px-2.5">
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
								<span class="sr-only">Search {props.label.toLowerCase()}</span>
								<input
									type="search"
									value={query()}
									onInput={(e) => setQuery(e.currentTarget.value)}
									placeholder={props.label}
									class="h-9 w-full bg-transparent text-base outline-none placeholder:text-petal-900/40 sm:text-sm"
								/>
							</label>
						</div>
					</Show>
					<ul class="max-h-72 overflow-y-auto p-1">
						{/* By position: counts change on every tick; keep focus on the box. */}
						<Index
							each={shown()}
							fallback={
								<li class="px-3 py-6 text-center text-sm text-petal-900/55">
									No matches
								</li>
							}
						>
							{(option) => {
								const on = () => props.selected.includes(option().key);
								return (
									<li>
										<label
											class={cn(
												"flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-petal-50",
												!on() &&
													option().count === 0 &&
													"cursor-not-allowed opacity-40 hover:bg-transparent",
											)}
										>
											<input
												type="checkbox"
												checked={on()}
												disabled={!on() && option().count === 0}
												onChange={() => toggle(option().key)}
												class="peer sr-only"
											/>
											<span
												aria-hidden="true"
												class={cn(
													"flex size-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500",
													on()
														? "border-petal-900 bg-petal-900 text-white"
														: "border-petal-300 bg-white",
												)}
											>
												<Show when={on()}>
													<svg
														aria-hidden="true"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="3"
														stroke-linecap="round"
														stroke-linejoin="round"
														class="size-3"
													>
														<path d="m5 12 5 5 9-10" />
													</svg>
												</Show>
											</span>
											<span class="flex-1">{option().label}</span>
											<span class="text-xs tabular-nums text-petal-900/50">
												{option().count}
											</span>
										</label>
									</li>
								);
							}}
						</Index>
					</ul>
					<Show when={props.selected.length}>
						<div class="border-t border-petal-100 p-1">
							<button
								type="button"
								onClick={() => props.onChange([])}
								class="w-full rounded-lg px-2.5 py-2 text-center text-sm font-medium hover:bg-petal-50"
							>
								Clear filters
							</button>
						</div>
					</Show>
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}
