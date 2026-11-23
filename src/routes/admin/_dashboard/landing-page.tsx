import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, Match, Show, Switch } from "solid-js";
import { needs } from "~/components/admin/access";

import {
	adminButton,
	adminInput,
	PageHeader,
	SettingsSection,
	TextArea,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { ShopClosed } from "~/components/site/shop-closed";
import { can } from "~/lib/permissions";
import {
	DEFAULT_SHOP_STATUS,
	SHOP_HEADING_MAX,
	SHOP_MESSAGE_MAX,
} from "~/lib/shop-status";
import { cn } from "~/lib/utils";
import { getShopAdminFn, saveShopStatusFn } from "~/server/shop-status";

export const Route = createFileRoute("/admin/_dashboard/landing-page")({
	beforeLoad: needs("shop.view"),
	loader: () => getShopAdminFn(),
	head: () => ({ meta: [{ title: "Landing page · ORAIA Admin" }] }),
	component: LandingPage,
});

/**
 * What visitors see when the shop isn't taking orders: the fully booked
 * message, with a live preview. The names people leave on it are on
 * Interested buyers.
 */
function LandingPage() {
	const initial = Route.useLoaderData();
	const router = useRouter();
	const context = Route.useRouteContext();
	const canChange = () => can(context().user, "shop.manage");
	const mode = () => initial().status.mode;
	const [saved, setSaved] = createSignal({
		heading: initial().status.heading,
		message: initial().status.message,
	});
	const [heading, setHeading] = createSignal(initial().status.heading);
	const [message, setMessage] = createSignal(initial().status.message);
	const wishCount = () => initial().wishes.length;
	const [saving, setSaving] = createSignal(false);

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
					<div class="grid min-w-0 gap-6">
						<form onSubmit={save} class="min-w-0">
							<SettingsSection
								title="Fully booked message"
								description="Shown on shopping pages while the shop is fully booked. Leave a blank line between paragraphs."
								footer={
									<Show
										when={canChange()}
										fallback={
											<p class="me-auto text-sm text-petal-900/60">
												View only: changing this needs “Change the landing
												page”.
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
											disabled={!canChange()}
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
											disabled={!canChange()}
										/>
									</div>
								</div>
							</SettingsSection>
						</form>
						{/* The names left on this page have their own table. */}
						<Link
							to="/admin/interested"
							class="group flex items-center gap-4 rounded-2xl border border-petal-100 bg-white px-5 py-4 transition-colors outline-none hover:border-petal-200 hover:bg-petal-50/60 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							<span class="min-w-0 flex-1">
								<span class="block font-semibold">
									Interested buyers{" "}
									<span class="font-normal tabular-nums text-petal-900/55">
										({wishCount()})
									</span>
								</span>
								<span class="mt-0.5 block text-sm text-petal-900/65">
									People who left their name here to buy a bouquet at the event.
									See, search and copy them on their own page.
								</span>
							</span>
							<span
								aria-hidden="true"
								class="text-petal-700 transition-transform group-hover:translate-x-0.5"
							>
								→
							</span>
						</Link>
					</div>

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
								days={initial().status.days}
								heading={heading() || DEFAULT_SHOP_STATUS.heading}
								message={message() || DEFAULT_SHOP_STATUS.message}
								preview
							/>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
