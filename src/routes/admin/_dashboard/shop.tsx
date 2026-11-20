import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { ShopDataSection } from "~/components/admin/shop-data";
import {
	adminButton,
	PageHeader,
	SettingsRow,
	SettingsSection,
} from "~/components/admin/ui";
import type { ShopMode } from "~/lib/shop-status";
import { cn } from "~/lib/utils";
import { getShopAdminFn } from "~/server/shop-status";

export const Route = createFileRoute("/admin/_dashboard/shop")({
	loader: () => getShopAdminFn(),
	head: () => ({ meta: [{ title: "Shop · ORAIA Admin" }] }),
	component: ShopPage,
});

/** The three ways the shop runs, in the order an event goes through them. */
const MODES: { mode: ShopMode; title: string; text: string }[] = [
	{
		mode: "open",
		title: "Taking orders",
		text: "While an event is current and has room: customers fill their bag, build bouquets and check out.",
	},
	{
		mode: "closed",
		title: "Fully booked",
		text: "Once the current event has its most orders: shopping pages show your fully booked message, and people can leave their name to buy at the event.",
	},
	{
		mode: "view",
		title: "View only",
		text: "When no event is current: the home page shows your bouquets to look at, with ways to message you. No bag, builder or checkout.",
	},
];

/**
 * Shop settings: how the shop runs right now, which follows the events, and,
 * for the owner, a full copy of the shop's data.
 */
function ShopPage() {
	const loaded = Route.useLoaderData();
	const context = Route.useRouteContext();
	const isOwner = () => context().user.role === "owner";
	const mode = () => loaded().status.mode;
	const event = () => loaded().event;

	/** Why it's in this mode, in a sentence. */
	const reason = () => {
		const current = event();
		if (!current) return "No event is current.";
		if (current.maxOrders === null)
			return `${current.name} is current, with no most orders set.`;
		const left = current.maxOrders - current.orders;
		return left > 0
			? `${current.name} is current: ${current.orders} of ${current.maxOrders} orders, ${left} to go.`
			: `${current.name} is current and full: ${current.orders} orders, with ${current.maxOrders} the most.`;
	};

	return (
		<div class="mx-auto max-w-3xl pb-16">
			<PageHeader
				title="Shop"
				description="How the shop runs follows your events. Change the event, and the shop changes with it."
			/>
			<div class="grid gap-10">
				<SettingsSection
					title="Ordering"
					description="Orders already placed, payments and tracking keep working in every mode. Cancelled and test orders don’t count toward an event’s most."
					footer={
						<>
							<p class="me-auto text-sm text-petal-900/70">{reason()}</p>
							<Show
								when={event()}
								fallback={
									<Link to="/admin/events" class={adminButton.secondary}>
										Go to Events
									</Link>
								}
							>
								{(current) => (
									<Link
										to="/admin/events/$eventId"
										params={{ eventId: current().id }}
										class={adminButton.secondary}
									>
										Open the event
									</Link>
								)}
							</Show>
						</>
					}
				>
					<For each={MODES}>
						{(option) => {
							const now = () => mode() === option.mode;
							return (
								<SettingsRow
									class={cn(now() && "bg-petal-50/70")}
									label={option.title}
									description={option.text}
									extra={
										<Show when={option.mode === "closed"}>
											<Link
												to="/admin/landing-page"
												class="mt-1.5 inline-flex items-center gap-1 rounded text-sm font-medium text-petal-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500"
											>
												Edit the fully booked message
												<span aria-hidden="true">→</span>
											</Link>
										</Show>
									}
									end
								>
									<Show when={now()}>
										<NowBadge mode={option.mode} />
									</Show>
								</SettingsRow>
							);
						}}
					</For>
				</SettingsSection>

				<Show when={isOwner()}>
					<ShopDataSection />
				</Show>
			</div>
		</div>
	);
}

/** Marks the mode the shop is in: green while orders come in, rose otherwise. */
function NowBadge(props: { mode: ShopMode }) {
	return (
		<span
			class={cn(
				"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
				props.mode === "open"
					? "bg-success text-success-foreground"
					: "bg-petal-100 text-petal-700",
			)}
		>
			<span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
			On now
		</span>
	);
}
