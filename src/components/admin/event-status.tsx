import { EVENT_STATUSES, type EventStatus } from "~/lib/events";
import { cn } from "~/lib/utils";

/** Green while it's the shop's event now, rose ahead of it, quiet once done. */
export function EventStatusBadge(props: {
	status: EventStatus;
	class?: string;
}) {
	return (
		<span
			class={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
				props.status === "current" && "bg-success text-success-foreground",
				props.status === "upcoming" && "bg-petal-100 text-petal-700",
				props.status === "done" && "bg-petal-900/5 text-petal-900/60",
				props.class,
			)}
		>
			{props.status === "current" && (
				<span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
			)}
			{EVENT_STATUSES[props.status].label}
		</span>
	);
}
