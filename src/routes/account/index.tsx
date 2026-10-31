import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";

import { orderDay, orderFor } from "~/lib/checkout";
import { sortByNext } from "~/lib/occasions";
import { formatDate, shopNow } from "~/lib/time";
import {
	listMyAddresses,
	listMyOccasions,
	listMyOrders,
} from "~/server/account";
import { ACTIVE_STAGES, TRACKER_STEPS } from "~/types/order";

export const Route = createFileRoute("/account/")({
	loader: async () => {
		const [orders, occasions, addresses] = await Promise.all([
			listMyOrders(),
			listMyOccasions(),
			listMyAddresses(),
		]);
		return { orders, occasions, addresses };
	},
	component: Overview,
});

const card = "rounded-3xl border border-petal-100 bg-white p-5 sm:p-6";
const cardLink =
	"text-sm font-medium text-petal-700 underline-offset-2 hover:underline";

function Overview() {
	const data = Route.useLoaderData();
	const context = Route.useRouteContext();
	const today = shopNow().date;

	const nextDelivery = createMemo(
		() =>
			data()
				.orders.filter((order) => ACTIVE_STAGES.includes(order.stage))
				// Oldest first: it's the one we'll finish next.
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0],
	);
	const activeCount = () =>
		data().orders.filter((order) => ACTIVE_STAGES.includes(order.stage)).length;
	const upcoming = createMemo(() =>
		sortByNext(data().occasions, today).slice(0, 3),
	);
	const defaultAddress = () => data().addresses.find((a) => a.isDefault);

	return (
		<div class="grid gap-5 md:grid-cols-2">
			<section class={`${card} md:col-span-2`} aria-labelledby="next-heading">
				<div class="flex items-center justify-between gap-3">
					<h2 id="next-heading" class="font-semibold">
						Next delivery
					</h2>
					<Show when={activeCount() > 1}>
						<span class="text-sm text-petal-900/60">
							{activeCount()} orders on their way
						</span>
					</Show>
				</div>
				<Show
					when={nextDelivery()}
					fallback={
						<p class="mt-2 text-sm text-petal-900/65">
							Nothing on its way right now.{" "}
							<Link to="/shop" class={cardLink}>
								Find something lovely
							</Link>
						</p>
					}
				>
					{(order) => {
						const step = () =>
							TRACKER_STEPS.find((s) => s.stage === order().stage)?.label ??
							"Placed";
						return (
							<div class="mt-3 flex flex-wrap items-center gap-4">
								<img
									src={order().lines[0]?.image}
									alt=""
									class="size-16 rounded-2xl bg-petal-50 object-cover"
								/>
								<div class="min-w-0 flex-1">
									<p class="font-medium">
										{step()} · for {orderFor(order().details)}
									</p>
									<p class="text-sm text-petal-900/60">
										Placed {formatDate(orderDay(order().createdAt))}
									</p>
								</div>
								<Link to="/account/orders" class={cardLink}>
									Track order →
								</Link>
							</div>
						);
					}}
				</Show>
			</section>

			<section class={card} aria-labelledby="occasions-heading">
				<div class="flex items-center justify-between gap-3">
					<h2 id="occasions-heading" class="font-semibold">
						Coming up
					</h2>
					<Link to="/account/occasions" class={cardLink}>
						Manage
					</Link>
				</div>
				<Show
					when={upcoming().length > 0}
					fallback={
						<p class="mt-2 text-sm text-petal-900/65">
							Save birthdays and anniversaries and they’ll show up here.
						</p>
					}
				>
					<ul class="mt-3 flex flex-col gap-3">
						<For each={upcoming()}>
							{(occasion) => (
								<li class="flex items-center justify-between gap-3">
									<span>
										<span class="block text-sm font-medium">
											{occasion.title}
										</span>
										<span class="block text-xs text-petal-900/60">
											{formatDate(occasion.date, {
												month: "long",
												day: "numeric",
											})}{" "}
											·{" "}
											{occasion.daysAway === 0
												? "today!"
												: occasion.daysAway === 1
													? "tomorrow"
													: `in ${occasion.daysAway} days`}
										</span>
									</span>
									<Show when={occasion.daysAway <= 14}>
										<Link to="/shop" class={cardLink}>
											Order flowers
										</Link>
									</Show>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>

			<section class={card} aria-labelledby="addresses-heading">
				<div class="flex items-center justify-between gap-3">
					<h2 id="addresses-heading" class="font-semibold">
						Saved addresses
					</h2>
					<Link to="/account/addresses" class={cardLink}>
						Manage
					</Link>
				</div>
				<Show
					when={defaultAddress()}
					fallback={
						<p class="mt-2 text-sm text-petal-900/65">
							Save addresses to fill in checkout in one tap.
						</p>
					}
				>
					{(address) => (
						<p class="mt-3 text-sm text-petal-900/70">
							<span class="font-medium text-petal-900">{address().label}</span>{" "}
							· {address().recipientName}
							<br />
							{address().address}, {address().city}
							<Show when={data().addresses.length > 1}>
								<span class="mt-1 block text-xs text-petal-900/55">
									+{data().addresses.length - 1} more
								</span>
							</Show>
						</p>
					)}
				</Show>
			</section>

			<section
				class={`${card} md:col-span-2`}
				aria-labelledby="details-heading"
			>
				<h2 id="details-heading" class="font-semibold">
					Account details
				</h2>
				<dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1 text-sm">
					<dt class="text-petal-900/60">Name</dt>
					<dd>{context().user.name}</dd>
					<dt class="text-petal-900/60">Email</dt>
					<dd class="break-all">{context().user.email}</dd>
				</dl>
			</section>
		</div>
	);
}
