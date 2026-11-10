import { Link } from "@tanstack/solid-router";
import { For, type JSX, Match, Show, Switch } from "solid-js";

import { LOG_AREAS, type LogEntry } from "~/lib/activity-log";
import { formatLogSource, formatLogTime } from "~/lib/order-log";
import { cn } from "~/lib/utils";

const ACTOR_BADGE = {
	staff: "bg-petal-100 text-petal-800",
	customer: "bg-success text-success-foreground",
	system: "bg-black/5 text-petal-900/70",
} as const;

const ACTOR_TYPE = {
	staff: "Staff",
	customer: "Customer",
	system: "System",
} as const;

const cell = "px-3 py-2.5 align-top";
const itemLink = "font-medium underline-offset-2 hover:underline";

/** The order, arrangement, wrapper or supplier a row is about, linked when it still has a page. */
function ItemName(props: { entry: LogEntry }): JSX.Element {
	const id = () => props.entry.itemId;
	const gone = () => props.entry.action === "Deleted";
	return (
		<Show
			when={id() && !gone() ? id() : undefined}
			fallback={<span class="font-medium">{props.entry.itemName}</span>}
		>
			{(itemId) => (
				<Switch>
					<Match when={props.entry.area === "orders"}>
						<Link
							to="/admin/orders/$orderId"
							params={{ orderId: itemId() }}
							class={itemLink}
						>
							{props.entry.itemName}
						</Link>
					</Match>
					<Match when={props.entry.area === "bouquets"}>
						<Link
							to="/admin/signature-bouquets/$productId"
							params={{ productId: itemId() }}
							class={itemLink}
						>
							{props.entry.itemName}
						</Link>
					</Match>
					<Match when={props.entry.area === "wrappers"}>
						<Link
							to="/admin/wrappers/$wrapperId"
							params={{ wrapperId: itemId() }}
							class={itemLink}
						>
							{props.entry.itemName}
						</Link>
					</Match>
					<Match when={props.entry.area === "suppliers"}>
						<Link
							to="/admin/suppliers/$supplierId"
							params={{ supplierId: itemId() }}
							class={itemLink}
						>
							{props.entry.itemName}
						</Link>
					</Match>
					<Match when={props.entry.area === "florists"}>
						<Link
							to="/admin/florists/$floristId"
							params={{ floristId: itemId() }}
							class={itemLink}
						>
							{props.entry.itemName}
						</Link>
					</Match>
				</Switch>
			)}
		</Show>
	);
}

/**
 * Admin → Logs as a table: when, who, which order, arrangement, wrapper or
 * supplier, what changed from what to what, and the page it was done on.
 */
export function ActivityLogTable(props: {
	entries: LogEntry[];
	/** Shows each row's area under its item, when the list mixes them. */
	showArea?: boolean;
	empty?: string;
}) {
	return (
		<Show
			when={props.entries.length > 0}
			fallback={
				<p class="px-4 py-6 text-center text-sm text-petal-900/55">
					{props.empty ?? "Nothing has changed yet."}
				</p>
			}
		>
			<div class="overflow-x-auto">
				<table class="w-full min-w-[960px] text-left text-sm">
					<thead class="border-b border-petal-100 text-xs font-medium text-petal-900/60">
						<tr>
							<th class={cell}>When</th>
							<th class={cell}>Who</th>
							<th class={cell}>Item</th>
							<th class={cell}>What</th>
							<th class={cell}>From</th>
							<th class={cell}>To</th>
							<th class={cell}>Where</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-petal-100">
						<For each={props.entries}>
							{(entry) => (
								<tr>
									<td
										class={cn(cell, "whitespace-nowrap tabular-nums")}
										title={new Date(entry.at).toLocaleString("en-PH", {
											timeZone: "Asia/Manila",
											dateStyle: "full",
											timeStyle: "medium",
										})}
									>
										{formatLogTime(entry.at)}
									</td>
									<td class={cell}>
										<span class="block font-medium">{entry.actor.name}</span>
										<span
											class={cn(
												"mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-medium",
												ACTOR_BADGE[entry.actor.type],
											)}
										>
											{ACTOR_TYPE[entry.actor.type]}
										</span>
									</td>
									<td class={cn(cell, "min-w-32 wrap-anywhere")}>
										<ItemName entry={entry} />
										<Show when={props.showArea}>
											<span class="block text-xs text-petal-900/55">
												{LOG_AREAS[entry.area]}
											</span>
										</Show>
									</td>
									<td class={cn(cell, "min-w-44 wrap-anywhere")}>
										<span class="block">
											{entry.field ?? entry.action}
											<Show when={entry.about}>
												<span class="text-petal-900/60"> · {entry.about}</span>
											</Show>
										</span>
										<Show when={entry.field}>
											<span class="block text-xs text-petal-900/55">
												{entry.action}
											</span>
										</Show>
										<Show when={entry.reason}>
											<span class="mt-1 block whitespace-pre-line text-xs">
												Reason: {entry.reason}
											</span>
										</Show>
									</td>
									<td
										class={cn(
											cell,
											"min-w-28 max-w-72 whitespace-pre-line break-words text-petal-900/65",
										)}
									>
										{entry.from || "—"}
									</td>
									<td
										class={cn(
											cell,
											"min-w-28 max-w-72 whitespace-pre-line break-words font-medium",
										)}
									>
										{entry.to || "—"}
									</td>
									<td
										class={cn(cell, "whitespace-nowrap text-petal-900/65")}
										title={entry.actor.source}
									>
										{formatLogSource(entry.actor)}
									</td>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
		</Show>
	);
}
