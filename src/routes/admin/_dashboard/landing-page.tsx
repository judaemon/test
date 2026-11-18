import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Match, Show, Switch } from "solid-js";

import {
	adminButton,
	adminInput,
	PageHeader,
	SettingsSection,
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
	WISH_DATES,
} from "~/lib/shop-status";
import { cn } from "~/lib/utils";
import {
	deleteShopWishFn,
	getShopAdminFn,
	saveShopStatusFn,
} from "~/server/shop-status";

export const Route = createFileRoute("/admin/_dashboard/landing-page")({
	loader: () => getShopAdminFn(),
	head: () => ({ meta: [{ title: "Landing page · ORAIA Admin" }] }),
	component: LandingPage,
});

/**
 * What visitors see when the shop isn't taking orders: the fully booked
 * message (with a live preview), and the names people leave on it.
 */
function LandingPage() {
	const initial = Route.useLoaderData();
	const router = useRouter();
	const context = Route.useRouteContext();
	const isOwner = () => context().user.role === "owner";
	const mode = () => initial().status.mode;
	const [saved, setSaved] = createSignal({
		heading: initial().status.heading,
		message: initial().status.message,
	});
	const [heading, setHeading] = createSignal(initial().status.heading);
	const [message, setMessage] = createSignal(initial().status.message);
	const [wishes, setWishes] = createSignal(initial().wishes);
	const [saving, setSaving] = createSignal(false);
	const [copied, setCopied] = createSignal(false);

	const edited = () =>
		heading().trim() !== saved().heading ||
		message().trim() !== saved().message;
	const isOriginal = () =>
		heading() === DEFAULT_SHOP_STATUS.heading &&
		message() === DEFAULT_SHOP_STATUS.message;

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const next = await saveShopStatusFn({
				data: { mode: mode(), heading: heading(), message: message() },
			});
			setSaved({ heading: next.heading, message: next.message });
			setHeading(next.heading);
			setMessage(next.message);
			await router.invalidate();
			toastSuccess(
				mode() === "closed"
					? "Saved. Shopping pages show the new message now."
					: "Saved. It shows when the shop is fully booked.",
			);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

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
		<div class="mx-auto max-w-6xl pb-16">
			<PageHeader
				title="Landing page"
				description="What visitors see on the shop when you’re not taking orders."
			/>

			{/* Whether this page is live right now, and where to change that. */}
			<p
				class={cn(
					"mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-sm",
					mode() === "closed"
						? "border-petal-200 bg-petal-50"
						: "border-petal-100 bg-white",
				)}
			>
				<span
					aria-hidden="true"
					class={cn(
						"size-2 shrink-0 rounded-full",
						mode() === "closed" ? "bg-petal-700" : "bg-petal-900/25",
					)}
				/>
				<span class="min-w-0 flex-1">
					<Switch>
						<Match when={mode() === "closed"}>
							<strong class="font-semibold">Showing now.</strong> The shop is
							fully booked, so shopping pages show this message.
						</Match>
						<Match when={mode() === "open"}>
							<strong class="font-semibold">Not showing now.</strong> The shop
							is taking orders. Visitors see this once you mark it fully booked.
						</Match>
						<Match when={mode() === "view"}>
							<strong class="font-semibold">Not showing now.</strong> The shop
							is view only, so the home page shows your bouquets with ways to
							message you.
						</Match>
					</Switch>
				</span>
				<Link
					to="/admin/shop"
					class="shrink-0 rounded font-medium text-petal-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					Change on Shop <span aria-hidden="true">→</span>
				</Link>
			</p>

			<div class="grid gap-10">
				<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
					<form onSubmit={save} class="min-w-0">
						<SettingsSection
							title="Fully booked message"
							description="Shown on shopping pages while the shop is fully booked. Leave a blank line between paragraphs."
							footer={
								<Show
									when={isOwner()}
									fallback={
										<p class="me-auto text-sm text-petal-900/60">
											Only the owner can change this.
										</p>
									}
								>
									<button
										type="button"
										class={cn(adminButton.ghost, "me-auto")}
										disabled={isOriginal()}
										onClick={() => {
											setHeading(DEFAULT_SHOP_STATUS.heading);
											setMessage(DEFAULT_SHOP_STATUS.message);
										}}
									>
										Use the original
									</button>
									<Show when={edited()}>
										<button
											type="button"
											class={adminButton.secondary}
											onClick={() => {
												setHeading(saved().heading);
												setMessage(saved().message);
											}}
										>
											Undo changes
										</button>
									</Show>
									<button
										type="submit"
										class={adminButton.primary}
										disabled={
											saving() ||
											!edited() ||
											!heading().trim() ||
											!message().trim()
										}
									>
										{saving() ? "Saving…" : "Save message"}
									</button>
								</Show>
							}
						>
							<div class="grid gap-4 p-5">
								<div class="flex flex-col gap-1.5">
									<label for="landing-heading" class="text-sm font-medium">
										Heading
									</label>
									<input
										id="landing-heading"
										class={adminInput}
										value={heading()}
										maxLength={SHOP_HEADING_MAX}
										onInput={(e) => setHeading(e.currentTarget.value)}
										disabled={!isOwner()}
									/>
								</div>
								<div class="flex flex-col gap-1.5">
									<span class="flex items-baseline justify-between gap-2">
										<label for="landing-message" class="text-sm font-medium">
											Message
										</label>
										<span class="text-xs tabular-nums text-petal-900/50">
											{message().length} / {SHOP_MESSAGE_MAX}
										</span>
									</span>
									<TextArea
										id="landing-message"
										class={cn(
											adminInput,
											"h-auto min-h-56 py-2.5 leading-relaxed",
										)}
										value={message()}
										maxLength={SHOP_MESSAGE_MAX}
										onInput={(e) => setMessage(e.currentTarget.value)}
										disabled={!isOwner()}
									/>
								</div>
							</div>
						</SettingsSection>
					</form>

					{/* What people see, updating as you type. */}
					<section
						aria-labelledby="landing-preview"
						class="min-w-0 lg:sticky lg:top-24"
					>
						<h2 id="landing-preview" class="text-lg font-semibold">
							Preview
						</h2>
						<p class="mt-0.5 text-sm text-petal-900/65">
							Updates as you type.
							<Show when={edited()}> Not saved yet.</Show>
						</p>
						<div class="mt-4 overflow-hidden rounded-2xl border border-petal-100 shadow-[0_12px_32px_-20px_rgb(92_31_49/0.35)]">
							<ShopClosed
								heading={heading() || DEFAULT_SHOP_STATUS.heading}
								message={message() || DEFAULT_SHOP_STATUS.message}
								preview
							/>
						</div>
					</section>
				</div>

				<SettingsSection
					title={`Interested in extra bouquets (${wishes().length})`}
					description="People who left their name on the fully booked page to buy a bouquet at the event, newest first. These aren’t orders."
				>
					<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
						<p class="flex flex-wrap gap-x-4 text-sm font-medium tabular-nums">
							<For each={WISH_DATES}>
								{(day) => (
									<span>
										{shortDeliveryDate(day)}:{" "}
										{wishes().filter((wish) => wish.date === day).length}
									</span>
								)}
							</For>
						</p>
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
								No names yet. They appear here as people leave them on the fully
								booked page.
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
				</SettingsSection>
			</div>
		</div>
	);
}
