import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { createSignal, For, Index, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { FlowerSelect } from "~/components/admin/flower-select";
import { createCropper } from "~/components/admin/image-cropper";
import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	TextArea,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { findFlowerKind, flowerKinds } from "~/lib/custom-bouquet";
import { randomFlowerCode } from "~/lib/flower-codes";
import {
	flowerCodeKey,
	PHOTO_TAGS,
	photoTag,
	swatchBackground,
} from "~/lib/product";
import { BOUQUET_SIZES, type BouquetSize } from "~/lib/sizes";
import { useCustomSettings, useFlowerPhotos } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import {
	deleteProductFn,
	getAdminProductFn,
	listFlowerCodes,
	saveProductFn,
	uploadProductImage,
} from "~/server/admin/catalog";
import type { AdminProduct, PhotoTag } from "~/types/product";

interface EditorSearch {
	/** Opens scrolled to this color, from a row on Products & stock. */
	color?: string;
}

export const Route = createFileRoute("/admin/_dashboard/products/$productId")({
	validateSearch: (search: Record<string, unknown>): EditorSearch => ({
		color: typeof search.color === "string" ? search.color : undefined,
	}),
	loader: async ({ params }) => {
		const codes = await listFlowerCodes();
		if (params.productId === "new") return { product: null, codes };
		const product = await getAdminProductFn({ data: params.productId });
		if (!product) throw notFound();
		return { product, codes };
	},
	component: ProductEditor,
});

interface VariantDraft {
	/** Stable key for rendering; new colors have no `id` until saved. */
	key: string;
	id?: string;
	colorName: string;
	colorHex: string;
	/** Empty for a single color. */
	colorHex2: string;
	sku: string;
	/** Required; set per color. */
	price: string;
	stockQuantity: string;
	isAvailable: boolean;
	images: string[];
	/** Kept in step with `images`. */
	imageTags: PhotoTag[];
	recipe: RecipeDraft[];
	wrapperColor: string;
	/** Shows the AI background note under this color's photos. */
	aiPhotos: boolean;
	size: BouquetSize | "";
}

interface RecipeDraft {
	key: string;
	flower: string;
	count: string;
	color: string;
}

const newRecipeRow = (): RecipeDraft => ({
	key: crypto.randomUUID(),
	flower: "",
	count: "1",
	color: "",
});

interface ProductDraft {
	title: string;
	description: string;
	isVisible: boolean;
	variants: VariantDraft[];
}

/** Keeps all four buttons of the bottom bar on one line on phones. */
const barButton = "px-3 sm:px-4";

const newVariant = (): VariantDraft => ({
	key: crypto.randomUUID(),
	colorName: "",
	colorHex: "#f2a6b8",
	colorHex2: "",
	sku: "",
	price: "",
	stockQuantity: "0",
	isAvailable: true,
	images: [],
	imageTags: [],
	recipe: [newRecipeRow()],
	wrapperColor: "",
	aiPhotos: true,
	size: "",
});

function toDraft(product: AdminProduct | null): ProductDraft {
	if (!product) {
		return {
			title: "",
			description: "",
			isVisible: true,
			variants: [newVariant()],
		};
	}
	return {
		title: product.title,
		description: product.description,
		isVisible: product.isVisible,
		variants: product.variants.map((v) => ({
			key: v.id,
			id: v.id,
			colorName: v.colorName,
			colorHex: v.colorHex ?? "#f2a6b8",
			colorHex2: v.colorHex2 ?? "",
			sku: v.sku,
			// Colors that used the product price start with it filled in.
			price: String(v.price ?? product.basePrice),
			stockQuantity: String(v.stockQuantity),
			isAvailable: v.isAvailable,
			images: [...v.images],
			imageTags: v.images.map((_, i) => photoTag(v, i)),
			recipe: v.recipe.map((item) => ({
				key: crypto.randomUUID(),
				flower: item.flower,
				count: String(item.count ?? 1),
				color: item.color ?? "",
			})),
			wrapperColor: v.wrapperColor,
			aiPhotos: v.aiPhotos ?? true,
			size: v.size ?? "",
		})),
	};
}

function ProductEditor() {
	// The flower list includes any flowers staff added in Custom bouquets.
	const custom = useCustomSettings();
	const flowerKind = (name: string) => findFlowerKind(name, custom());
	const isCountedFlower = (name: string) => !!flowerKind(name)?.counted;
	const flowerPhoto = useFlowerPhotos();
	/** For the picker, where no color is chosen yet: any photo of the flower. */
	const listPhoto = (name: string) =>
		flowerPhoto(name) ??
		Object.values(
			custom().flowers.find((f) => f.name === name)?.colorImages ?? {},
		).find(Boolean);
	/** The flower picker's groups, counted flowers first. */
	const flowerGroups = () => {
		const kinds = flowerKinds(custom());
		return [
			{ label: "Counted", kinds: kinds.filter((kind) => kind.counted) },
			{
				label: "Cluster (no count)",
				kinds: kinds.filter((kind) => !kind.counted),
			},
		];
	};
	/** Live total while editing; only counted flowers add to it. */
	const recipeStems = (recipe: RecipeDraft[]) =>
		recipe.reduce(
			(sum, item) =>
				sum +
				(isCountedFlower(item.flower)
					? Math.max(0, Number(item.count) || 0)
					: 0),
			0,
		);
	const data = Route.useLoaderData();
	const loaded = () => data().product;
	const params = Route.useParams();
	const navigate = useNavigate();
	const isNew = () => params().productId === "new";
	const [draft, setDraft] = createStore<ProductDraft>(toDraft(loaded()));
	const [saving, setSaving] = createSignal(false);
	// What the shop sees right now (the draft may have unsaved changes).
	const [savedVisible, setSavedVisible] = createSignal(
		loaded()?.isVisible ?? true,
	);
	const [uploading, setUploading] = createSignal<string | null>(null);

	const updateVariant = (index: number, patch: Partial<VariantDraft>) =>
		setDraft("variants", index, patch);

	const smoothly = (): ScrollBehavior =>
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
			? "auto"
			: "smooth";

	/** "Top" only shows once there's somewhere to go back to. */
	const [scrolled, setScrolled] = createSignal(false);
	onMount(() => {
		const update = () => setScrolled(window.scrollY > 400);
		update();
		window.addEventListener("scroll", update, { passive: true });
		onCleanup(() => window.removeEventListener("scroll", update));
	});

	// Coming from a color's row: go to its card and mark it for a moment.
	const search = Route.useSearch();
	const [openedColor, setOpenedColor] = createSignal(search().color);
	onMount(() => {
		const id = search().color;
		if (!id) return;
		// After the router has finished resetting the scroll for the new page.
		const scrollTimer = setTimeout(() => {
			document
				.querySelector(`[data-color-id="${CSS.escape(id)}"]`)
				?.scrollIntoView({ behavior: smoothly(), block: "start" });
		}, 100);
		const markTimer = setTimeout(() => setOpenedColor(undefined), 4000);
		onCleanup(() => {
			clearTimeout(scrollTimer);
			clearTimeout(markTimer);
		});
	});

	/** Adds a color and brings its card into view, ready to type its name. */
	const addColor = () => {
		setDraft("variants", (list) => [...list, newVariant()]);
		requestAnimationFrame(() => {
			const card = [
				...document.querySelectorAll<HTMLElement>("[data-color-card]"),
			].at(-1);
			card?.scrollIntoView({ behavior: smoothly(), block: "start" });
			card?.querySelector("input")?.focus({ preventScroll: true });
		});
	};

	/** Fills in a name no other bouquet uses, nor this color's current one. */
	const pickFlowerCode = (index: number) => {
		const sku = randomFlowerCode([
			...draft.variants.map((variant) => variant.sku),
			...data()
				.codes.filter((entry) => entry.productId !== params().productId)
				.map((entry) => entry.code),
		]);
		if (sku) updateVariant(index, { sku });
		else toastError(new Error("Every name is in use. Type a new one instead."));
	};

	/** Who already has this color's flower code; each one names one bouquet. */
	const codeTakenBy = (index: number) => {
		const key = flowerCodeKey(draft.variants[index]?.sku ?? "");
		if (!key) return undefined;
		const sameBouquet = draft.variants.find(
			(variant, i) => i !== index && flowerCodeKey(variant.sku) === key,
		);
		if (sameBouquet)
			return `Already used by ${sameBouquet.colorName || "another color"} in this bouquet.`;
		const elsewhere = data().codes.find(
			(entry) =>
				entry.productId !== params().productId &&
				flowerCodeKey(entry.code) === key,
		);
		return elsewhere ? `Already used by ${elsewhere.owner}.` : undefined;
	};

	const cropper = createCropper();

	const uploadImages = async (index: number, files: FileList | null) => {
		if (!files?.length) return;
		const variant = draft.variants[index];
		if (!variant) return;
		const chosen = Array.from(files);
		setUploading(variant.key);
		try {
			for (const [n, original] of chosen.entries()) {
				// Square photos keep the shop grid tidy; staff crop each one here.
				const file = await cropper.crop(original, {
					aspect: 1,
					title:
						chosen.length > 1
							? `Crop photo ${n + 1} of ${chosen.length}`
							: "Crop photo",
				});
				if (!file) continue;
				const body = new FormData();
				body.set("file", file);
				const result = await uploadProductImage({ data: body });
				if (!result.ok) {
					toastError(new Error(`${file.name}: ${result.message}`));
					continue;
				}
				setDraft(
					"variants",
					index,
					produce((variant) => {
						// Suggest the first view this color doesn't have a photo of yet.
						const tag =
							PHOTO_TAGS.find(
								(t) => t.value && !variant.imageTags.includes(t.value),
							)?.value ?? "";
						variant.images.push(result.url);
						variant.imageTags.push(tag);
					}),
				);
			}
		} catch (error) {
			toastError(error);
		} finally {
			setUploading(null);
		}
	};

	const moveImage = (index: number, from: number, to: number) =>
		setDraft(
			"variants",
			index,
			produce((variant) => {
				const [image] = variant.images.splice(from, 1);
				const [tag] = variant.imageTags.splice(from, 1);
				if (image) {
					variant.images.splice(to, 0, image);
					variant.imageTags.splice(to, 0, tag ?? "");
				}
			}),
		);

	const removeImage = (index: number, at: number) =>
		setDraft(
			"variants",
			index,
			produce((variant) => {
				variant.images.splice(at, 1);
				variant.imageTags.splice(at, 1);
			}),
		);

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		const repeated = draft.variants.findIndex((_, i) => codeTakenBy(i));
		if (repeated !== -1) {
			toastError(
				new Error(
					`Flower code “${draft.variants[repeated]?.sku.trim()}”: ${codeTakenBy(repeated)}`,
				),
			);
			document.querySelector<HTMLElement>('[data-code-taken="true"]')?.focus();
			return;
		}
		setSaving(true);
		try {
			const saved = await saveProductFn({
				data: {
					productId: isNew() ? null : params().productId,
					product: {
						title: draft.title,
						description: draft.description,
						isVisible: draft.isVisible,
						variants: draft.variants.map((v) => ({
							id: v.id,
							colorName: v.colorName,
							colorHex: v.colorHex,
							colorHex2: v.colorHex2,
							sku: v.sku,
							price: Number(v.price),
							stockQuantity: Number(v.stockQuantity),
							isAvailable: v.isAvailable,
							images: v.images,
							imageTags: v.imageTags,
							// Blank rows are left out rather than rejected.
							recipe: v.recipe
								.filter((item) => item.flower)
								.map((item) => {
									const kind = flowerKind(item.flower);
									return {
										flower: item.flower,
										...(kind?.counted ? { count: Number(item.count) } : {}),
										...(kind?.colors ? { color: item.color.trim() } : {}),
									};
								}),
							wrapperColor: v.wrapperColor,
							aiPhotos: v.aiPhotos,
							size: v.size,
						})),
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the product.");
			toastSuccess(isNew() ? "Product created." : "Changes saved.");
			setDraft(toDraft(saved));
			setSavedVisible(saved.isVisible);
			if (isNew()) {
				await navigate({
					to: "/admin/products/$productId",
					params: { productId: saved.id },
					replace: true,
				});
			}
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-4xl pb-24">
			{cropper.element()}
			{/* Color suggestions for recipe flowers, from Custom bouquets. */}
			<For each={custom().flowers.filter((f) => f.kind.colors)}>
				{(flower) => (
					<datalist id={`flower-colors-${flower.name}`}>
						<For each={flower.colors}>
							{(color) => <option value={color} />}
						</For>
					</datalist>
				)}
			</For>
			<Link to="/admin/products" class={cn(adminButton.ghost, "-ml-2 mb-2")}>
				← Products & stock
			</Link>
			<PageHeader
				title={isNew() ? "New product" : draft.title || "Untitled product"}
				actions={
					<Show when={!isNew() && loaded()?.isVisible}>
						<a
							href={`/products/${params().productId}`}
							target="_blank"
							rel="noreferrer"
							class={adminButton.secondary}
						>
							View in shop
						</a>
					</Show>
				}
			/>

			<Show when={!isNew() && !savedVisible()}>
				<p class="mb-4 rounded-2xl border border-warning-foreground/30 bg-warning px-4 py-3 text-sm text-warning-foreground">
					<strong class="font-semibold">Hidden from the shop.</strong> Customers
					can’t see this product. Turn on “Show in shop” and save to publish it.
				</p>
			</Show>
			<section class={cn(adminCard, "mb-6 grid gap-4 p-5 sm:grid-cols-2")}>
				<Field label="Name" class="sm:col-span-2">
					<input
						value={draft.title}
						onInput={(e) => setDraft("title", e.currentTarget.value)}
						maxLength={120}
						required
						class={adminInput}
					/>
				</Field>
				<Field label="Description" class="sm:col-span-2">
					<TextArea
						value={draft.description}
						onInput={(e) => setDraft("description", e.currentTarget.value)}
						maxLength={2000}
						rows={4}
						class={cn(adminInput, "h-auto py-2 leading-relaxed")}
					/>
				</Field>
				<div class="flex flex-col justify-center gap-1">
					<Toggle
						label="Show in shop"
						checked={draft.isVisible}
						onChange={(checked) => setDraft("isVisible", checked)}
					/>
					<span class="text-xs text-petal-900/55">
						Turn off to keep working on it before customers see it.
					</span>
				</div>
			</section>

			<h2 class="mb-3 text-lg font-semibold">Colors</h2>

			<div class="flex flex-col gap-4">
				<Index each={draft.variants}>
					{(variant, index) => (
						<section
							data-color-card
							data-color-id={variant().id}
							class={cn(
								adminCard,
								"scroll-mt-32 p-5 transition-shadow duration-500 lg:scroll-mt-6",
								openedColor() &&
									openedColor() === variant().id &&
									"ring-2 ring-petal-500",
							)}
							aria-label={variant().colorName || `Color ${index + 1}`}
						>
							<div class="grid gap-4 sm:grid-cols-6">
								<Field label="Color name" class="sm:col-span-2">
									<input
										value={variant().colorName}
										onInput={(e) =>
											updateVariant(index, { colorName: e.currentTarget.value })
										}
										maxLength={40}
										required
										placeholder="e.g. Lavender Mist"
										class={adminInput}
									/>
								</Field>
								<div class="flex flex-col gap-1.5">
									<span class="text-sm font-medium">Swatch</span>
									<span class="flex items-center gap-2">
										<input
											type="color"
											value={variant().colorHex}
											onInput={(e) =>
												updateVariant(index, {
													colorHex: e.currentTarget.value,
												})
											}
											aria-label={`Swatch color for ${variant().colorName || "this color"}`}
											class="h-10 w-12 cursor-pointer rounded-lg border border-petal-200 bg-white p-1"
										/>
										<Show when={variant().colorHex2}>
											<input
												type="color"
												value={variant().colorHex2}
												onInput={(e) =>
													updateVariant(index, {
														colorHex2: e.currentTarget.value,
													})
												}
												aria-label={`Second swatch color for ${variant().colorName || "this color"}`}
												class="h-10 w-12 cursor-pointer rounded-lg border border-petal-200 bg-white p-1"
											/>
										</Show>
										<span
											aria-hidden="true"
											class="size-7 shrink-0 rounded-full border border-black/10"
											style={{
												background: swatchBackground(
													variant().colorHex,
													variant().colorHex2,
												),
											}}
										/>
									</span>
									<label class="flex items-center gap-1.5 text-xs text-petal-900/70">
										<input
											type="checkbox"
											checked={!!variant().colorHex2}
											onChange={(e) =>
												updateVariant(index, {
													colorHex2: e.currentTarget.checked ? "#ffffff" : "",
												})
											}
											class="accent-petal-700"
										/>
										Two colors
									</label>
								</div>
								<Field
									label="Flower code"
									hint="A girl’s name, different for every bouquet."
									class="sm:col-span-3"
								>
									<span class="flex gap-2">
										<input
											value={variant().sku}
											onInput={(e) =>
												updateVariant(index, { sku: e.currentTarget.value })
											}
											maxLength={30}
											required
											placeholder="e.g. Bianca"
											aria-invalid={codeTakenBy(index) ? "true" : undefined}
											data-code-taken={codeTakenBy(index) ? "true" : undefined}
											class={cn(
												adminInput,
												"min-w-0 flex-1",
												codeTakenBy(index) &&
													"border-destructive focus-visible:border-destructive",
											)}
										/>
										<button
											type="button"
											aria-label="Pick a random flower code"
											onClick={() => pickFlowerCode(index)}
											class={cn(adminButton.secondary, "shrink-0 px-3")}
										>
											Random
										</button>
									</span>
									<Show when={codeTakenBy(index)}>
										{(message) => (
											<p role="alert" class="text-xs text-destructive">
												{message()}
											</p>
										)}
									</Show>
								</Field>
								<Field label="Price (₱)" class="sm:col-span-2">
									<input
										type="number"
										min="1"
										step="0.01"
										inputMode="decimal"
										value={variant().price}
										onInput={(e) =>
											updateVariant(index, { price: e.currentTarget.value })
										}
										required
										class={adminInput}
									/>
								</Field>
								<Field label="In stock" class="sm:col-span-2">
									<input
										type="number"
										min="0"
										step="1"
										inputMode="numeric"
										value={variant().stockQuantity}
										onInput={(e) =>
											updateVariant(index, {
												stockQuantity: e.currentTarget.value,
											})
										}
										required
										class={adminInput}
									/>
								</Field>
								<div class="flex items-end pb-2 sm:col-span-2">
									<Toggle
										label="Selling"
										checked={variant().isAvailable}
										onChange={(checked) =>
											updateVariant(index, { isAvailable: checked })
										}
									/>
								</div>
							</div>

							<div class="mt-5 grid gap-4 sm:grid-cols-6">
								<fieldset class="sm:col-span-4">
									<legend class="mb-2 text-sm font-medium">
										Recipe{" "}
										<span class="font-normal text-petal-900/55">
											— {recipeStems(variant().recipe)} flowers in total
										</span>
									</legend>
									<ul class="flex flex-col gap-2">
										<Index each={variant().recipe}>
											{(item, row) => (
												<li class="flex flex-wrap items-center gap-2 border-b border-petal-50 pb-2 sm:flex-nowrap sm:border-0 sm:pb-0">
													<Show
														when={flowerPhoto(item().flower, item().color)}
														fallback={
															<span
																title="No photo yet. Add one in Custom bouquets."
																class="size-10 shrink-0 rounded-lg border-2 border-dashed border-petal-200"
															/>
														}
													>
														{(src) => (
															<ZoomableImage
																src={src()}
																alt={item().flower}
																caption={item().flower}
																hoverPreview
																class="size-10 shrink-0 rounded-lg border border-black/10 object-cover"
															/>
														)}
													</Show>
													<FlowerSelect
														label={`Kind of flower ${row + 1}`}
														groups={flowerGroups()}
														value={item().flower}
														photo={listPhoto}
														onChange={(flower) =>
															setDraft("variants", index, "recipe", row, {
																flower,
																// Keep the color only if the new flower has colors.
																color: flowerKind(flower)?.colors
																	? item().color
																	: "",
															})
														}
													/>
													<Show when={flowerKind(item().flower)?.colors}>
														{/* Suggests the colors listed in Custom bouquets; any color can be typed. */}
														<input
															value={item().color}
															onInput={(e) =>
																setDraft(
																	"variants",
																	index,
																	"recipe",
																	row,
																	"color",
																	e.currentTarget.value,
																)
															}
															list={`flower-colors-${item().flower}`}
															maxLength={30}
															placeholder="Color, e.g. Red"
															aria-label={`${item().flower} color`}
															class={cn(
																adminInput,
																"min-w-0 flex-1 sm:w-36 sm:flex-none",
															)}
														/>
													</Show>
													<Show
														when={isCountedFlower(item().flower)}
														fallback={
															<span class="flex-1 text-center text-xs text-petal-900/55 sm:w-24 sm:flex-none">
																{item().flower ? "Cluster" : ""}
															</span>
														}
													>
														<span aria-hidden="true" class="text-petal-900/50">
															×
														</span>
														<input
															type="number"
															min="1"
															max="500"
															step="1"
															inputMode="numeric"
															value={item().count}
															onInput={(e) =>
																setDraft(
																	"variants",
																	index,
																	"recipe",
																	row,
																	"count",
																	e.currentTarget.value,
																)
															}
															aria-label={`How many ${item().flower}`}
															class={cn(adminInput, "w-20 tabular-nums")}
														/>
													</Show>
													<button
														type="button"
														class={cn(
															adminButton.ghost,
															"text-error-foreground",
														)}
														onClick={() =>
															setDraft("variants", index, "recipe", (list) =>
																list.filter((_, i) => i !== row),
															)
														}
														aria-label={`Remove flower ${row + 1}`}
													>
														✕
													</button>
												</li>
											)}
										</Index>
									</ul>
									<button
										type="button"
										class={cn(adminButton.ghost, "mt-1")}
										onClick={() =>
											setDraft("variants", index, "recipe", (list) => [
												...list,
												newRecipeRow(),
											])
										}
									>
										+ Add flower
									</button>
								</fieldset>
								<Field
									label="Wrapper color"
									hint="Shown to staff on each order."
									class="sm:col-span-2"
								>
									<input
										value={variant().wrapperColor}
										onInput={(e) =>
											updateVariant(index, {
												wrapperColor: e.currentTarget.value,
											})
										}
										maxLength={40}
										placeholder="e.g. Kraft brown"
										class={adminInput}
									/>
								</Field>
							</div>

							<fieldset class="mt-5">
								<legend class="mb-2 text-sm font-medium">
									Size{" "}
									<span class="font-normal text-petal-900/55">
										— shown with the size guide when shoppers pick this color
									</span>
								</legend>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
									<For each={BOUQUET_SIZES}>
										{(size) => (
											<label class="cursor-pointer">
												<input
													type="radio"
													name={`size-${variant().key}`}
													value={size.id}
													checked={variant().size === size.id}
													onChange={() =>
														updateVariant(index, { size: size.id })
													}
													class="peer sr-only"
												/>
												<span class="flex h-full flex-col rounded-xl border border-petal-200 bg-white px-3 py-2 text-sm transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:bg-petal-50 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500">
													<span class="font-semibold">{size.name}</span>
													<span class="text-xs text-petal-900/60">
														{size.description}
													</span>
												</span>
											</label>
										)}
									</For>
								</div>
								<Show when={!variant().size}>
									<p class="mt-1.5 text-xs text-petal-900/55">
										No size chosen yet; this color won’t show a size.
									</p>
								</Show>
							</fieldset>

							<div class="mt-5">
								<p class="mb-2 text-sm font-medium">
									Photos{" "}
									<span class="font-normal text-petal-900/55">
										— tag what each one shows; the first is the cover
									</span>
								</p>
								<div class="mb-3">
									<Toggle
										label="Backgrounds enhanced with AI"
										checked={variant().aiPhotos}
										onChange={(checked) =>
											updateVariant(index, { aiPhotos: checked })
										}
									/>
									<p class="mt-1 text-xs text-petal-900/55">
										When on, the shop shows a note under this color’s photos.
										Turn it off if the photos weren’t edited with AI.
									</p>
								</div>
								<ul class="flex flex-wrap gap-3">
									<For each={variant().images}>
										{(image, imageIndex) => (
											<li class="group relative w-24">
												<img
													src={image}
													alt=""
													class="size-24 rounded-xl border border-petal-100 bg-petal-50 object-cover"
												/>
												<select
													onChange={(e) =>
														setDraft(
															"variants",
															index,
															"imageTags",
															imageIndex(),
															e.currentTarget.value as PhotoTag,
														)
													}
													aria-label={`What photo ${imageIndex() + 1} shows`}
													class="mt-1 h-10 w-full rounded-lg border border-petal-200 bg-white px-1 text-base font-medium text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 sm:h-7 sm:text-[11px]"
												>
													<For each={PHOTO_TAGS}>
														{(tag) => (
															<option
																value={tag.value}
																selected={
																	(variant().imageTags[imageIndex()] ?? "") ===
																	tag.value
																}
															>
																{tag.short}
															</option>
														)}
													</For>
												</select>
												<div class="mt-1 flex justify-between">
													<button
														type="button"
														class={adminButton.ghost}
														disabled={imageIndex() === 0}
														onClick={() =>
															moveImage(index, imageIndex(), imageIndex() - 1)
														}
														aria-label={`Move photo ${imageIndex() + 1} earlier`}
													>
														←
													</button>
													<button
														type="button"
														class={cn(
															adminButton.ghost,
															"text-error-foreground",
														)}
														onClick={() => removeImage(index, imageIndex())}
														aria-label={`Remove photo ${imageIndex() + 1}`}
													>
														✕
													</button>
													<button
														type="button"
														class={adminButton.ghost}
														disabled={
															imageIndex() === variant().images.length - 1
														}
														onClick={() =>
															moveImage(index, imageIndex(), imageIndex() + 1)
														}
														aria-label={`Move photo ${imageIndex() + 1} later`}
													>
														→
													</button>
												</div>
											</li>
										)}
									</For>
									<li>
										<label
											class={cn(
												"flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-petal-200 bg-white text-center text-xs text-petal-900/60 transition-colors hover:border-petal-300 hover:bg-petal-50",
												uploading() === variant().key &&
													"pointer-events-none opacity-60",
											)}
										>
											<span class="text-xl leading-none">+</span>
											{uploading() === variant().key
												? "Uploading…"
												: "Add photos"}
											<input
												type="file"
												accept="image/png,image/jpeg,image/webp"
												multiple
												class="sr-only"
												onChange={(e) => {
													void uploadImages(index, e.currentTarget.files);
													e.currentTarget.value = "";
												}}
											/>
										</label>
									</li>
								</ul>
							</div>

							<div class="mt-4 flex justify-end border-t border-petal-100 pt-3">
								<Show
									when={draft.variants.length > 1}
									fallback={
										<span class="text-xs text-petal-900/50">
											A product needs at least one color.
										</span>
									}
								>
									<Show
										when={variant().id}
										fallback={
											<button
												type="button"
												class={adminButton.ghost}
												onClick={() =>
													setDraft("variants", (list) =>
														list.filter((_, i) => i !== index),
													)
												}
											>
												Remove color
											</button>
										}
									>
										<ConfirmButton
											class={cn(adminButton.ghost, "text-error-foreground")}
											title={`Remove ${variant().colorName}?`}
											description="It disappears from the shop when you save. Past orders keep their details."
											confirmLabel="Remove"
											onConfirm={() =>
												setDraft("variants", (list) =>
													list.filter((_, i) => i !== index),
												)
											}
										>
											Remove color
										</ConfirmButton>
									</Show>
								</Show>
							</div>
						</section>
					)}
				</Index>
			</div>

			<Show when={scrolled()}>
				<button
					type="button"
					aria-label="Back to top"
					onClick={() => window.scrollTo({ top: 0, behavior: smoothly() })}
					class="fixed bottom-20 right-4 z-30 inline-flex h-11 items-center gap-1 rounded-full border border-petal-200 bg-white px-4 text-sm font-medium text-petal-900 shadow-md transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					<span aria-hidden="true">↑</span> Top
				</button>
			</Show>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-4xl items-center justify-end gap-1.5 sm:gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, barButton)}
							title={`Delete ${draft.title || "this product"}?`}
							description="This removes the product and all its colors from the shop for good. Past orders keep their details."
							confirmLabel="Delete product"
							onConfirm={async () => {
								try {
									await deleteProductFn({
										data: { productId: params().productId },
									});
									toastSuccess("Product deleted.");
									await navigate({ to: "/admin/products" });
								} catch (error) {
									toastError(error);
								}
							}}
						>
							Delete<span class="hidden sm:inline"> product</span>
						</ConfirmButton>
					</Show>
					<button
						type="button"
						class={cn(adminButton.secondary, barButton, "mr-auto")}
						onClick={addColor}
					>
						+ <span class="hidden sm:inline">Add color</span>
						<span class="sm:hidden">Color</span>
					</button>
					<Link
						to="/admin/products"
						class={cn(adminButton.secondary, barButton)}
					>
						Cancel
					</Link>
					<button
						type="submit"
						class={cn(adminButton.primary, barButton, "sm:px-5")}
						disabled={saving() || uploading() !== null}
					>
						<Show when={!saving()} fallback="Saving…">
							{isNew() ? "Create" : "Save"}
							<span class="hidden sm:inline">
								{isNew() ? " product" : " changes"}
							</span>
						</Show>
					</button>
				</div>
			</div>
		</form>
	);
}
