import { Link } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import { createMemo, Index, Show } from "solid-js";

import { FlowerMark } from "~/components/site/brand";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "~/components/ui/sheet";
import { products } from "~/data/products";
import {
	cartStore,
	isCartOpen,
	removeFromCart,
	setCartOpen,
	setLineQuantity,
} from "~/lib/cart-store";
import { type PricedLine, priceCart } from "~/lib/pricing";
import { formatPrice } from "~/lib/product";

import { QuantityStepper } from "./quantity-stepper";

export const pillPrimary =
	"inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petal-700 px-6 text-base font-medium text-white transition-colors hover:bg-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-50 disabled:pointer-events-none disabled:opacity-50";

export function CartSheet() {
	const lines = useSelector(cartStore, (state) => state.lines);
	const cart = createMemo(() => priceCart(lines()));
	const hasProblem = () => cart().lines.some((line) => line.problem);
	const close = () => setCartOpen(false);
	let titleRef: HTMLHeadingElement | undefined;

	const removeLine = (line: PricedLine) => {
		removeFromCart(line.productId, line.variantId);
		// The focused Remove button is gone; keep focus inside the dialog.
		titleRef?.focus();
	};

	return (
		<Sheet open={isCartOpen()} onOpenChange={setCartOpen}>
			<SheetContent class="flex w-full flex-col gap-0 bg-cream p-0 text-petal-900 sm:max-w-md">
				<div class="border-b border-petal-100 px-6 pb-4 pt-6">
					<SheetTitle
						ref={titleRef}
						tabindex={-1}
						class="font-display type-soft text-2xl font-semibold text-petal-900 outline-none"
					>
						Your bag
					</SheetTitle>
					<SheetDescription class="text-petal-900/60">
						{cart().itemCount === 0
							? "Nothing here yet."
							: `${cart().itemCount} ${cart().itemCount === 1 ? "bouquet" : "bouquets"}`}
					</SheetDescription>
				</div>

				<Show
					when={cart().lines.length > 0}
					fallback={<EmptyBag onShop={close} />}
				>
					<ul class="flex-1 divide-y divide-petal-100 overflow-y-auto px-6">
						{/* Index keeps each row's DOM (and focus) stable as quantities change. */}
						<Index each={cart().lines}>
							{(line) => (
								<BagLine
									line={line()}
									currency={cart().currency}
									onNavigate={close}
									onRemove={removeLine}
								/>
							)}
						</Index>
					</ul>

					<div class="border-t border-petal-100 bg-white/70 px-6 pb-6 pt-4">
						<dl class="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
							<dt class="text-petal-900/70">Subtotal</dt>
							<dd class="text-right tabular-nums">
								{formatPrice(cart().subtotal, cart().currency)}
							</dd>
							<dt class="text-petal-900/70">Delivery</dt>
							<dd class="text-right font-medium text-sage-600">Free</dd>
							<dt class="pt-2 text-base font-semibold">Total</dt>
							<dd class="pt-2 text-right text-base font-semibold tabular-nums">
								{formatPrice(cart().total, cart().currency)}
							</dd>
						</dl>
						<Show when={hasProblem()}>
							<p
								role="alert"
								class="mt-3 rounded-xl bg-error px-3 py-2 text-sm text-error-foreground"
							>
								Some items need attention before you can check out.
							</p>
						</Show>
						<Link
							to="/checkout"
							onClick={close}
							aria-disabled={hasProblem()}
							tabindex={hasProblem() ? -1 : undefined}
							class={`${pillPrimary} mt-4`}
						>
							Checkout
						</Link>
						<button
							type="button"
							onClick={close}
							class="mt-2 w-full rounded-full py-2 text-sm text-petal-900/70 underline-offset-4 hover:text-petal-900 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Continue shopping
						</button>
					</div>
				</Show>
			</SheetContent>
		</Sheet>
	);
}

function BagLine(props: {
	line: PricedLine;
	currency: string;
	onNavigate: () => void;
	onRemove: (line: PricedLine) => void;
}) {
	const line = () => props.line;
	const label = () => `${line().title}, ${line().colorName}`;

	return (
		<li class="flex gap-4 py-5">
			<Link
				to="/products/$productId"
				params={{ productId: line().productId }}
				search={{ variant: line().variantId }}
				onClick={props.onNavigate}
				class="shrink-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
			>
				<img
					src={line().image}
					alt={label()}
					width={88}
					height={88}
					class="size-22 rounded-2xl bg-petal-50 object-cover"
				/>
			</Link>
			<div class="flex min-w-0 flex-1 flex-col">
				<div class="flex items-start justify-between gap-3">
					<p class="font-medium leading-snug">{line().title}</p>
					<p class="text-sm font-semibold tabular-nums">
						{formatPrice(line().lineTotal, props.currency)}
					</p>
				</div>
				<p class="mt-1 flex items-center gap-1.5 text-sm text-petal-900/65">
					<span
						aria-hidden="true"
						class="size-3 rounded-full border border-black/10"
						style={{ "background-color": line().colorHex }}
					/>
					{line().colorName} · {formatPrice(line().unitPrice, props.currency)}
				</p>
				<Show when={line().problem}>
					{(problem) => (
						<p class="mt-1 text-sm text-error-foreground">
							{problem() === "sold-out"
								? "Sold out — please remove"
								: `Only ${line().maxQuantity} available`}
						</p>
					)}
				</Show>
				<div class="mt-3 flex items-center justify-between">
					<Show when={line().problem !== "sold-out"} fallback={<span />}>
						<QuantityStepper
							value={line().quantity}
							max={line().maxQuantity}
							itemLabel={label()}
							onChange={(qty) =>
								setLineQuantity(line().productId, line().variantId, qty)
							}
						/>
					</Show>
					<button
						type="button"
						onClick={() => props.onRemove(line())}
						aria-label={`Remove ${label()} from bag`}
						class="rounded-full px-2 py-1 text-sm text-petal-900/60 underline-offset-4 hover:text-petal-900 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						Remove
					</button>
				</div>
			</div>
		</li>
	);
}

function EmptyBag(props: { onShop: () => void }) {
	const featured = products[0];
	return (
		<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<FlowerMark class="size-14 opacity-80" />
			<p class="font-display type-soft text-xl font-semibold">
				Your bag is feeling a little empty
			</p>
			<p class="text-sm text-petal-900/65">
				Let’s find something lovely to fill it.
			</p>
			<Show when={featured}>
				{(product) => (
					<Link
						to="/products/$productId"
						params={{ productId: product().id }}
						onClick={props.onShop}
						class={`${pillPrimary} mt-2 w-auto`}
					>
						Shop bouquets
					</Link>
				)}
			</Show>
		</div>
	);
}
