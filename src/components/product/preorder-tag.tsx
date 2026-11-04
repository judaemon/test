import { Show } from "solid-js";
import { formatReadyDate } from "~/lib/product";
import { cn } from "~/lib/utils";

/** "Pre-order · ready Sat, Nov 7" as a pill, for pre-order lines in the bag. */
export function PreorderTag(props: { readyBy?: string; class?: string }) {
	return (
		<span
			class={cn(
				"inline-flex w-fit items-center whitespace-nowrap rounded-full border border-warning-foreground/30 bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground",
				props.class,
			)}
		>
			Pre-order
			<Show when={props.readyBy}>
				{(date) => <> · ready {formatReadyDate(date())}</>}
			</Show>
		</span>
	);
}
