import { Link } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import { Show } from "solid-js";

import { BagIcon } from "~/components/product/icons";
import { products } from "~/data/products";
import { cartStore, getCartCount } from "~/lib/cart-store";

import { FlowerMark } from "./brand";

const navLink =
	"rounded-full px-3 py-1.5 text-sm text-petal-900/80 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

export function SiteHeader() {
	const cartCount = useSelector(cartStore, getCartCount);
	const featured = products[0];

	return (
		<header class="sticky top-0 z-20 border-b border-petal-100 bg-cream/85 backdrop-blur">
			<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				<Link
					to="/"
					aria-label="ORAIA home"
					class="group flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					<FlowerMark class="size-8 transition-transform duration-500 group-hover:rotate-[72deg]" />
					<span class="font-display font-soft text-xl font-semibold tracking-[0.25em] text-petal-700">
						ORAIA
					</span>
				</Link>

				<nav aria-label="Main" class="flex items-center gap-1 sm:gap-2">
					<Show when={featured}>
						{(product) => (
							<Link
								to="/products/$productId"
								params={{ productId: product().id }}
								class={navLink}
							>
								Shop
							</Link>
						)}
					</Show>
					<Link to="/" hash="colors" class={`${navLink} hidden sm:inline-flex`}>
						Colors
					</Link>
					<Link to="/" hash="about" class={`${navLink} hidden sm:inline-flex`}>
						About
					</Link>
					<output
						class="relative ml-1 inline-flex size-10 items-center justify-center rounded-full text-petal-900"
						aria-label={`Shopping bag, ${cartCount()} ${cartCount() === 1 ? "item" : "items"}`}
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
					</output>
				</nav>
			</div>
		</header>
	);
}
