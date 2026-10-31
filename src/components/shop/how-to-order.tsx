import { Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { createSignal, For } from "solid-js";

import { cn } from "~/lib/utils";

// Functions, because a link can only be created while the page renders.
const STEPS: { title: string; body: () => JSX.Element }[] = [
	{
		title: "Pick your bouquet",
		body: () => "Tap a pre-made bouquet, or build your own. No account needed.",
	},
	{
		title: "Add it to your bag",
		body: () => "Then go to your bag and press Checkout.",
	},
	{
		title: "Enter your details",
		body: () =>
			"Your class, company and name. Not a cadet? Choose Civilian. You can add a free dedication card too.",
	},
	{
		title: "Pay",
		body: () =>
			"Choose how to pay, send the amount shown, then enter your reference number. Paying later? Tick “Reference number to follow”. Your order is confirmed, but it stays on hold until we receive your payment.",
	},
	{
		title: "Review and place your order",
		body: () =>
			"Check everything first, because orders can’t be cancelled. Tick the box to confirm, then press Place order.",
	},
	{
		title: "Follow your order",
		body: () => (
			<>
				Find your name in{" "}
				<Link
					to="/active-orders"
					class="font-medium text-petal-700 underline underline-offset-2"
				>
					Active orders
				</Link>{" "}
				to see its status. If it’s on hold, tap the status to pay.
			</>
		),
	},
];

/** The ordering steps: a side panel on desktop, tap to open on phones. */
export function HowToOrder(props: { class?: string }) {
	const [open, setOpen] = createSignal(false);

	return (
		<aside
			aria-labelledby="how-to-order"
			class={cn(
				"rounded-3xl border border-petal-200 bg-white p-5 lg:p-6",
				props.class,
			)}
		>
			<h2
				id="how-to-order"
				class="font-display type-soft text-xl font-semibold"
			>
				<button
					type="button"
					aria-expanded={open()}
					aria-controls="how-to-order-steps"
					onClick={() => setOpen((value) => !value)}
					class="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-petal-500 lg:pointer-events-none"
				>
					How to order
					<span
						aria-hidden="true"
						class={cn(
							"text-base text-petal-900/50 transition-transform lg:hidden",
							open() && "rotate-180",
						)}
					>
						▾
					</span>
				</button>
			</h2>
			<ol
				id="how-to-order-steps"
				class={cn("mt-3 flex-col gap-4 lg:flex", open() ? "flex" : "hidden")}
			>
				<For each={STEPS}>
					{(step, index) => (
						<li class="flex gap-3">
							<span
								aria-hidden="true"
								class="flex size-7 shrink-0 items-center justify-center rounded-full bg-petal-100 text-sm font-medium text-petal-700"
							>
								{index() + 1}
							</span>
							<div class="min-w-0 text-sm">
								<p class="font-semibold">{step.title}</p>
								<p class="mt-0.5 leading-relaxed text-petal-900/70">
									{step.body()}
								</p>
							</div>
						</li>
					)}
				</For>
			</ol>
		</aside>
	);
}
