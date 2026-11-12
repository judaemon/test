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
				"relative overflow-hidden bg-cream text-petal-900",
				props.preview ? "rounded-2xl" : "min-h-screen",
			)}
		>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-linear-to-b from-petal-100/70 via-petal-50/40 to-transparent"
			/>
			<main
				class={cn(
					"relative mx-auto flex w-full max-w-lg flex-col items-center px-5 text-center",
					props.preview ? "py-10" : "pb-14 pt-12 sm:pt-20",
				)}
			>
				<FlowerMark class="block size-16" />
				<Wordmark class="mt-4 block text-2xl" />
				<p class="mt-1.5 font-display text-sm italic text-petal-700">
					{TAGLINE}
				</p>

				<div
					aria-hidden="true"
					class="my-7 flex items-center justify-center gap-2.5"
				>
					<span class="h-px w-10 bg-petal-200" />
					<Sparkle class="size-3 text-petal-500" />
					<span class="h-px w-10 bg-petal-200" />
				</div>

				<h1 class="font-display type-soft text-3xl font-semibold leading-tight text-balance sm:text-4xl">
					{props.heading}
				</h1>
				<div class="mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-petal-900/75 text-pretty sm:text-base">
					<For each={paragraphs()}>
						{(part) => <p class="whitespace-pre-line">{part}</p>}
					</For>
				</div>

				{/* ----- For those who wish ----- */}
				<section
					aria-labelledby="wish-heading"
					class="mt-9 w-full rounded-3xl border border-petal-100 bg-white px-5 py-6 text-left shadow-[0_8px_30px_rgb(92_31_49/0.06)] sm:px-7"
				>
					<Show
						when={!thanked()}
						fallback={
							<div aria-live="polite" class="py-2 text-center">
								<Sparkle class="mx-auto size-4 text-petal-500" />
								<p class="mt-3 font-display text-2xl font-semibold">
									Thank you, {thanked()}!
								</p>
								<p class="mt-2 text-petal-900/70">
									We’ll prepare a bouquet with you in mind. See you at the event
									♡
								</p>
							</div>
						}
					>
						<p class="text-xs font-medium uppercase tracking-[0.2em] text-petal-700">
							For those who wish
						</p>
						<h2
							id="wish-heading"
							class="mt-1.5 font-display text-xl font-semibold leading-snug"
						>
							Want a bouquet waiting for you?
						</h2>
						<p class="mt-1.5 text-sm text-petal-900/65">
							Leave your name and we’ll bring one with you in mind. No payment,
							just your name.
						</p>
						<form
							class="mt-4 flex flex-col gap-2.5 sm:flex-row"
							onSubmit={send}
						>
							<label class="sr-only" for="wish-name">
								Your name
							</label>
							<input
								id="wish-name"
								name="name"
								autocomplete="name"
								maxLength={WISH_NAME_MAX}
								required
								placeholder="Your name"
								value={name()}
								onInput={(e) => setName(e.currentTarget.value)}
								aria-invalid={!!error()}
								aria-describedby={error() ? "wish-error" : undefined}
								class="h-12 w-full min-w-0 shrink-0 rounded-full sm:w-auto sm:flex-1 border border-petal-200 bg-white px-5 text-base text-petal-900 outline-none transition-colors placeholder:text-petal-900/35 focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30"
							/>
							{/* People never see this; bots fill it in. */}
							<div
								aria-hidden="true"
								class="absolute -left-[9999px] size-px overflow-hidden opacity-0"
							>
								<input name="website" tabindex="-1" autocomplete="off" />
							</div>
							<button
								type="submit"
								disabled={sending()}
								class="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-petal-700 px-6 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 disabled:opacity-60"
							>
								{sending() ? "Saving…" : "Count me in"}
							</button>
						</form>
						<Show when={error()}>
							<p
								id="wish-error"
								role="alert"
								class="mt-2 text-sm text-error-foreground"
							>
								{error()}
							</p>
						</Show>
					</Show>
				</section>

				<nav
					aria-label="More"
					class="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm"
				>
					<Link
						to="/active-orders"
						class="font-medium text-petal-700 underline-offset-4 hover:underline"
					>
						Already ordered? Track your order
					</Link>
					<span aria-hidden="true" class="hidden text-petal-200 sm:inline">
						·
					</span>
					<Link
						to="/hello"
						class="font-medium text-petal-700 underline-offset-4 hover:underline"
					>
						Follow us for what’s next
					</Link>
				</nav>
			</main>
		</div>
	);
}
