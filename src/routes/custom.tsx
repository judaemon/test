import { createFileRoute, Link } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import {
	addToCart,
	cartStore,
	removeFromCart,
	setCartOpen,
} from "~/lib/cart-store";
import { CONTACT } from "~/lib/contact";
import {
	billCount,
	CUSTOM_PRODUCT_ID,
	type CustomDesign,
	cashTotal,
	colorChoices,
	colorInStock,
	designKey,
	flowerKinds,
	flowerPhoto,
	itemColor,
	MAX_STEMS_PER_FLOWER,
	priceDesign,
	wrapperInStock,
} from "~/lib/custom-bouquet";
import { formatRecipeItem, stemCount } from "~/lib/flowers";
import { formatPrice, MAX_PER_ORDER, swatchBackground } from "~/lib/product";
import { useCustomSettings } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import type { RecipeItem } from "~/types/product";

interface BuilderSearch {
	/** A bag line's id: open that bouquet to change it. */
	edit?: string;
}

export const Route = createFileRoute("/custom")({
	validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
		edit: typeof search.edit === "string" ? search.edit : undefined,
	}),
	head: () => ({
		meta: [
			{ title: "Build your bouquet · ORAIA" },
			{
				name: "description",
				content:
					"Pick your flowers, colors and wrapper for a bouquet made just for you.",
			},
		],
	}),
	component: BuilderPage,
});

const CURRENCY = "PHP";

/** Swatch colors for the color names staff type in; unknown names get a neutral dot. */
const NAMED_COLORS: Record<string, string> = {
	red: "#b3122e",
	pink: "#f2a6b8",
	"hot pink": "#e0457b",
	white: "#ffffff",
	cream: "#f4ecd9",
	ivory: "#f7f1e1",
	yellow: "#f5c542",
	peach: "#f7b99a",
	coral: "#f27a5c",
	orange: "#f08a24",
	violet: "#8e5bc4",
	purple: "#7b4fa8",
	lavender: "#c3a8e0",
	blue: "#5b7fd1",
	green: "#7fa36b",
	burgundy: "#6d0f24",
	maroon: "#800000",
};
const namedColor = (color: string) =>
	NAMED_COLORS[color.trim().toLowerCase()] ?? "#d9cfc7";
/** "Red & White" or "Red/White" is a two-color choice: the swatch splits. */
const swatchFor = (color: string) => {
	const [first = "", second] = color.split(/\s*(?:&|\/|\band\b)\s*/i);
	return swatchBackground(
		namedColor(first),
		second ? namedColor(second) : undefined,
	);
};

const itemKey = (flower: string, color = "") => `${flower}::${color}`;

function BuilderPage() {
	const settings = useCustomSettings();
	// Chosen flowers: key → stem count.
	const [picked, setPicked] = createStore<Record<string, number>>({});
	const [wrapperId, setWrapperId] = createSignal("");
	// Bills in a money bouquet: face value → how many.
	const [cash, setCash] = createStore<Record<number, number>>({});
	const money = () => settings().money;
	const [added, setAdded] = createSignal(false);

	const option = (name: string) =>
		settings().flowers.find((f) => f.name === name && f.enabled);
	/** The color an item is made in; `""` for a flower with just one. */
	const colorOf = (name: string, color = "") =>
		itemColor(option(name), color || undefined);
	/** Flowers with at least one offered color still in stock. */
	const inStock = (name: string) =>
		!!option(name)?.colors.some((c) => c.enabled && colorInStock(c));
	const kinds = () => flowerKinds(settings());
	const available = () => kinds().filter((k) => inStock(k.name));
	/** "₱90", or "from ₱90" when its colors cost different amounts. */
	const priceLabel = (name: string) => {
		const prices = (option(name)?.colors ?? [])
			.filter((c) => c.enabled)
			.map((c) => c.price);
		const lowest = Math.min(...prices);
		const price = formatPrice(lowest, CURRENCY);
		return prices.some((p) => p !== lowest) ? `from ${price}` : price;
	};
	/** Most stems of one color: the per-flower limit, or what's left. */
	const maxStems = (name: string, color = "") =>
		Math.min(
			MAX_STEMS_PER_FLOWER,
			colorOf(name, color)?.stock ?? MAX_STEMS_PER_FLOWER,
		);
	const wrappers = () => settings().wrappers.filter((w) => w.enabled);

	const design = createMemo<CustomDesign>(() => {
		const items: RecipeItem[] = [];
		for (const kind of kinds()) {
			const colors = colorChoices(kind, option(kind.name));
			for (const color of colors.length ? colors : [""]) {
				const value = picked[itemKey(kind.name, color)];
				if (value === undefined) continue;
				items.push({
					flower: kind.name,
					...(color ? { color } : {}),
					count: value,
				});
			}
		}
		const bills = money().enabled
			? money()
					.denominations.filter((value) => (cash[value] ?? 0) > 0)
					.map((value) => ({ value, count: cash[value] as number }))
			: [];
		return {
			items,
			...(bills.length ? { bills } : {}),
			wrapperId: wrapperId(),
		};
	});
	const priced = createMemo(() => priceDesign(design(), settings()));
	const flowersTotal = () =>
		design().items.reduce((sum, item) => {
			const price = colorOf(item.flower, item.color)?.price ?? 0;
			return sum + (item.count ? price * item.count : price);
		}, 0);
	const wrapper = () => wrappers().find((w) => w.id === wrapperId());
	const bills = () => design().bills ?? [];
	const billFees = () => billCount(bills()) * money().feePerBill;
	/** Bills still allowed before hitting the per-bouquet limit. */
	const billsLeft = () => money().maxBills - billCount(bills());
	const setBills = (value: number, count: number) => {
		setAdded(false);
		setCash(value, Math.max(0, count));
	};

	const setCount = (key: string, count: number) => {
		setAdded(false);
		setPicked(
			produce((state) => {
				if (count <= 0) delete state[key];
				else state[key] = Math.min(count, MAX_STEMS_PER_FLOWER);
			}),
		);
	};

	// Editing a bouquet already in the bag: fill the builder in from it once
	// the bag has loaded, and swap it for the new version on save.
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const bag = useSelector(cartStore);
	const [editing, setEditing] = createSignal<{
		key: string;
		quantity: number;
	} | null>(null);
	createEffect(() => {
		const key = search().edit;
		if (!key || !bag().hydrated || editing()?.key === key) return;
		const line = bag().lines.find(
			(l) => l.productId === CUSTOM_PRODUCT_ID && l.variantId === key,
		);
		if (!line?.custom) return;
		const loaded: Record<string, number> = {};
		// Bouquets built when fillers came as one cluster have no count.
		for (const item of line.custom.items)
			loaded[itemKey(item.flower, item.color)] = item.count ?? 1;
		setPicked(reconcile(loaded));
		const bills: Record<number, number> = {};
		for (const bill of line.custom.bills ?? []) bills[bill.value] = bill.count;
		setCash(reconcile(bills));
		setWrapperId(line.custom.wrapperId);
		setEditing({ key, quantity: line.quantity });
	});

	const addToBag = () => {
		if (priced().problem) return;
		const built = design();
		const replacing = editing();
		if (replacing) removeFromCart(CUSTOM_PRODUCT_ID, replacing.key);
		addToCart(
			{
				productId: CUSTOM_PRODUCT_ID,
				variantId: designKey(built),
				quantity: replacing?.quantity ?? 1,
				custom: built,
			},
			MAX_PER_ORDER,
		);
		if (replacing) {
			setEditing(null);
			void navigate({ search: {}, replace: true });
		}
		setAdded(true);
		setCartOpen(true);
	};

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
				<Link
					to="/shop"
					class="text-sm text-petal-700 underline-offset-4 hover:underline"
				>
					← Back to the shop
				</Link>
				<h1 class="mt-3 font-display type-soft text-4xl font-semibold tracking-tight">
					Build your bouquet
				</h1>
				<p class="mt-2 max-w-xl text-petal-900/70">
					Pick your flowers and colors, add money if you like, then choose a
					wrapper. The price updates as you go.
				</p>
				<Show when={settings().enabled}>
					<p class="mt-2 max-w-xl text-sm text-petal-900/70">
						Want something else? Message us on{" "}
						<a
							href={CONTACT.facebookUrl}
							target="_blank"
							rel="noreferrer"
							class="font-medium text-petal-700 underline"
						>
							Facebook
						</a>{" "}
						or{" "}
						<a
							href={CONTACT.telegramUrl}
							target="_blank"
							rel="noreferrer"
							class="font-medium text-petal-700 underline"
						>
							Telegram
						</a>
						.
					</p>
				</Show>

				<Show
					when={settings().enabled}
					fallback={
						<div class="mt-10 rounded-3xl border border-petal-200 bg-white p-8 text-center">
							<p class="font-display type-soft text-xl font-semibold">
								Custom bouquets are paused for now
							</p>
							<p class="mt-2 text-petal-900/70">
								Message us on{" "}
								<a
									href={CONTACT.facebookUrl}
									target="_blank"
									rel="noreferrer"
									class="font-medium text-petal-700 underline"
								>
									Facebook
								</a>{" "}
								or{" "}
								<a
									href={CONTACT.telegramUrl}
									target="_blank"
									rel="noreferrer"
									class="font-medium text-petal-700 underline"
								>
									Telegram
								</a>
								, or call {CONTACT.phone} and we'll make one for you.
							</p>
						</div>
					}
				>
					<div class="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
						<div class="flex flex-col gap-6">
							<Step number={1} title="Pick your flowers">
								<ul class="grid gap-3 sm:grid-cols-2">
									<For each={available()}>
										{(kind) => {
											const opt = () => option(kind.name);
											const colors = () => colorChoices(kind, opt());
											// The photo follows the last color picked.
											const shownColor = () =>
												colors()
													.filter(
														(c) => picked[itemKey(kind.name, c)] !== undefined,
													)
													.at(-1);
											return (
												<li class="flex flex-col gap-3 rounded-2xl border border-petal-100 bg-white p-4">
													<div class="flex items-start justify-between gap-2">
														<div class="flex items-center gap-2.5">
															<Show when={flowerPhoto(opt(), shownColor())}>
																{(src) => (
																	<ZoomableImage
																		src={src()}
																		alt={kind.name}
																		caption={kind.name}
																		class="size-12 shrink-0 rounded-lg border border-black/10 object-cover"
																	/>
																)}
															</Show>
															<p class="font-medium">
																{kind.name}
																<Show when={kind.hint}>
																	<span class="block text-xs font-normal text-petal-900/55">
																		{kind.hint}
																	</span>
																</Show>
															</p>
														</div>
														<p class="shrink-0 text-sm text-petal-900/65 tabular-nums">
															{priceLabel(kind.name)} each
														</p>
													</div>
													<Show
														when={colors().length > 0}
														fallback={
															<Stepper
																label={kind.name}
																value={picked[itemKey(kind.name)] ?? 0}
																max={maxStems(kind.name)}
																onChange={(n) =>
																	setCount(itemKey(kind.name), n)
																}
															/>
														}
													>
														<fieldset class="flex flex-wrap gap-2">
															<legend class="sr-only">
																{kind.name} colors
															</legend>
															<For each={colors()}>
																{(color) => {
																	const key = itemKey(kind.name, color);
																	const on = () => picked[key] !== undefined;
																	const soldOut = () =>
																		maxStems(kind.name, color) === 0;
																	return (
																		<button
																			type="button"
																			aria-pressed={on()}
																			disabled={soldOut() && !on()}
																			onClick={() =>
																				setCount(key, on() ? 0 : 1)
																			}
																			class={cn(
																				"flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors outline-none sm:px-2.5 sm:py-1 focus-visible:ring-2 focus-visible:ring-petal-500 disabled:opacity-45",
																				on()
																					? "border-petal-700 bg-petal-50 font-medium"
																					: "border-petal-200 hover:border-petal-300",
																			)}
																		>
																			<span
																				aria-hidden="true"
																				class="size-4 rounded-full border border-black/15"
																				style={{
																					background: swatchFor(color),
																				}}
																			/>
																			{color}
																			<Show when={soldOut()}>
																				<span class="text-xs text-petal-900/55">
																					sold out
																				</span>
																			</Show>
																		</button>
																	);
																}}
															</For>
														</fieldset>
														<For
															each={colors().filter(
																(color) =>
																	picked[itemKey(kind.name, color)] !==
																	undefined,
															)}
														>
															{(color) => (
																<div class="flex items-center justify-between gap-2 text-sm">
																	<span class="flex items-center gap-1.5">
																		<Show
																			when={colorOf(kind.name, color)?.image}
																			fallback={
																				<span
																					aria-hidden="true"
																					class="size-3 rounded-full border border-black/15"
																					style={{
																						background: swatchFor(color),
																					}}
																				/>
																			}
																		>
																			{(src) => (
																				<img
																					src={src()}
																					alt=""
																					class="size-7 rounded-md border border-black/10 object-cover"
																				/>
																			)}
																		</Show>
																		{color}
																		<span class="text-xs text-petal-900/55 tabular-nums">
																			{formatPrice(
																				colorOf(kind.name, color)?.price ?? 0,
																				CURRENCY,
																			)}
																		</span>
																	</span>
																	<Stepper
																		label={`${color} ${kind.name}`}
																		value={
																			picked[itemKey(kind.name, color)] ?? 0
																		}
																		max={maxStems(kind.name, color)}
																		onChange={(n) =>
																			setCount(itemKey(kind.name, color), n)
																		}
																	/>
																</div>
															)}
														</For>
													</Show>
												</li>
											);
										}}
									</For>
								</ul>
							</Step>

							<Show when={money().enabled && money().denominations.length > 0}>
								<Step number={2} title="Add money (optional)">
									<p class="-mt-2 mb-3 text-sm text-petal-900/60">
										We fold real bills into the bouquet. You pay each bill’s
										value plus {formatPrice(money().feePerBill, CURRENCY)} per
										bill for folding. Up to {money().maxBills} bills.
									</p>
									<ul class="grid gap-2 sm:grid-cols-2">
										<For each={money().denominations}>
											{(value) => (
												<li class="flex items-center justify-between gap-3 rounded-2xl border border-petal-100 bg-white px-4 py-3">
													<span class="font-display type-soft text-lg font-semibold tabular-nums">
														₱{value.toLocaleString("en-PH")}
													</span>
													<Stepper
														label={`₱${value} bills`}
														value={cash[value] ?? 0}
														max={(cash[value] ?? 0) + billsLeft()}
														onChange={(n) => setBills(value, n)}
													/>
												</li>
											)}
										</For>
									</ul>
									<Show when={bills().length > 0}>
										<p class="mt-3 text-sm">
											Cash in the bouquet:{" "}
											<span class="font-semibold tabular-nums">
												{formatPrice(cashTotal(bills()), CURRENCY)}
											</span>{" "}
											<span class="text-petal-900/60">
												({billCount(bills())}{" "}
												{billCount(bills()) === 1 ? "bill" : "bills"})
											</span>
										</p>
									</Show>
								</Step>
							</Show>

							<Step
								number={
									1 +
									(money().enabled && money().denominations.length > 0
										? 1
										: 0) +
									1
								}
								title="Choose a wrapper"
							>
								<fieldset class="grid grid-cols-2 gap-3 sm:grid-cols-4">
									<legend class="sr-only">Wrapper</legend>
									<For each={wrappers()}>
										{(w) => (
											<label
												class={cn(
													"cursor-pointer",
													!wrapperInStock(w) && "cursor-not-allowed opacity-50",
												)}
											>
												<input
													type="radio"
													name="wrapper"
													value={w.id}
													checked={wrapperId() === w.id}
													disabled={!wrapperInStock(w)}
													onChange={() => {
														setWrapperId(w.id);
														setAdded(false);
													}}
													class="peer sr-only"
												/>
												<span class="flex h-full flex-col items-center gap-2 rounded-2xl border border-petal-200 bg-white p-3 text-center transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500">
													<Show
														when={w.image}
														fallback={
															<span
																aria-hidden="true"
																class="h-12 w-10 border border-black/15 [clip-path:polygon(0_0,100%_0,50%_100%)]"
																style={{ "background-color": w.colorHex }}
															/>
														}
													>
														{(src) => (
															<img
																src={src()}
																alt=""
																class="size-20 rounded-xl border border-black/10 object-cover"
															/>
														)}
													</Show>
													<span class="text-sm font-medium">{w.name}</span>
													<span class="text-xs text-petal-900/60 tabular-nums">
														{w.price > 0
															? `+${formatPrice(w.price, CURRENCY)}`
															: "Free"}
													</span>
													<Show when={w.stock !== undefined && w.stock <= 5}>
														<span class="text-xs font-medium text-error-foreground">
															{w.stock === 0
																? "Sold out"
																: `Only ${w.stock} left`}
														</span>
													</Show>
												</span>
											</label>
										)}
									</For>
								</fieldset>
							</Step>
						</div>

						<aside
							aria-labelledby="summary-heading"
							class="flex flex-col gap-4 rounded-3xl border border-petal-100 bg-white p-6 lg:sticky lg:top-24"
						>
							<h2
								id="summary-heading"
								class="font-display type-soft text-xl font-semibold"
							>
								Your bouquet
							</h2>
							<Show
								when={design().items.length > 0 || bills().length > 0}
								fallback={
									<p class="text-sm text-petal-900/60">
										Nothing yet. Start by picking some flowers.
									</p>
								}
							>
								<Show when={design().items.length > 0}>
									<div>
										<p class="text-sm font-semibold tabular-nums">
											{stemCount(design().items)} flowers
										</p>
										<ul class="mt-1 flex flex-col gap-0.5 text-sm text-petal-900/75">
											<For each={design().items}>
												{(item) => <li>{formatRecipeItem(item)}</li>}
											</For>
										</ul>
									</div>
								</Show>
								<Show when={bills().length > 0}>
									<div>
										<p class="text-sm font-semibold tabular-nums">
											{formatPrice(cashTotal(bills()), CURRENCY)} in cash
										</p>
										<ul class="mt-1 flex flex-col gap-0.5 text-sm text-petal-900/75">
											<For each={bills()}>
												{(bill) => (
													<li class="tabular-nums">
														{bill.count} × ₱{bill.value.toLocaleString("en-PH")}
													</li>
												)}
											</For>
										</ul>
									</div>
								</Show>
							</Show>
							<Show when={wrapper()}>
								{(w) => (
									<p class="text-sm">
										<span class="text-petal-900/60">Wrapper:</span> {w().name}
									</p>
								)}
							</Show>
							<dl class="grid grid-cols-[1fr_auto] gap-y-1 border-t border-petal-100 pt-3 text-sm">
								<dt class="text-petal-900/65">Flowers</dt>
								<dd class="text-right tabular-nums">
									{formatPrice(flowersTotal(), CURRENCY)}
								</dd>
								<dt class="text-petal-900/65">Wrapper</dt>
								<dd class="text-right tabular-nums">
									{formatPrice(wrapper()?.price ?? 0, CURRENCY)}
								</dd>
								<Show when={bills().length > 0}>
									<dt class="text-petal-900/65">Cash</dt>
									<dd class="text-right tabular-nums">
										{formatPrice(cashTotal(bills()), CURRENCY)}
									</dd>
									<dt class="text-petal-900/65">Bill folding</dt>
									<dd class="text-right tabular-nums">
										{formatPrice(billFees(), CURRENCY)}
									</dd>
								</Show>
								<dt class="text-petal-900/65">Arranging</dt>
								<dd class="text-right tabular-nums">
									{formatPrice(settings().baseFee, CURRENCY)}
								</dd>
								<dt class="pt-2 text-base font-semibold">Total</dt>
								<dd class="pt-2 text-right text-base font-semibold tabular-nums">
									{formatPrice(
										flowersTotal() +
											cashTotal(bills()) +
											billFees() +
											(wrapper()?.price ?? 0) +
											settings().baseFee,
										CURRENCY,
									)}
								</dd>
							</dl>
							<Show
								when={
									priced().problem &&
									design().items.length + (wrapperId() ? 1 : 0) > 0
								}
							>
								<p class="rounded-xl bg-petal-50 px-3 py-2 text-sm text-petal-900/75">
									{priced().problem}
								</p>
							</Show>
							<button
								type="button"
								onClick={addToBag}
								disabled={!!priced().problem}
								class={pillPrimary}
							>
								{editing() ? "Update bouquet" : "Add to bag"}
							</button>
							<Show when={added()}>
								<output class="block text-center text-sm text-sage-600">
									Your bag is up to date.
								</output>
							</Show>
						</aside>
					</div>
				</Show>
			</main>
			<SiteFooter />
		</div>
	);
}

function Step(props: { number: number; title: string; children: JSX.Element }) {
	return (
		<section class="rounded-3xl border border-petal-100 bg-white/60 p-5 sm:p-6">
			<h2 class="mb-4 flex items-center gap-3 font-display type-soft text-xl font-semibold">
				<span
					aria-hidden="true"
					class="flex size-7 items-center justify-center rounded-full bg-petal-100 font-sans text-sm text-petal-700"
				>
					{props.number}
				</span>
				{props.title}
			</h2>
			{props.children}
		</section>
	);
}
/** − count + ; going below one takes it out. */
/** − count + ; going below one takes it out. */
function Stepper(props: {
	label: string;
	value: number;
	/** Defaults to the most stems of one flower. */
	max?: number;
	onChange: (value: number) => void;
}) {
	const max = () => props.max ?? MAX_STEMS_PER_FLOWER;
	const button =
		"flex size-11 items-center justify-center rounded-full border border-petal-200 text-lg leading-none transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 disabled:opacity-40 sm:size-9";
	return (
		<div class="flex items-center gap-2">
			<button
				type="button"
				class={button}
				disabled={props.value === 0}
				onClick={() => props.onChange(props.value - 1)}
				aria-label={`One less ${props.label}`}
			>
				−
			</button>
			<input
				type="number"
				min="0"
				max={max()}
				inputMode="numeric"
				value={props.value}
				onChange={(e) =>
					props.onChange(
						Math.min(max(), Math.max(0, Number(e.currentTarget.value) || 0)),
					)
				}
				aria-label={`How many ${props.label}`}
				class="h-11 w-14 rounded-lg border border-petal-200 bg-white text-center text-base tabular-nums outline-none sm:h-9 focus-visible:ring-2 focus-visible:ring-petal-500"
			/>
			<button
				type="button"
				class={button}
				disabled={props.value >= max()}
				onClick={() => props.onChange(props.value + 1)}
				aria-label={`One more ${props.label}`}
			>
				+
			</button>
		</div>
	);
}
