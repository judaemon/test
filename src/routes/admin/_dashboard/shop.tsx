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
import { ShopClosed } from "~/components/site/shop-closed";
import { formatLogTime } from "~/lib/order-log";
import {
	DEFAULT_SHOP_STATUS,
	SHOP_HEADING_MAX,
	SHOP_MESSAGE_MAX,
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

/**
 * Opens and closes online ordering. The shop is for an event: when orders
 * are full, the owner closes it and shopping pages show a thank-you, with a
 * form where people leave their name for a bouquet at the event.
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

	const save = async (closed: boolean) => {
		setSaving(true);
		try {
			const next = await saveShopStatusFn({
				data: { closed, heading: heading(), message: message() },
			});
			setStatus(next);
			setHeading(next.heading);
			setMessage(next.message);
			// Shopping pages read this with the catalog: show it straight away.
			await router.invalidate();
			if (closed !== initialClosed()) {
				toastSuccess(
					closed
						? "The shop is closed. Shopping pages show your message now."
						: "The shop is open again for orders.",
				);
			} else toastSuccess("Message saved.");
			setInitialClosed(closed);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};
	const [initialClosed, setInitialClosed] = createSignal(
		initial().status.closed,
	);

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
					.map((wish, i) => `${i + 1}. ${wish.name}`)
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
				description="Close online ordering when orders are full. Shopping pages then thank everyone and let people signify interest in buying a bouquet at the event. Orders, payments and tracking keep working."
			/>

			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
				<div class="flex min-w-0 flex-col gap-6">
					{/* ----- Open or closed ----- */}
					<section
						class={cn(
							adminCard,
							"flex flex-wrap items-center gap-4 p-5",
							status().closed && "border-petal-300 bg-petal-50",
						)}
						aria-label="Ordering"
					>
						<span
							class={cn(
								"flex size-12 shrink-0 items-center justify-center rounded-2xl",
								status().closed
									? "bg-petal-700 text-white"
									: "bg-success text-success-foreground",
							)}
							aria-hidden="true"
						>
							<StoreIcon />
						</span>
						<div class="min-w-0 flex-1 basis-48">
							<p class="text-lg font-semibold">
								{status().closed ? "Ordering is closed" : "Ordering is open"}
							</p>
							<p class="text-sm text-petal-900/65">
								{status().closed
									? "Shopping pages show your message, and new orders are turned away."
									: "Customers can order. Close it when you can’t take more."}
							</p>
						</div>
						<Show
							when={isOwner()}
							fallback={
								<p class="text-sm text-petal-900/60">
									Only the owner can open or close the shop.
								</p>
							}
						>
							<Show
								when={status().closed}
								fallback={
									<ConfirmButton
										title="Close online ordering?"
										description="New orders stop right away, even on checkout pages left open. Shopping pages show your message instead. You can open again anytime."
										confirmLabel="Close the shop"
										onConfirm={() => save(true)}
										disabled={saving()}
										class={adminButton.primary}
									>
										Close the shop
									</ConfirmButton>
								}
							>
								<button
									type="button"
									class={adminButton.secondary}
									disabled={saving()}
									onClick={() => void save(false)}
								>
									Open for orders again
								</button>
							</Show>
						</Show>
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
									onClick={() => void save(status().closed)}
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
									For those who wish{" "}
									<span class="tabular-nums text-petal-900/55">
										({wishes().length})
									</span>
								</h2>
								<p class="text-sm text-petal-900/60">
									People who signified interest in buying a bouquet at the
									event, newest first. These aren’t orders.
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
											<span class="min-w-0 flex-1 truncate font-medium">
												{wish.name}
											</span>
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
