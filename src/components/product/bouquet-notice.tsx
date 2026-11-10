import * as Dialog from "@kobalte/core/dialog";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { claimPopup } from "~/lib/popup-gate";
import type { BouquetNotice } from "~/types/product";

/** Seen this visit, per arrangement and notice: a new notice shows again. */
const seenKey = (productId: string, notice: BouquetNotice) =>
	`oraia:notice:${productId}:${notice.image}:${notice.text.length}`;

/**
 * An arrangement's notice (e.g. "the wrapper changed"): it pops up when the
 * page opens, once per visit, and a banner on the page opens it again.
 */
export function BouquetNoticePanel(props: {
	productId: string;
	title: string;
	notice: BouquetNotice;
}) {
	const [open, setOpen] = createSignal(false);
	onMount(() => {
		try {
			if (sessionStorage.getItem(seenKey(props.productId, props.notice)))
				return;
		} catch {
			// Storage blocked: show it; it can't be remembered either way.
		}
		claimPopup();
		const timer = setTimeout(() => setOpen(true), 300);
		onCleanup(() => clearTimeout(timer));
	});
	const close = () => {
		setOpen(false);
		try {
			sessionStorage.setItem(seenKey(props.productId, props.notice), "1");
		} catch {
			// Nothing to remember it in; fine.
		}
	};
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				class="mb-4 flex w-full items-center gap-3 rounded-2xl border border-petal-200 bg-petal-50 px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500"
			>
				<span
					aria-hidden="true"
					class="flex size-8 shrink-0 items-center justify-center rounded-full bg-petal-700 font-semibold text-white"
				>
					!
				</span>
				<span class="min-w-0 flex-1">
					<span class="block font-semibold">Notice about {props.title}</span>
					<span class="block text-petal-900/65">
						Please read before ordering.
					</span>
				</span>
				<span class="shrink-0 font-medium text-petal-700 underline underline-offset-2">
					View
				</span>
			</button>
			<Dialog.Root open={open()} onOpenChange={(next) => !next && close()}>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/50 backdrop-blur-sm" />
					<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
						<Dialog.Content class="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white text-petal-900 shadow-2xl outline-none">
							<Dialog.CloseButton
								aria-label="Close"
								class="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-2xl text-petal-900/70 shadow outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-petal-500"
							>
								<span aria-hidden="true">×</span>
							</Dialog.CloseButton>
							<div class="overflow-y-auto">
								<Dialog.Title class="sr-only">
									Notice about {props.title}
								</Dialog.Title>
								<Show when={props.notice.image}>
									{(src) => (
										<img
											src={src()}
											alt={`Notice about ${props.title}`}
											class="block h-auto w-full"
										/>
									)}
								</Show>
								<div class="flex flex-col gap-4 px-6 py-5">
									<Show when={props.notice.text}>
										<Dialog.Description class="whitespace-pre-line text-base leading-relaxed">
											{props.notice.text}
										</Dialog.Description>
									</Show>
									<button
										type="button"
										onClick={close}
										class="inline-flex h-12 w-full items-center justify-center rounded-full bg-petal-700 px-6 text-base font-semibold text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
									>
										Got it
									</button>
								</div>
							</div>
						</Dialog.Content>
					</div>
				</Dialog.Portal>
			</Dialog.Root>
		</>
	);
}
