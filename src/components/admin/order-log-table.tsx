import { Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import {
	formatLogSource,
	formatLogTime,
	formatLogValue,
	ORDER_LOG_ACTIONS,
	ORDER_LOG_FIELDS,
	type OrderLogEntry,
} from "~/lib/order-log";
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

/**
 * The order log as a table: when, who, what changed from what to what, and
 * where. With `showOrder`, each row also links to its order.
 */
export function OrderLogTable(props: {
	entries: OrderLogEntry[];
	showOrder?: boolean;
	/** For narrow spaces: where it was done goes under the time, not in its own column. */
	compact?: boolean;
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
				<table
					class={cn(
						"w-full text-left text-sm",
						props.compact ? "min-w-[600px]" : "min-w-[880px]",
					)}
				>
					<thead class="border-b border-petal-100 text-xs font-medium text-petal-900/60">
						<tr>
							<th class={cell}>When</th>
							<Show when={props.showOrder}>
								<th class={cell}>Order</th>
							</Show>
							<th class={cell}>Who</th>
							<th class={cell}>What</th>
							<th class={cell}>From</th>
							<th class={cell}>To</th>
							<Show when={!props.compact}>
								<th class={cell}>Where</th>
							</Show>
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
										<Show when={props.compact}>
											<span
												class="block text-xs text-petal-900/55"
												title={entry.actor.source}
											>
												{formatLogSource(entry.actor)}
											</span>
										</Show>
									</td>
									<Show when={props.showOrder}>
										<td class={cn(cell, "whitespace-nowrap")}>
											<Link
												to="/admin/orders/$orderId"
												params={{ orderId: entry.orderId }}
												class="font-medium underline-offset-2 hover:underline"
											>
												#{entry.orderNumber ?? "?"}
											</Link>
										</td>
									</Show>
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
									<td class={cn(cell, "min-w-48 wrap-anywhere")}>
										<span class="block">
											{entry.field
												? ORDER_LOG_FIELDS[entry.field]
												: ORDER_LOG_ACTIONS[entry.action]}
											<Show when={entry.about}>
												<span class="text-petal-900/60"> · {entry.about}</span>
											</Show>
										</span>
										<Show when={entry.field}>
											<span class="block text-xs text-petal-900/55">
												{ORDER_LOG_ACTIONS[entry.action]}
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
										{formatLogValue(entry.field, entry.from) || "—"}
									</td>
									<td
										class={cn(
											cell,
											"min-w-28 max-w-72 whitespace-pre-line break-words font-medium",
										)}
									>
										{formatLogValue(entry.field, entry.to) || "—"}
									</td>
									<Show when={!props.compact}>
										<td
											class={cn(cell, "whitespace-nowrap text-petal-900/65")}
											title={entry.actor.source}
										>
											{formatLogSource(entry.actor)}
										</td>
									</Show>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
		</Show>
	);
}
