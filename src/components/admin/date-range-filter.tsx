import * as PopoverPrimitive from "@kobalte/core/popover";
import { For, Show } from "solid-js";

import { cn } from "~/lib/utils";

/** Today's date in the shop (Asia/Manila), YYYY-MM-DD. */
const shopDay = (offsetDays = 0) =>
	new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000)
		.toISOString()
		.slice(0, 10);

const PRESETS = [
	{ label: "Today", from: () => shopDay(), to: () => shopDay() },
	{ label: "Yesterday", from: () => shopDay(-1), to: () => shopDay(-1) },
	{ label: "Last 7 days", from: () => shopDay(-6), to: () => shopDay() },
	{ label: "Last 30 days", from: () => shopDay(-29), to: () => shopDay() },
];

/** "2026-11-03" → "Nov 3". */
const short = (day: string) =>
	new Date(`${day}T00:00:00`).toLocaleDateString("en-PH", {
		month: "short",
		day: "numeric",
	});

/**
 * Filters by the day an order was placed, in the same dashed pill as the
 * other filters. Either end can be left open.
 */
export function DateRangeFilter(props: {
	from?: string;
	to?: string;
	onChange: (from?: string, to?: string) => void;
}) {
	const summary = () => {
		const { from, to } = props;
		if (from && to)
			return from === to ? short(from) : `${short(from)} – ${short(to)}`;
		if (from) return `From ${short(from)}`;
		if (to) return `Until ${short(to)}`;
		return undefined;
	};
	const input =
		"h-10 w-full rounded-lg border border-petal-200 bg-white px-2.5 text-base outline-none focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30 sm:text-sm";

	return (
		<PopoverPrimitive.Root placement="bottom-start" gutter={6}>
			<PopoverPrimitive.Trigger
				class={cn(
					"inline-flex h-10 items-center gap-2 rounded-xl border border-dashed bg-white px-3 text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500",
					summary() ? "border-petal-400" : "border-petal-300",
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
					<rect x="3.5" y="5" width="17" height="15" rx="2" />
					<path d="M3.5 10h17M8 3v4M16 3v4" />
				</svg>
				Date
				<Show when={summary()}>
					{(text) => (
						<>
							<span aria-hidden="true" class="h-4 w-px bg-petal-200" />
							<span class="rounded-md bg-petal-100 px-1.5 py-0.5 text-xs font-normal">
								{text()}
							</span>
						</>
					)}
				</Show>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content class="z-50 w-72 rounded-xl border border-petal-100 bg-white p-3 text-petal-900 shadow-lg outline-none">
					<PopoverPrimitive.Title class="mb-2 text-sm font-medium">
						Placed on
					</PopoverPrimitive.Title>
					<div class="mb-3 flex flex-wrap gap-1.5">
						<For each={PRESETS}>
							{(preset) => {
								const on = () =>
									props.from === preset.from() && props.to === preset.to();
								return (
									<button
										type="button"
										onClick={() => props.onChange(preset.from(), preset.to())}
										aria-pressed={on()}
										class={cn(
											"rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
											on()
												? "border-petal-700 bg-petal-700 text-white"
												: "border-petal-200 hover:bg-petal-50",
										)}
									>
										{preset.label}
									</button>
								);
							}}
						</For>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<label class="text-xs text-petal-900/60">
							From
							<input
								type="date"
								value={props.from ?? ""}
								max={props.to}
								onChange={(e) =>
									props.onChange(e.currentTarget.value || undefined, props.to)
								}
								class={cn(input, "mt-1")}
							/>
						</label>
						<label class="text-xs text-petal-900/60">
							To
							<input
								type="date"
								value={props.to ?? ""}
								min={props.from}
								onChange={(e) =>
									props.onChange(props.from, e.currentTarget.value || undefined)
								}
								class={cn(input, "mt-1")}
							/>
						</label>
					</div>
					<Show when={summary()}>
						<button
							type="button"
							onClick={() => props.onChange(undefined, undefined)}
							class="mt-3 w-full rounded-lg px-2.5 py-2 text-center text-sm font-medium hover:bg-petal-50"
						>
							Any date
						</button>
					</Show>
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}
