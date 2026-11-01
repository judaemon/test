import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createEffect, createSignal, For, on, Show } from "solid-js";

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
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import {
	addToCart,
	cartStore,
	getLineQuantity,
	setCartOpen,
} from "~/lib/cart-store";
import { stemCount } from "~/lib/flowers";
import { formatPrice, getMaxQuantity, getVariantPrice } from "~/lib/product";
import { type BouquetSizeInfo, findSize } from "~/lib/sizes";
import { useFlowerPhotos, useSizes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import type { Product, ProductVariant } from "~/types/product";

import { BagIcon, MinusIcon, PlusIcon } from "./icons";

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
	const sizes = useSizes();
	const size = () => findSize(sizes(), props.product.size);
	const flowerPhoto = useFlowerPhotos();

	const bagLines = useSelector(cartStore, (state) => state.lines);
	const inBag = () =>
		getLineQuantity(bagLines(), props.product.id, props.variant.id);
	// Units still addable once what's already in the bag is counted.
	const remaining = () => Math.max(0, getMaxQuantity(props.variant) - inBag());
	const isMaxedOut = () => props.variant.inStock && remaining() === 0;
	const maxQuantity = () => Math.max(1, remaining());

	// Switching themes must not leave an impossible quantity.
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
			const added = addToCart(
				{ productId: props.product.id, variantId: variant.id, quantity: count },
				getMaxQuantity(variant),
			);
			if (added < count) {
				showToast({
					variant: "warning",
					title:
						added > 0
							? `Added ${added} — that’s the most per order`
							: "No more for this order",
					description: `Your bag holds the most ${variant.colorName} bouquets one order can have.`,
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

				<Show when={props.product.description}>
					<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
						{props.product.description}
					</p>
				</Show>
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
				<Show
					when={props.variant.inStock}
					fallback={
						<Badge variant="error" round>
							Not available
						</Badge>
					}
				>
					<Badge variant="success" round>
						Available
					</Badge>
				</Show>
			</div>

			<Separator />

			{props.children}

			<section
				aria-labelledby="recipe-heading"
				class="flex flex-col gap-3 rounded-lg border p-4"
			>
				<div class="flex items-baseline justify-between gap-3">
					<h2 id="recipe-heading" class="text-sm font-semibold">
						What’s in this bouquet
					</h2>
					<Show when={stemCount(props.variant.recipe)}>
						{(count) => (
							<span class="text-sm font-semibold tabular-nums">
								{count()} flowers
							</span>
						)}
					</Show>
				</div>
				<Show
					when={props.variant.recipe.length > 0}
					fallback={
						<p class="text-sm text-muted-foreground">
							Ask us about the flowers in this bouquet.
						</p>
					}
				>
					<ul class="flex flex-col gap-1.5 text-sm">
						<For each={props.variant.recipe}>
							{(item) => (
								<li class="flex items-center justify-between gap-3">
									<span class="flex items-center gap-2.5">
										<Show
											when={flowerPhoto(item.flower, item.color)}
											fallback={<span class="size-10 shrink-0" />}
										>
											{(src) => (
												<ZoomableImage
													src={src()}
													alt={item.flower}
													caption={item.flower}
													class="size-10 shrink-0 rounded-md border object-cover"
												/>
											)}
										</Show>
										<span>
											{item.flower}
											<Show when={item.color}>
												<span class="text-muted-foreground">
													{" "}
													· {item.color}
												</span>
											</Show>
										</span>
									</span>
									<span class="shrink-0 tabular-nums text-muted-foreground">
										{item.count ? `× ${item.count}` : "cluster"}
									</span>
								</li>
							)}
						</For>
					</ul>
				</Show>
				<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t pt-3 text-sm">
					<Show when={props.variant.wrapperColor}>
						<dt class="text-muted-foreground">Wrapper</dt>
						<dd>{props.variant.wrapperColor}</dd>
					</Show>
					<Show when={size()}>
						{(s) => (
							<>
								<dt class="text-muted-foreground">Size</dt>
								<dd>
									<span class="font-medium">{s().name}</span> ·{" "}
									{s().description.toLowerCase()}
								</dd>
							</>
						)}
					</Show>
				</dl>
			</section>

			<Show when={size()}>
				{(s) => <SizeGuide sizes={sizes()} current={s().id} />}
			</Show>

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
						<Show
							when={props.variant.inStock}
							fallback={<span>Not available</span>}
						>
							<BagIcon class="size-5" />
							<span>{isAdding() ? "Adding…" : "Add to Bag"}</span>
						</Show>
					</Button>
				</Show>
				<Show when={isMaxedOut()}>
					<p class="text-center text-sm text-muted-foreground">
						Your bag has {inBag()} {props.variant.colorName} bouquets, the most
						for one order.
					</p>
				</Show>
				<Show when={!isMaxedOut() && inBag() > 0}>
					<p class="text-center text-sm text-muted-foreground">
						{inBag()} already in your bag
					</p>
				</Show>
				<Show when={!props.variant.inStock}>
					<p class="text-center text-sm text-muted-foreground">
						{props.variant.colorName} isn’t available right now. Pick another
						theme above to order.
					</p>
				</Show>
			</div>
		</div>
	);
}

/** Every size side by side, smallest first, with this bouquet's marked. */
function SizeGuide(props: { sizes: BouquetSizeInfo[]; current: string }) {
	return (
		<section aria-labelledby="size-guide-heading" class="flex flex-col gap-3">
			<h2 id="size-guide-heading" class="text-sm font-semibold">
				Size guide
			</h2>
			<ul
				class="grid gap-2"
				style={{
					"grid-template-columns": `repeat(${Math.min(props.sizes.length, 4)}, minmax(0, 1fr))`,
				}}
			>
				<For each={props.sizes}>
					{(size) => {
						const current = () => size.id === props.current;
						return (
							<li
								aria-current={current() ? "true" : undefined}
								class={cn(
									"flex flex-col overflow-hidden rounded-lg border text-xs",
									current()
										? "border-foreground ring-1 ring-foreground"
										: "text-muted-foreground",
								)}
							>
								<Show when={size.image}>
									<img
										src={size.image}
										alt={`Someone holding a ${size.name} bouquet`}
										loading="lazy"
										class={cn(
											"aspect-[275/620] w-full bg-[#fdf9ea] object-contain",
											!current() && "opacity-70",
										)}
									/>
								</Show>
								<span
									class={cn(
										"flex flex-1 flex-col px-2 py-1.5",
										current() && "bg-muted font-medium",
									)}
								>
									<span class="block font-semibold uppercase tracking-wide">
										{size.name}
									</span>
									{size.description}
									<Show when={current()}>
										<span class="sr-only"> (this bouquet)</span>
									</Show>
								</span>
							</li>
						);
					}}
				</For>
			</ul>
		</section>
	);
}
