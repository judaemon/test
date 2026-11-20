import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { EventStatusBadge } from "~/components/admin/event-status";
import { adminButton, adminCard, PageHeader } from "~/components/admin/ui";
import {
	dateSpan,
	deliveryDays,
	EVENT_STATUSES,
	sortEvents,
} from "~/lib/events";
import { cn } from "~/lib/utils";
import { listEventsAdmin } from "~/server/admin/events";

export const Route = createFileRoute("/admin/_dashboard/events/")({
	// Stepped back to after a save, wait for the fresh rows rather than
	// showing the old ones first and swapping them in.
	loader: {
		handler: () => listEventsAdmin(),
		staleReloadMode: "blocking",
	},
	head: () => ({ meta: [{ title: "Events · ORAIA Admin" }] }),
	component: EventsPage,
});

/** Every event, grouped by where it is: current, upcoming, done. */
function EventsPage() {
	const events = Route.useLoaderData();
	const sorted = () => sortEvents(events());
	const groups = () =>
		(["current", "upcoming", "done"] as const)
			.map((status) => ({
				status,
				events: sorted().filter((event) => event.status === status),
			}))
			.filter((group) => group.events.length > 0);

	return (
		<div class="mx-auto max-w-4xl pb-16">
			<PageHeader
				title="Events"
				description="Each academy event the shop takes orders for. The current one runs the shop: it takes orders until it has its most, then it’s fully booked. With none current, the shop is view only."
				actions={
					<Link
						to="/admin/events/$eventId"
						params={{ eventId: "new" }}
						class={adminButton.primary}
					>
						+ Add event
					</Link>
				}
			/>

			<Show
				when={events().length > 0}
				fallback={
					<section class={cn(adminCard, "px-6 py-12 text-center")}>
						<h2 class="font-semibold">No events yet</h2>
						<p class="mx-auto mt-1 max-w-md text-sm text-petal-900/65">
							Add the next event the shop is taking orders for, with its
							ordering period and delivery days.
						</p>
						<Link
							to="/admin/events/$eventId"
							params={{ eventId: "new" }}
							class={cn(adminButton.primary, "mt-5")}
						>
							+ Add event
						</Link>
					</section>
				}
			>
				<div class="grid gap-8">
					<For each={groups()}>
						{(group) => (
							<section aria-labelledby={`events-${group.status}`}>
								<h2
									id={`events-${group.status}`}
									class="mb-3 text-lg font-semibold"
								>
									{EVENT_STATUSES[group.status].label}{" "}
									<span class="font-normal tabular-nums text-petal-900/50">
										({group.events.length})
									</span>
								</h2>
								<ul
									class={cn(
										adminCard,
										"divide-y divide-petal-100 overflow-hidden",
										group.status === "current" && "border-petal-300",
									)}
								>
									<For each={group.events}>
										{(event) => (
											<li class="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
												<div class="min-w-0 flex-1 basis-64">
													<p class="flex flex-wrap items-center gap-2">
														<Link
															to="/admin/events/$eventId"
															params={{ eventId: event.id }}
															class="rounded font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500"
														>
															{event.name}
														</Link>
														<EventStatusBadge status={event.status} />
													</p>
													<dl class="mt-1.5 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
														<dt class="text-petal-900/55">Ordering</dt>
														<dd class="text-petal-900/80">
															{dateSpan(
																event.ordersOpenOn,
																event.ordersCloseOn,
															)}
														</dd>
														<dt class="text-petal-900/55">Delivery</dt>
														<dd class="text-petal-900/80">
															{deliveryDays(event.deliveryDates)}
														</dd>
														<dt class="text-petal-900/55">Orders</dt>
														<dd class="tabular-nums text-petal-900/80">
															{event.maxOrders === null
																? `${event.orders}, no limit`
																: `${event.orders} of ${event.maxOrders}`}
															<Show
																when={
																	event.status === "current" &&
																	event.maxOrders !== null &&
																	event.orders >= event.maxOrders
																}
															>
																{" "}
																<span class="font-medium text-petal-700">
																	· Fully booked
																</span>
															</Show>
														</dd>
													</dl>
												</div>
												<Link
													to="/admin/events/$eventId"
													params={{ eventId: event.id }}
													class={adminButton.secondary}
													aria-label={`Edit ${event.name}`}
												>
													Edit
												</Link>
											</li>
										)}
									</For>
								</ul>
							</section>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
