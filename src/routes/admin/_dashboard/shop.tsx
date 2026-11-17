import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	PageHeader,
	TextArea,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { CompanyLabel } from "~/components/order/company-label";
import { ShopClosed } from "~/components/site/shop-closed";
import { CIVILIAN } from "~/lib/cadets";
import { formatSerialNumber } from "~/lib/checkout";
import { shortDeliveryDate } from "~/lib/delivery-dates";
import { formatLogTime } from "~/lib/order-log";
import {
	DEFAULT_SHOP_STATUS,
	SHOP_HEADING_MAX,
	SHOP_MESSAGE_MAX,
	type ShopMode,
	WISH_DATES,
} from "~/lib/shop-status";
import { cn } from "~/lib/utils";
import {
	deleteShopWishFn,
	getShopAdminFn,
	saveShopStatusFn,
} from "~/server/shop-status";

export const Route = createFileRoute("/admin/_dashboard/shop")({
	loader: () => getShopAdminFn(),
	component: ShopPage,
});

/** The three ways the shop runs, in the order the owner picks from. */
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
	{
		mode: "closed",
		title: "Closed: fully booked",
		text: "When an event’s orders are full: shopping pages show your message below, and people can signify interest in buying at the event.",
		confirm: {
			title: "Close online ordering?",
			description:
				"New orders stop right away, even on checkout pages left open. Shopping pages show your message instead. You can open again anytime.",
			label: "Close the shop",
		},
		done: "The shop is closed. Shopping pages show your message now.",
	},
];

/**
 * How the shop runs: taking orders for an event, view only between events,
 * or closed when an event's orders are full (shopping pages then show a
 * thank-you, with a form where people leave their name for the event).
 */
function ShopPage() {
	const initial = Route.useLoaderData();
	const router = useRouter();
	const context = Route.useRouteContext();
	const isOwner = () => context().user.role === "owner";
	const [status, setStatus] = createSignal(initial().status);
	const [wishes, setWishes] = createSignal(initial().wishes);
	const [heading, setHeading] = createSignal(initial().status.heading);
	const [message, setMessage] = createSignal(initial().status.message);
	const [saving, setSaving] = createSignal(false);
	const [copied, setCopied] = createSignal(false);

	const edited = () =>
		heading().trim() !== status().heading ||
		message().trim() !== status().message;

	const save = async (mode: ShopMode) => {
		setSaving(true);
		try {
			const next = await saveShopStatusFn({
				data: { mode, heading: heading(), message: message() },
			});
			setStatus(next);
			setHeading(next.heading);
			setMessage(next.message);
			// Shopping pages read this with the catalog: show it straight away.
			await router.invalidate();
			if (mode !== savedMode()) {
				toastSuccess(
					MODES.find((option) => option.mode === mode)?.done ?? "Saved.",
				);
			} else toastSuccess("Message saved.");
			setSavedMode(mode);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};
	const [savedMode, setSavedMode] = createSignal(initial().status.mode);

	const remove = async (id: string) => {
		try {
			setWishes(await deleteShopWishFn({ data: { id } }));
		} catch (error) {
			toastError(error);
		}
	};

	const copyNames = async () => {
		try {
			await navigator.clipboard.writeText(
				[...wishes()]
					.reverse()
					.map((wish, i) =>
						[
							`${i + 1}. ${wish.name}`,
							wish.company,
							wish.serialNumber && formatSerialNumber(wish.serialNumber),
							wish.date && shortDeliveryDate(wish.date),
						]
							.filter(Boolean)
							.join(" · "),
					)
					.join("\n"),
			);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<div class="pb-16">
			<PageHeader
				title="Shop"
				description="Take orders for an event, close ordering when it’s full, or make the shop view only between events."
			/>

			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
				<div class="flex min-w-0 flex-col gap-6">
					{/* ----- How the shop runs ----- */}
					<section
						class={cn(adminCard, "flex flex-col gap-3 p-5")}
						aria-labelledby="shop-mode-heading"
					>
						<div class="flex items-center gap-3">
							<span
								class={cn(
									"flex size-10 shrink-0 items-center justify-center rounded-xl",
									status().mode === "open"
										? "bg-success text-success-foreground"
										: "bg-petal-700 text-white",
								)}
								aria-hidden="true"
							>
								<StoreIcon />
							</span>
							<div class="min-w-0">
								<h2 id="shop-mode-heading" class="font-semibold">
									How the shop runs
								</h2>
								<p class="text-sm text-petal-900/60">
									<Show
										when={isOwner()}
										fallback="Only the owner can change this."
									>
										Orders already placed, payments and tracking keep working in
										every mode.
									</Show>
								</p>
							</div>
						</div>
						<ul class="flex flex-col gap-2">
							<For each={MODES}>
								{(option) => {
									const current = () => status().mode === option.mode;
									return (
										<li
											aria-current={current() ? "true" : undefined}
											class={cn(
												"flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4",
												current()
													? "border-petal-500 bg-petal-50"
													: "border-petal-100",
											)}
										>
											<div class="min-w-0 flex-1 basis-56">
												<p class="flex items-center gap-2 font-medium">
													{option.title}
													<Show when={current()}>
														<span class="rounded-full bg-petal-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
															Now
														</span>
													</Show>
												</p>
												<p class="mt-0.5 text-sm text-petal-900/65">
													{option.text}
												</p>
											</div>
											<Show when={isOwner() && !current()}>
												<Show
													when={option.confirm}
													fallback={
														<button
															type="button"
															class={adminButton.secondary}
															disabled={saving()}
															onClick={() => void save(option.mode)}
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
															onConfirm={() => save(option.mode)}
															disabled={saving()}
															class={adminButton.secondary}
														>
															Switch to this
														</ConfirmButton>
													)}
												</Show>
											</Show>
										</li>
									);
								}}
							</For>
						</ul>
					</section>

					{/* ----- The message ----- */}
					<section class={cn(adminCard, "flex flex-col gap-3 p-5")}>
						<div>
							<h2 class="font-semibold">The closed message</h2>
							<p class="text-sm text-petal-900/60">
								What shopping pages say while the shop is closed. Leave a blank
								line between paragraphs.
							</p>
						</div>
						<label class="flex flex-col gap-1.5 text-sm font-medium">
							Heading
							<input
								class={adminInput}
								value={heading()}
								maxLength={SHOP_HEADING_MAX}
								onInput={(e) => setHeading(e.currentTarget.value)}
								disabled={!isOwner()}
							/>
						</label>
						<div class="flex flex-col gap-1.5 text-sm font-medium">
							<span class="flex items-baseline justify-between gap-2">
								<label for="shop-message">Message</label>
								<span class="text-xs font-normal tabular-nums text-petal-900/50">
									{message().length} / {SHOP_MESSAGE_MAX}
								</span>
							</span>
							<TextArea
								id="shop-message"
								class={cn(adminInput, "h-auto min-h-48 py-2.5 leading-relaxed")}
								value={message()}
								maxLength={SHOP_MESSAGE_MAX}
								onInput={(e) => setMessage(e.currentTarget.value)}
								disabled={!isOwner()}
							/>
						</div>
						<Show when={isOwner()}>
							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									class={adminButton.primary}
									disabled={
										saving() ||
										!edited() ||
										!heading().trim() ||
										!message().trim()
									}
									onClick={() => void save(status().mode)}
								>
									{saving() ? "Saving…" : "Save message"}
								</button>
								<button
									type="button"
									class={cn(adminButton.ghost, "ms-auto")}
									onClick={() => {
										setHeading(DEFAULT_SHOP_STATUS.heading);
										setMessage(DEFAULT_SHOP_STATUS.message);
									}}
								>
									Use the original
								</button>
							</div>
						</Show>
					</section>

					{/* ----- Names left ----- */}
					<section class={cn(adminCard, "overflow-hidden")}>
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-petal-100 px-5 py-4">
							<div>
								<h2 class="font-semibold">
									Interested in extra bouquets{" "}
									<span class="tabular-nums text-petal-900/55">
										({wishes().length})
									</span>
								</h2>
								<p class="text-sm text-petal-900/60">
									People who signified interest in buying a bouquet at the
									event, newest first. These aren’t orders.
								</p>
								<p class="mt-1 flex flex-wrap gap-x-4 text-sm font-medium tabular-nums">
									<For each={WISH_DATES}>
										{(day) => (
											<span>
												{shortDeliveryDate(day)}:{" "}
												{wishes().filter((wish) => wish.date === day).length}
											</span>
										)}
									</For>
								</p>
							</div>
							<button
								type="button"
								class={adminButton.secondary}
								disabled={!wishes().length}
								onClick={() => void copyNames()}
							>
								<span aria-live="polite">
									{copied() ? "Copied" : "Copy names"}
								</span>
							</button>
						</div>
						<Show
							when={wishes().length}
							fallback={
								<p class="px-5 py-10 text-center text-sm text-petal-900/60">
									No names yet. They appear here as people leave them on the
									closed page.
								</p>
							}
						>
							<ul class="max-h-[28rem] divide-y divide-petal-100 overflow-y-auto">
								<For each={wishes()}>
									{(wish) => (
										<li class="flex items-center gap-3 px-5 py-2.5">
											<div class="min-w-0 flex-1">
												<p class="truncate font-medium">{wish.name}</p>
												<p class="flex flex-wrap items-center gap-x-2 text-xs text-petal-900/65">
													<Show when={wish.company}>
														<CompanyLabel
															company={
																wish.company === CIVILIAN ? "" : wish.company
															}
															className={
																wish.company === CIVILIAN ? CIVILIAN : ""
															}
														/>
													</Show>
													<Show when={wish.serialNumber}>
														<span class="tabular-nums">
															{formatSerialNumber(wish.serialNumber)}
														</span>
													</Show>
													<Show when={wish.date}>
														<span>{shortDeliveryDate(wish.date)}</span>
													</Show>
												</p>
											</div>
											<span class="shrink-0 text-xs tabular-nums text-petal-900/55">
												{formatLogTime(wish.createdAt)}
											</span>
											<button
												type="button"
												class={cn(adminButton.ghost, "text-xs")}
												onClick={() => void remove(wish.id)}
												aria-label={`Remove ${wish.name}`}
											>
												Remove
											</button>
										</li>
									)}
								</For>
							</ul>
						</Show>
					</section>
				</div>

				{/* ----- What people see ----- */}
				<section class="flex min-w-0 flex-col gap-2 lg:sticky lg:top-6">
					<p class="text-xs font-medium uppercase tracking-[0.18em] text-petal-900/55">
						Preview: what shoppers see while closed
					</p>
					<div class="overflow-hidden rounded-2xl border border-petal-100 shadow-[0_1px_8px_rgb(92_31_49/0.08)]">
						<ShopClosed
							heading={heading() || DEFAULT_SHOP_STATUS.heading}
							message={message() || DEFAULT_SHOP_STATUS.message}
							preview
						/>
					</div>
				</section>
			</div>
		</div>
	);
}

function StoreIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-6"
		>
			<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5" />
		</svg>
	);
}
