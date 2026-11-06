import { createFileRoute, Link } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { BouquetCard } from "~/components/shop/bouquet-card";
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
	CUSTOM_BANNER_IMAGE,
	CUSTOM_PRODUCT_ID,
	type CustomDesign,
	cashTotal,
	colorChoices,
	colorInStock,
	designKey,
	flowerKinds,
	flowerPhoto,
	itemColor,
	MAX_REFERENCE_IMAGES,
	MAX_STEMS_PER_FLOWER,
	priceDesign,
	wrapperColors,
	wrapperInStock,
} from "~/lib/custom-bouquet";
import { formatRecipeItem, stemCount } from "~/lib/flowers";
import { photoSrc } from "~/lib/photos";
import {
	formatPrice,
	MAX_PER_ORDER,
	swatchBackground,
	swatchColors,
} from "~/lib/product";
import { pageHead } from "~/lib/site";
import { builderSizes } from "~/lib/sizes";
import {
	useArrangementTypes,
	useCatalog,
	useCustomSettings,
} from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { uploadReferenceImage } from "~/server/custom";
import type { RecipeItem } from "~/types/product";

interface BuilderSearch {
	/** A bag line's id: open that bouquet to change it. */
	edit?: string;
}

export const Route = createFileRoute("/custom")({
	validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
		edit: typeof search.edit === "string" ? search.edit : undefined,
	}),
	head: () =>
		pageHead({
			title: "Build your own bouquet · ORAIA Baguio",
			description:
				"Design a custom bouquet at ORAIA, a Baguio City flower shop: pick your flowers, colors, size and wrapper, share a look you like, then order online.",
			path: "/custom",
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
	const [sizeId, setSizeId] = createSignal("");
	const [wrapperId, setWrapperId] = createSignal("");
	// Photos of a look the shopper likes, as uploaded.
	const [references, setReferences] = createSignal<string[]>([]);
	const [uploading, setUploading] = createSignal(false);
	const [uploadError, setUploadError] = createSignal("");
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
	const sizes = () => builderSizes(settings().sizes);

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
			...(sizeId() ? { sizeId: sizeId() } : {}),
			wrapperId: wrapperId(),
			...(references().length ? { referenceImages: references() } : {}),
		};
	});
	const priced = createMemo(() => priceDesign(design(), settings()));
	const flowersTotal = () =>
		design().items.reduce((sum, item) => {
			const price = colorOf(item.flower, item.color)?.price ?? 0;
			return sum + (item.count ? price * item.count : price);
		}, 0);
	const wrapper = () => wrappers().find((w) => w.id === wrapperId());
	const size = () => sizes().find((s) => s.id === sizeId());
	const total = () =>
		flowersTotal() +
		cashTotal(bills()) +
		billFees() +
		(size()?.price ?? 0) +
		(wrapper()?.price ?? 0) +
		settings().baseFee;
	const hasMoneyStep = () =>
		money().enabled && money().denominations.length > 0;
	/** 1 when the size step leads the builder, 0 when no size is offered. */
	const sizeStep = () => (sizes().length > 0 ? 1 : 0);
	const bills = () => design().bills ?? [];
	const billFees = () => billCount(bills()) * money().feePerBill;
	/** Bills still allowed before hitting the per-bouquet limit. */
	const billsLeft = () => money().maxBills - billCount(bills());
	const setBills = (value: number, count: number) => {
		setAdded(false);
		setCash(value, Math.max(0, count));
	};

	const addReferences = async (files: FileList | null) => {
		const room = MAX_REFERENCE_IMAGES - references().length;
		const chosen = [...(files ?? [])].slice(0, room);
		if (!chosen.length) return;
		setUploading(true);
		setUploadError("");
		setAdded(false);
		try {
			for (const file of chosen) {
				const body = new FormData();
				body.set("file", file);
				const result = await uploadReferenceImage({ data: body });
				if (!result.ok) {
					setUploadError(result.message);
					break;
				}
				setReferences((urls) => [...urls, result.url]);
			}
		} catch {
			setUploadError("Couldn’t upload that photo. Please try again.");
		} finally {
			setUploading(false);
		}
	};
	const removeReference = (url: string) => {
		setAdded(false);
		setUploadError("");
		setReferences((urls) => urls.filter((u) => u !== url));
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
		setSizeId(line.custom.sizeId ?? "");
		setWrapperId(line.custom.wrapperId);
		setReferences(line.custom.referenceImages ?? []);
		setEditing({ key, quantity: line.quantity });
	});

	type StepId = "size" | "flowers" | "wrapper";
	// Set once the shopper tries to add an unfinished bouquet: the summary
	// then says what's missing and the steps to finish are outlined.
	const [tried, setTried] = createSignal(false);
	/** Steps still to do, in the order they appear. */
	const missing = (): StepId[] => [
		...(sizes().length > 0 && !size() ? (["size"] as const) : []),
		...(design().items.length === 0 && bills().length === 0
			? (["flowers"] as const)
			: []),
		...(!wrapper() ? (["wrapper"] as const) : []),
	];
	const MISSING_LABELS: Record<StepId, string> = {
		size: "a size",
		flowers: "some flowers (or money)",
		wrapper: "a wrapper",
	};
	/** What stops the bouquet going in the bag, if anything. */
	const blocker = () => {
		if (uploading()) return "Wait for your photos to finish uploading.";
		const steps = missing().map((step) => MISSING_LABELS[step]);
		if (steps.length) {
			const last = steps.pop();
			return `Still to choose: ${steps.length ? `${steps.join(", ")} and ${last}` : last}.`;
		}
		return priced().problem;
	};
	const showMissing = (step: StepId) => tried() && missing().includes(step);

	const addToBag = () => {
		if (blocker()) {
			setTried(true);
			const [first] = missing();
			if (first)
				document
					.getElementById(`step-${first}`)
					?.scrollIntoView({ behavior: "smooth", block: "start" });
			return;
		}
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
		setTried(false);
		setAdded(true);
		setCartOpen(true);
	};

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-36 pt-8 sm:px-6 lg:px-8 lg:pb-20">
				<Link
					to="/shop"
					class="text-sm text-petal-700 underline-offset-4 hover:underline"
				>
					← Back to the shop
				</Link>
				<h1 class="mt-3 font-display type-soft text-4xl font-semibold tracking-tight">
					Build your bouquet
				</h1>
				<Show when={settings().enabled}>
					<p class="mt-2 max-w-xl text-petal-900/70">
						Choose a size, pick your flowers and colors, then a wrapper. Add a
						photo of a look you like or some money if you want. The price
						updates as you go.
					</p>
					<p class="mt-2 max-w-xl text-sm text-petal-900/70">
						Want something else? Message us on{" "}
						<a
							href={CONTACT.facebookUrl}
							target="_blank"
							rel="noreferrer"
							class="font-medium text-petal-700 underline"
						>
							Facebook
						</a>
						,{" "}
						<a
							href={CONTACT.signalUrl}
							target="_blank"
							rel="noreferrer"
							class="font-medium text-petal-700 underline"
						>
							Signal
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

				<Show when={settings().enabled} fallback={<PausedBuilder />}>
					<div class="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
						<div class="flex flex-col gap-6">
							<Show when={sizes().length > 0}>
								<Step
									id="step-size"
									number={1}
									title="Choose a size"
									missing={showMissing("size")}
								>
									<fieldset class="grid grid-cols-2 gap-3 sm:grid-cols-4">
										<legend class="sr-only">Size</legend>
										<For each={sizes()}>
											{(s) => (
												<label class="cursor-pointer">
													<input
														type="radio"
														name="size"
														value={s.id}
														checked={sizeId() === s.id}
														onChange={() => {
															setSizeId(s.id);
															setAdded(false);
														}}
														class="peer sr-only"
													/>
													<span class="flex h-full flex-col items-center gap-2 rounded-2xl border border-petal-200 bg-white p-3 text-center transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500">
														<Show when={s.image}>
															{(src) => (
																<img
																	src={photoSrc(src(), "thumb")}
																	alt={`Someone holding a ${s.name} bouquet`}
																	class="h-28 w-[50px] rounded-lg bg-[#fdf9ea] object-contain"
																/>
															)}
														</Show>
														<span class="text-sm font-medium">{s.name}</span>
														<Show when={s.description}>
															<span class="text-xs text-petal-900/60">
																{s.description}
															</span>
														</Show>
														<span class="text-xs text-petal-900/60 tabular-nums">
															{s.price
																? `+${formatPrice(s.price, CURRENCY)}`
																: "Free"}
														</span>
													</span>
												</label>
											)}
										</For>
									</fieldset>
								</Step>
							</Show>

							<Step
								id="step-flowers"
								number={1 + sizeStep()}
								title="Pick your flowers"
								missing={showMissing("flowers")}
							>
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
																		src={photoSrc(src(), "thumb")}
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
																					src={photoSrc(src(), "thumb")}
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

							<Step
								id="step-wrapper"
								number={2 + sizeStep()}
								title="Choose a wrapper"
								missing={showMissing("wrapper")}
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
																style={{
																	background: swatchColors(wrapperColors(w)),
																}}
															/>
														}
													>
														{(src) => (
															<img
																src={photoSrc(src(), "thumb")}
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

							<Step
								number={3 + sizeStep()}
								title="Show us a look you like (optional)"
							>
								<p class="-mt-2 mb-3 text-sm text-petal-900/60">
									Add up to {MAX_REFERENCE_IMAGES} photos of bouquets, colors or
									styles you like. Our florists use them as a guide; the flowers
									you picked above set the price.
								</p>
								<ul class="grid grid-cols-3 gap-3 sm:grid-cols-4">
									<For each={references()}>
										{(url, index) => (
											<li class="relative">
												<ZoomableImage
													src={url}
													alt={`Reference photo ${index() + 1}`}
													caption={`Reference photo ${index() + 1}`}
													class="aspect-square w-full rounded-2xl border border-black/10 object-cover"
												/>
												<button
													type="button"
													onClick={() => removeReference(url)}
													aria-label={`Remove reference photo ${index() + 1}`}
													class="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-white/90 text-lg leading-none text-petal-900 shadow outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-petal-500"
												>
													×
												</button>
											</li>
										)}
									</For>
									<Show when={references().length < MAX_REFERENCE_IMAGES}>
										<li>
											<label
												class={cn(
													"flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-petal-200 px-2 text-center text-sm text-petal-900/65 transition-colors focus-within:ring-2 focus-within:ring-petal-500 hover:border-petal-300 hover:bg-petal-50",
													uploading() && "pointer-events-none opacity-60",
												)}
											>
												<span aria-hidden="true" class="text-xl leading-none">
													+
												</span>
												{uploading() ? "Uploading…" : "Add a photo"}
												<input
													type="file"
													accept="image/png,image/jpeg,image/webp"
													multiple
													disabled={uploading()}
													class="sr-only"
													onChange={(e) => {
														void addReferences(e.currentTarget.files);
														e.currentTarget.value = "";
													}}
												/>
											</label>
										</li>
									</Show>
								</ul>
								<Show when={uploadError()}>
									<p role="alert" class="mt-3 text-sm text-error-foreground">
										{uploadError()}
									</p>
								</Show>
							</Step>

							<Show when={hasMoneyStep()}>
								<Step number={4 + sizeStep()} title="Add money (optional)">
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
							<Show when={size()}>
								{(s) => (
									<p class="text-sm">
										<span class="text-petal-900/60">Size:</span> {s().name}
									</p>
								)}
							</Show>
							<Show
								when={design().items.length > 0 || bills().length > 0}
								fallback={
									<p class="text-sm text-petal-900/60">
										{sizes().length > 0
											? "Nothing yet. Start by choosing a size and some flowers."
											: "Nothing yet. Start by picking some flowers."}
									</p>
								}
							>
								<Show when={design().items.length > 0}>
									<div>
										<p class="text-sm font-semibold tabular-nums">
											{stemCount(design().items)}{" "}
											{stemCount(design().items) === 1 ? "flower" : "flowers"}
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
							<Show when={references().length > 0}>
								<div>
									<p class="text-sm text-petal-900/60">Look you like:</p>
									<div class="mt-1 flex gap-2">
										<For each={references()}>
											{(url) => (
												<img
													src={url}
													alt=""
													class="size-12 rounded-lg border border-black/10 object-cover"
												/>
											)}
										</For>
									</div>
								</div>
							</Show>
							<dl class="grid grid-cols-[1fr_auto] gap-y-1 border-t border-petal-100 pt-3 text-sm">
								<Show when={sizes().length > 0}>
									<dt class="text-petal-900/65">Size</dt>
									<dd class="text-right tabular-nums">
										{formatPrice(size()?.price ?? 0, CURRENCY)}
									</dd>
								</Show>
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
									{formatPrice(total(), CURRENCY)}
								</dd>
							</dl>
							<Show
								when={
									blocker() &&
									(tried() ||
										design().items.length +
											(wrapperId() ? 1 : 0) +
											(sizeId() ? 1 : 0) >
											0)
								}
							>
								<p
									role="alert"
									class={cn(
										"rounded-xl px-3 py-2 text-sm",
										tried()
											? "bg-error text-error-foreground"
											: "bg-petal-50 text-petal-900/75",
									)}
								>
									{blocker()}
								</p>
							</Show>
							<button type="button" onClick={addToBag} class={pillPrimary}>
								{editing() ? "Update bouquet" : "Add to bag"}
							</button>
							<Show when={added()}>
								<output class="block text-center text-sm text-sage-600">
									Your bag is up to date.
								</output>
							</Show>
						</aside>
					</div>

					{/* Phones: the summary sits below every step, so keep the total and
					    the button in reach while building. */}
					<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
						<Show when={tried() && blocker()}>
							<p class="mb-2 text-sm text-error-foreground">{blocker()}</p>
						</Show>
						<div class="flex items-center gap-4">
							<p class="shrink-0">
								<span class="block text-xs text-petal-900/60">Total</span>
								<span class="text-lg font-semibold tabular-nums">
									{formatPrice(total(), CURRENCY)}
								</span>
							</p>
							<button
								type="button"
								onClick={addToBag}
								class={cn(pillPrimary, "w-auto flex-1")}
							>
								{editing() ? "Update bouquet" : "Add to bag"}
							</button>
						</div>
					</div>
				</Show>
			</main>
			<SiteFooter />
		</div>
	);
}

/** How many signature bouquets the paused page suggests instead. */
const SUGGESTED_BOUQUETS = 4;
const buttonBase =
	"inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2";

/**
 * While staff have the builder switched off: shoppers can still get a custom
 * bouquet by message, or order a signature bouquet straight away.
 */
function PausedBuilder() {
	const catalog = useCatalog();
	const types = useArrangementTypes();
	// The shop's own order, one style each, only ones that can be ordered.
	const suggestions = () =>
		catalog()
			.flatMap((product) => {
				// Only the shop's first kind, e.g. bouquets, not corsages.
				if (product.arrangement !== types()[0]?.id) return [];
				const variant = product.variants.find((v) => v.inStock);
				return variant ? [{ product, variant }] : [];
			})
			.slice(0, SUGGESTED_BOUQUETS);
	return (
		<>
			<section
				aria-labelledby="paused-heading"
				class="mt-8 flex flex-col items-center gap-6 rounded-3xl border border-petal-200 bg-white p-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:p-10 sm:text-left"
			>
				<img
					src={CUSTOM_BANNER_IMAGE}
					alt=""
					width={160}
					height={160}
					class="size-28 shrink-0 rounded-2xl sm:size-40"
				/>
				<div class="min-w-0 flex-1">
					<p class="text-xs font-semibold uppercase tracking-[0.2em] text-petal-700">
						Paused for now
					</p>
					<h2
						id="paused-heading"
						class="mt-1 text-balance font-display type-soft text-2xl font-semibold sm:text-3xl"
					>
						We’ll still make one for you
					</h2>
					<p class="mt-2 max-w-xl text-petal-900/70">
						Building online is switched off at the moment, but our florists take
						custom orders by message. Tell us the flowers, colors and budget you
						have in mind; a photo of a look you like helps too.
					</p>
					<div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						<a
							href={CONTACT.facebookUrl}
							target="_blank"
							rel="noreferrer"
							class={cn(
								buttonBase,
								"bg-petal-700 text-white hover:bg-petal-900",
							)}
						>
							Message us on Facebook
						</a>
						<a
							href={CONTACT.signalUrl}
							target="_blank"
							rel="noreferrer"
							class={cn(
								buttonBase,
								"border border-petal-200 bg-white hover:bg-petal-50",
							)}
						>
							Signal
						</a>
						<a
							href={CONTACT.telegramUrl}
							target="_blank"
							rel="noreferrer"
							class={cn(
								buttonBase,
								"border border-petal-200 bg-white hover:bg-petal-50",
							)}
						>
							Telegram
						</a>
						<a
							href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`}
							class={cn(
								buttonBase,
								"border border-petal-200 bg-white tabular-nums hover:bg-petal-50",
							)}
						>
							Call {CONTACT.phone}
						</a>
					</div>
				</div>
			</section>

			<Show when={suggestions().length > 0}>
				<section aria-labelledby="ready-heading" class="mt-12">
					<div class="flex flex-wrap items-end justify-between gap-2">
						<div>
							<h2
								id="ready-heading"
								class="font-display type-soft text-2xl font-semibold"
							>
								Ready to order now
							</h2>
							<p class="mt-1 text-sm text-petal-900/65">
								Our signature bouquets, made by the same florists.
							</p>
						</div>
						<Link
							to="/shop"
							class="text-sm font-medium text-petal-700 underline-offset-4 hover:underline"
						>
							See all bouquets →
						</Link>
					</div>
					<ul class="mt-5 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
						<For each={suggestions()}>
							{({ product, variant }) => (
								<li>
									<BouquetCard product={product} variant={variant} />
								</li>
							)}
						</For>
					</ul>
				</section>
			</Show>
		</>
	);
}

function Step(props: {
	id?: string;
	number: number;
	title: string;
	/** Outlines the step: the shopper tried to add the bouquet without it. */
	missing?: boolean;
	children: JSX.Element;
}) {
	return (
		<section
			id={props.id}
			class={cn(
				"scroll-mt-24 rounded-3xl border bg-white/60 p-5 transition-colors sm:p-6",
				props.missing
					? "border-error-foreground/60 shadow-[inset_0_0_0_1px] shadow-error-foreground/60"
					: "border-petal-100",
			)}
		>
			<h2 class="mb-4 flex items-center gap-3 font-display type-soft text-xl font-semibold">
				<span
					aria-hidden="true"
					class="flex size-7 items-center justify-center rounded-full bg-petal-100 font-sans text-sm text-petal-700"
				>
					{props.number}
				</span>
				{props.title}
				<Show when={props.missing}>
					<span class="ml-auto font-sans text-sm font-medium text-error-foreground">
						Required
					</span>
				</Show>
			</h2>
			{props.children}
		</section>
	);
}
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
