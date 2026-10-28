import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";

import { CartSheet } from "~/components/cart/cart-sheet";
import { BagIcon } from "~/components/product/icons";
import { setCartOpen } from "~/lib/cart-store";
import { usePricedCart, useSessionUser } from "~/lib/use-catalog";

import { FlowerMark } from "./brand";

const navLink =
	"rounded-full px-3 py-1.5 text-sm text-petal-900/80 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

export function SiteHeader() {
	const cart = usePricedCart();
	const cartCount = () => cart().itemCount;
	const user = useSessionUser();

	return (
		<header class="sticky top-0 z-20 border-b border-petal-100 bg-cream/85 backdrop-blur">
			<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				<Link
					to="/"
					aria-label="ORAIA home"
					class="group flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					<FlowerMark class="size-8 transition-transform duration-500 group-hover:rotate-[72deg]" />
					<span class="font-display type-soft text-xl font-semibold tracking-[0.25em] text-petal-700">
						ORAIA
					</span>
				</Link>

				<nav aria-label="Main" class="flex items-center gap-1 sm:gap-2">
					<Link
						to="/shop"
						class={navLink}
						activeProps={{ "aria-current": "page" }}
					>
						Shop
					</Link>
					<Link to="/" hash="colors" class={`${navLink} hidden sm:inline-flex`}>
						Colors
					</Link>
					<Link to="/" hash="about" class={`${navLink} hidden sm:inline-flex`}>
						About
					</Link>
					<Show
						when={user()}
						fallback={
							<Link to="/sign-in" class={navLink}>
								Sign in
							</Link>
						}
					>
						<Link
							to="/account"
							aria-label="Your account"
							class="inline-flex size-10 items-center justify-center rounded-full text-petal-900 transition-colors hover:bg-petal-100 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							<AccountIcon class="size-6" />
						</Link>
					</Show>
					<button
						type="button"
						onClick={() => setCartOpen(true)}
						aria-label={`Open bag, ${cartCount()} ${cartCount() === 1 ? "item" : "items"}`}
						class="relative ml-1 inline-flex size-10 items-center justify-center rounded-full text-petal-900 transition-colors hover:bg-petal-100 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						<BagIcon class="size-6" />
						<Show when={cartCount() > 0}>
							<span
								aria-hidden="true"
								class="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-petal-700 px-1 text-[11px] font-semibold leading-5 text-white tabular-nums"
							>
								{cartCount()}
							</span>
						</Show>
					</button>
				</nav>
			</div>
			<CartSheet />
		</header>
	);
}

function AccountIcon(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={props.class}
		>
			<circle cx="12" cy="8" r="4" />
			<path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
		</svg>
	);
}
