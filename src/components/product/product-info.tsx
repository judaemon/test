import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createEffect, createSignal, Match, on, Show, Switch } from "solid-js";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	NumberField,
	NumberFieldDecrementTrigger,
	NumberFieldGroup,
	NumberFieldIncrementTrigger,
	NumberFieldInput,
	NumberFieldLabel,
} from "~/components/ui/number-field";
import { Separator } from "~/components/ui/separator";
import { showToast } from "~/components/ui/toast";
import {
	addToCart,
	cartStore,
	getLineQuantity,
	setCartOpen,
} from "~/lib/cart-store";
import {
	formatPrice,
	getMaxQuantity,
	getStockStatus,
	getVariantPrice,
} from "~/lib/product";
import { cn } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/product";

import { BagIcon, LeafIcon, MinusIcon, PlusIcon, TruckIcon } from "./icons";

// Stand-in for a cart API round trip so the pending state is visible.
const ADD_TO_CART_LATENCY_MS = 450;

interface ProductInfoProps {
	product: Product;
	variant: ProductVariant;
	/** Rendered between the price block and the purchase controls. */
	children?: JSX.Element;
	class?: string;
}

export function ProductInfo(props: ProductInfoProps) {
	const [quantity, setQuantity] = createSignal(1);
	const [isAdding, setIsAdding] = createSignal(false);

	const price = () => getVariantPrice(props.product, props.variant);
	const stockStatus = () => getStockStatus(props.variant);
	const bagLines = useSelector(cartStore, (state) => state.lines);
	const inBag = () =>
		getLineQuantity(bagLines(), props.product.id, props.variant.id);
	// Units still addable once what's already in the bag is counted.
	const remaining = () => Math.max(0, getMaxQuantity(props.variant) - inBag());
	const isMaxedOut = () => props.variant.inStock && remaining() === 0;
	const maxQuantity = () => Math.max(1, remaining());

	// Switching to a variant with less stock must not leave an impossible quantity.
	createEffect(
		on(maxQuantity, (max) => setQuantity((current) => Math.min(current, max))),
	);

	const handleQuantityChange = (value: number) => {
		if (Number.isNaN(value)) return;
		setQuantity(Math.min(Math.max(1, Math.round(value)), maxQuantity()));
	};

	const handleAddToCart = async () => {
		if (!props.variant.inStock || isMaxedOut() || isAdding()) return;
		const variant = props.variant;
		const count = quantity();
		setIsAdding(true);
		try {
			await new Promise((resolve) =>
				setTimeout(resolve, ADD_TO_CART_LATENCY_MS),
			);
			const added = addToCart({
				productId: props.product.id,
				variantId: variant.id,
				quantity: count,
			});
			if (added < count) {
				showToast({
					variant: "warning",
					title:
						added > 0
							? `Added ${added} — that’s all we have`
							: "No more available",
					description: `Your bag now holds every ${variant.colorName} bouquet in stock.`,
					duration: 4000,
				});
			}
			setQuantity(1);
			setCartOpen(true);
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div class={cn("flex flex-col gap-6", props.class)}>
			<header class="flex flex-col gap-2">
				<h1 class="font-display type-soft text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
					{props.product.title}
				</h1>
				<p class="text-xs text-muted-foreground">
					SKU: <span class="font-mono tabular-nums">{props.variant.sku}</span>
				</p>
			</header>

			<div
				class="flex flex-wrap items-center gap-3"
				aria-live="polite"
				aria-atomic="true"
			>
				<p class="text-3xl font-bold tabular-nums">
					<span class="sr-only">Price: </span>
					{formatPrice(price(), props.product.currency)}
				</p>
				<Switch>
					<Match when={stockStatus() === "in-stock"}>
						<Badge variant="success" round>
							In stock
						</Badge>
					</Match>
					<Match when={stockStatus() === "low-stock"}>
						<Badge variant="warning" round>
							Only {props.variant.stockQuantity} left
						</Badge>
					</Match>
					<Match when={stockStatus() === "out-of-stock"}>
						<Badge variant="error" round>
							Sold out
						</Badge>
					</Match>
				</Switch>
			</div>

			<Separator />

			{props.children}

			<Show when={props.variant.inStock && !isMaxedOut()}>
				<NumberField
					class="flex flex-col gap-2"
					rawValue={quantity()}
					onRawValueChange={handleQuantityChange}
					minValue={1}
					maxValue={maxQuantity()}
					format={false}
				>
					<NumberFieldLabel>Quantity</NumberFieldLabel>
					<NumberFieldGroup class="flex w-36 items-center rounded-md border border-input">
						<NumberFieldDecrementTrigger
							aria-label="Decrease quantity"
							class="static size-10 shrink-0 rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
						>
							<MinusIcon class="size-4" />
						</NumberFieldDecrementTrigger>
						<NumberFieldInput class="h-10 rounded-none border-0 px-0 text-center tabular-nums" />
						<NumberFieldIncrementTrigger
							aria-label="Increase quantity"
							class="static size-10 shrink-0 rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
						>
							<PlusIcon class="size-4" />
						</NumberFieldIncrementTrigger>
					</NumberFieldGroup>
				</NumberField>
			</Show>

			<div class="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
				<Show
					when={!isMaxedOut()}
					fallback={
						<Button
							size="lg"
							variant="outline"
							class="h-12 w-full text-base"
							onClick={() => setCartOpen(true)}
						>
							<BagIcon class="size-5" />
							<span>View bag</span>
						</Button>
					}
				>
					<Button
						size="lg"
						class="h-12 w-full text-base"
						disabled={!props.variant.inStock || isAdding()}
						aria-busy={isAdding()}
						onClick={handleAddToCart}
					>
						<Show when={props.variant.inStock} fallback={<span>Sold out</span>}>
							<BagIcon class="size-5" />
							<span>{isAdding() ? "Adding…" : "Add to Bag"}</span>
						</Show>
					</Button>
				</Show>
				<Show when={isMaxedOut()}>
					<p class="text-center text-sm text-muted-foreground">
						You have all {inBag()} available {props.variant.colorName} bouquets
						in your bag.
					</p>
				</Show>
				<Show when={!isMaxedOut() && inBag() > 0}>
					<p class="text-center text-sm text-muted-foreground">
						{inBag()} already in your bag
					</p>
				</Show>
				<Show when={!props.variant.inStock}>
					<p class="text-center text-sm text-muted-foreground">
						{props.variant.colorName} is sold out — pick another color above to
						order today.
					</p>
				</Show>
			</div>

			<ul class="grid gap-3 rounded-lg bg-muted/60 p-4 text-sm">
				<li class="flex items-center gap-3">
					<TruckIcon class="size-5 shrink-0 text-muted-foreground" />
					<span>Free same-day delivery on orders placed before 2pm</span>
				</li>
				<li class="flex items-center gap-3">
					<LeafIcon class="size-5 shrink-0 text-muted-foreground" />
					<span>7-day freshness guarantee</span>
				</li>
			</ul>

			<section class="flex flex-col gap-2">
				<h2 class="text-sm font-semibold">Description</h2>
				<p class="text-sm leading-relaxed text-muted-foreground">
					{props.product.description}
				</p>
			</section>
		</div>
	);
}
