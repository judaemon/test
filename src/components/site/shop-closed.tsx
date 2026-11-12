import { Link } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import { FlowerMark, Sparkle, Wordmark } from "~/components/site/brand";
import { TAGLINE } from "~/lib/contact";
import { WISH_NAME_MAX } from "~/lib/shop-status";
import { cn } from "~/lib/utils";
import { addShopWishFn } from "~/server/shop-status";

/**
 * What shopping pages show while the shop is closed: a thank-you, where to
 * find ORAIA at the event, and a form to leave a name for a bouquet there.
 * `preview` (Admin → Shop) draws it without sending anything.
 */
export function ShopClosed(props: {
	heading: string;
	message: string;
	preview?: boolean;
}) {
	const [name, setName] = createSignal("");
	const [sending, setSending] = createSignal(false);
	const [error, setError] = createSignal("");
	const [thanked, setThanked] = createSignal<string>();

	const send = async (event: SubmitEvent) => {
		event.preventDefault();
		if (props.preview) return;
		const form = event.currentTarget as HTMLFormElement;
		setError("");
		setSending(true);
		try {
			const result = await addShopWishFn({
				data: {
					name: name(),
					website: (form.elements.namedItem("website") as HTMLInputElement)
						?.value,
				},
			});
			if (result.ok) setThanked(result.name);
			else setError(result.message);
		} catch {
			setError("That didn’t go through. Please try again.");
		} finally {
			setSending(false);
		}
	};

	const paragraphs = () =>
		props.message
			.split(/\n\s*\n/)
			.map((part) => part.trim())
			.filter(Boolean);

	return (
		<div
			class={cn(
				// Lays out by its own width, so the admin preview shows it as a phone would.
				"@container relative overflow-hidden bg-cream text-petal-900",
				props.preview ? "rounded-2xl" : "min-h-screen",
			)}
		>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-linear-to-b from-petal-100/70 via-petal-50/40 to-transparent"
			/>
			<main
				class={cn(
					"relative mx-auto w-full max-w-lg px-5 @4xl:max-w-6xl @4xl:px-10",
					props.preview
						? "py-10"
						: "pb-14 pt-10 @sm:pt-14 @4xl:flex @4xl:min-h-screen @4xl:items-center @4xl:py-16",
				)}
			>
				<div class="w-full @4xl:grid @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] @4xl:items-center @4xl:gap-16">
					{/* ----- The thank-you ----- */}
					<div class="text-center @4xl:text-left">
						<div class="flex flex-col items-center gap-3 @4xl:flex-row @4xl:gap-4">
							<FlowerMark class="block size-12 @4xl:size-14" />
							<div class="flex flex-col items-center @4xl:items-start">
								<Wordmark class="block text-xl @4xl:text-2xl" />
								<p class="mt-0.5 font-display text-sm italic text-petal-700">
									{TAGLINE}
								</p>
							</div>
						</div>

						<div
							aria-hidden="true"
							class="mx-auto my-6 flex w-full max-w-xs items-center gap-3 @4xl:mx-0 @4xl:my-8 @4xl:max-w-[34rem]"
						>
							{/* Even on both sides when centered; a short lead-in, then a rule across the text when wide. */}
							<span class="h-px flex-1 bg-linear-to-l from-petal-200 to-transparent @4xl:w-8 @4xl:flex-none @4xl:bg-petal-200" />
							<Sparkle class="size-3 shrink-0 text-petal-500" />
							<span class="h-px flex-1 bg-linear-to-r from-petal-200 to-transparent" />
						</div>

						<h1 class="font-display type-soft text-[32px] font-semibold leading-[1.1] text-balance @lg:text-4xl @4xl:text-[52px] @4xl:leading-[1.05]">
							{props.heading}
						</h1>
						<div class="mx-auto mt-5 flex max-w-[34rem] flex-col gap-3.5 text-[15px] leading-relaxed text-petal-900/75 text-pretty @lg:text-base @4xl:mx-0 @4xl:mt-6 @4xl:text-[17px]">
							<For each={paragraphs()}>
								{(part) => <p class="whitespace-pre-line">{part}</p>}
							</For>
						</div>
						{/* On narrow screens the form is further down: a way straight to it. */}
						<Show when={!thanked()}>
							<a
								href="#wish-heading"
								class="mt-6 inline-flex h-11 items-center gap-1.5 rounded-full border border-petal-200 bg-white/80 px-5 text-sm font-medium text-petal-700 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-petal-500 @4xl:hidden"
							>
								Buying at the event? Signify your interest ↓
							</a>
						</Show>
						<MoreLinks class="mt-9 hidden @4xl:flex" />
					</div>

					{/* ----- For those who wish ----- */}
					<section
						aria-labelledby="wish-heading"
						class="mt-10 w-full scroll-mt-6 rounded-[28px] border border-petal-100 bg-white p-6 text-left shadow-[0_18px_50px_-12px_rgb(92_31_49/0.18)] @sm:p-8 @4xl:mt-0"
					>
						<Show
							when={!thanked()}
							fallback={
								<div aria-live="polite" class="py-6 text-center">
									<FlowerMark class="mx-auto block size-12" />
									<p class="mt-4 font-display text-2xl font-semibold text-balance">
										Thank you, {thanked()}!
									</p>
									<p class="mt-2 text-petal-900/70">
										Your interest is noted. See you at the event, where you can
										choose and buy your bouquet ♡
									</p>
								</div>
							}
						>
							<span class="inline-flex items-center gap-1.5 rounded-full bg-petal-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-petal-700">
								<Sparkle class="size-2.5" />
								For those who wish
							</span>
							<h2
								id="wish-heading"
								class="mt-4 font-display text-2xl font-semibold leading-snug text-balance @4xl:text-[28px]"
							>
								Want to buy a bouquet at the event?
							</h2>
							<p class="mt-2 text-petal-900/70">
								We’re bringing extra bouquets to the event, and you can buy one
								there. Signify your interest by entering your name, so we know
								how many to bring.
							</p>
							{/* Said plainly, so nobody thinks they've ordered or reserved. */}
							<ul
								id="wish-note"
								class="mt-4 flex flex-col gap-2 rounded-2xl bg-petal-50/70 px-4 py-3 text-sm"
							>
								<li class="flex gap-2.5">
									<CheckIcon />
									<span>
										This is{" "}
										<strong class="font-semibold">
											not an order or a reservation
										</strong>
										.
									</span>
								</li>
								<li class="flex gap-2.5">
									<CheckIcon />
									<span>
										<strong class="font-semibold">No payment now.</strong>{" "}
										Choose and pay at the event.
									</span>
								</li>
							</ul>
							<form class="mt-5 flex flex-col gap-3" onSubmit={send}>
								<label class="text-sm font-medium" for="wish-name">
									Your name
								</label>
								<input
									id="wish-name"
									name="name"
									autocomplete="name"
									maxLength={WISH_NAME_MAX}
									required
									placeholder="e.g. Ana Cruz"
									value={name()}
									onInput={(e) => setName(e.currentTarget.value)}
									aria-invalid={!!error()}
									aria-describedby={error() ? "wish-error" : "wish-note"}
									class="-mt-1 h-12 w-full rounded-2xl border border-petal-200 bg-white px-4 text-base text-petal-900 outline-none transition-colors placeholder:text-petal-900/35 focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30"
								/>
								{/* People never see this; bots fill it in. */}
								<div
									aria-hidden="true"
									class="absolute -left-[9999px] size-px overflow-hidden opacity-0"
								>
									<input name="website" tabindex="-1" autocomplete="off" />
								</div>
								<Show when={error()}>
									<p
										id="wish-error"
										role="alert"
										class="-mt-1 text-sm text-error-foreground"
									>
										{error()}
									</p>
								</Show>
								<button
									type="submit"
									disabled={sending()}
									class="inline-flex h-12 w-full items-center justify-center rounded-full bg-petal-700 px-6 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 disabled:opacity-60"
								>
									{sending() ? "Saving…" : "Signify my interest"}
								</button>
							</form>
						</Show>
					</section>

					<MoreLinks class="mt-8 flex @4xl:hidden" />
				</div>
			</main>
		</div>
	);
}

/** For people who already ordered, and for what comes next. */
function MoreLinks(props: { class?: string }) {
	const link =
		"inline-flex min-h-10 items-center gap-1 rounded-full font-medium text-petal-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500";
	return (
		<nav
			aria-label="More"
			class={cn(
				"flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm @4xl:justify-start",
				props.class,
			)}
		>
			<Link to="/active-orders" class={link}>
				Already ordered? Track your order →
			</Link>
			<Link to="/hello" class={link}>
				Follow us for what’s next →
			</Link>
		</nav>
	);
}

function CheckIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="mt-0.5 size-4 shrink-0 text-petal-700"
		>
			<path d="m5 12.5 4.5 4.5L19 7.5" />
		</svg>
	);
}
