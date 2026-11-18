import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import { ShopDataSection } from "~/components/admin/shop-data";
import {
	adminButton,
	ConfirmButton,
	PageHeader,
	SettingsRow,
	SettingsSection,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import type { ShopMode } from "~/lib/shop-status";
import { cn } from "~/lib/utils";
import { getShopAdminFn, saveShopStatusFn } from "~/server/shop-status";

export const Route = createFileRoute("/admin/_dashboard/shop")({
	loader: () => getShopAdminFn(),
	head: () => ({ meta: [{ title: "Shop · ORAIA Admin" }] }),
	component: ShopPage,
});

/** The three ways the shop runs, in the order an event goes through them. */
const MODES: {
	mode: ShopMode;
	title: string;
	text: string;
	/** Asked before switching to it, since it stops new orders. */
	confirm?: { title: string; description: string; label: string };
	done: string;
}[] = [
	{
		mode: "open",
		title: "Taking orders",
		text: "For an event: customers fill their bag, build bouquets and check out.",
		done: "The shop is taking orders.",
	},
	{
		mode: "closed",
		title: "Fully booked",
		text: "When an event’s orders are full: shopping pages show your fully booked message, and people can leave their name to buy at the event.",
		confirm: {
			title: "Close online ordering?",
			description:
				"New orders stop right away, even on checkout pages left open. Shopping pages show your fully booked message instead. You can open again anytime.",
			label: "Close the shop",
		},
		done: "The shop is fully booked. Shopping pages show your message now.",
	},
	{
		mode: "view",
		title: "View only",
		text: "Between events: the home page shows your bouquets to look at, with ways to message you. No bag, builder or checkout.",
		confirm: {
			title: "Make the shop view only?",
			description:
				"New orders stop right away, even on checkout pages left open. People can still look at every bouquet, and follow and pay for orders they’ve placed.",
			label: "Make it view only",
		},
		done: "The shop is view only. People can look but not order.",
	},
];

/**
 * Shop settings: how the shop runs right now (it follows the event calendar),
 * and, for the owner, a full copy of the shop's data.
 */
function ShopPage() {
	const initial = Route.useLoaderData();
	const router = useRouter();
	const context = Route.useRouteContext();
	const isOwner = () => context().user.role === "owner";
	const [mode, setMode] = createSignal(initial().status.mode);
	const [saving, setSaving] = createSignal(false);

	const switchTo = async (next: ShopMode) => {
		setSaving(true);
		try {
			// The message is edited on the Landing page; send it back unchanged.
			const saved = await saveShopStatusFn({
				data: {
					mode: next,
					heading: initial().status.heading,
					message: initial().status.message,
				},
			});
			setMode(saved.mode);
			// Shopping pages read this with the catalog: show it straight away.
			await router.invalidate();
			toastSuccess(
				MODES.find((option) => option.mode === next)?.done ?? "Saved.",
			);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div class="mx-auto max-w-3xl pb-16">
			<PageHeader
				title="Shop"
				description="Switch how the shop runs as each event comes and goes."
			/>
			<div class="grid gap-10">
				<SettingsSection
					title="Ordering"
					description={
						isOwner()
							? "Orders already placed, payments and tracking keep working in every mode."
							: "Only the owner can change this. Orders already placed, payments and tracking keep working in every mode."
					}
				>
					<For each={MODES}>
						{(option) => {
							const current = () => mode() === option.mode;
							return (
								<SettingsRow
									class={cn(current() && "bg-petal-50/70")}
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
									<Show
										when={!current()}
										fallback={<NowBadge mode={option.mode} />}
									>
										<Show when={isOwner()}>
											<Show
												when={option.confirm}
												fallback={
													<button
														type="button"
														class={adminButton.secondary}
														disabled={saving()}
														onClick={() => void switchTo(option.mode)}
													>
														Switch to this
													</button>
												}
											>
												{(confirm) => (
													<ConfirmButton
														title={confirm().title}
														description={confirm().description}
														confirmLabel={confirm().label}
														onConfirm={() => switchTo(option.mode)}
														disabled={saving()}
														class={adminButton.secondary}
													>
														Switch to this
													</ConfirmButton>
												)}
											</Show>
										</Show>
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
