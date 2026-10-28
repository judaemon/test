import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { createSignal, For, Index, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";

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
import { cn } from "~/lib/utils";
import {
	getAdminProductFn,
	saveProductFn,
	uploadProductImage,
} from "~/server/admin/catalog";
import type { AdminProduct } from "~/types/product";

export const Route = createFileRoute("/admin/_dashboard/products/$productId")({
	loader: async ({ params }) => {
		if (params.productId === "new") return null;
		const product = await getAdminProductFn({ data: params.productId });
		if (!product) throw notFound();
		return product;
	},
	component: ProductEditor,
});

interface VariantDraft {
	/** Stable key for rendering; new colors have no `id` until saved. */
	key: string;
	id?: string;
	colorName: string;
	colorHex: string;
	sku: string;
	/** Empty means "use the product price". */
	price: string;
	stockQuantity: string;
	isAvailable: boolean;
	images: string[];
	/** Once staff edit the SKU we stop generating it from the name. */
	skuTouched: boolean;
}

interface ProductDraft {
	title: string;
	description: string;
	basePrice: string;
	isVisible: boolean;
	variants: VariantDraft[];
}

const skuFor = (colorName: string) =>
	`ORA-${colorName
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 24)}`;

const newVariant = (): VariantDraft => ({
	key: crypto.randomUUID(),
	colorName: "",
	colorHex: "#f2a6b8",
	sku: "",
	price: "",
	stockQuantity: "0",
	isAvailable: true,
	images: [],
	skuTouched: false,
});

function toDraft(product: AdminProduct | null): ProductDraft {
	if (!product) {
		return {
			title: "",
			description: "",
			basePrice: "",
			isVisible: true,
			variants: [newVariant()],
		};
	}
	return {
		title: product.title,
		description: product.description,
		basePrice: String(product.basePrice),
		isVisible: product.isVisible,
		variants: product.variants.map((v) => ({
			key: v.id,
			id: v.id,
			colorName: v.colorName,
			colorHex: v.colorHex ?? "#f2a6b8",
			sku: v.sku,
			price: v.price === undefined ? "" : String(v.price),
			stockQuantity: String(v.stockQuantity),
			isAvailable: v.isAvailable,
			images: [...v.images],
			skuTouched: true,
		})),
	};
}

function ProductEditor() {
	const loaded = Route.useLoaderData();
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

	const uploadImages = async (index: number, files: FileList | null) => {
		if (!files?.length) return;
		const variant = draft.variants[index];
		if (!variant) return;
		setUploading(variant.key);
		try {
			for (const file of Array.from(files)) {
				const body = new FormData();
				body.set("file", file);
				const result = await uploadProductImage({ data: body });
				if (!result.ok) {
					toastError(new Error(`${file.name}: ${result.message}`));
					continue;
				}
				setDraft("variants", index, "images", (images) => [
					...images,
					result.url,
				]);
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
			"images",
			produce((images) => {
				const [image] = images.splice(from, 1);
				if (image) images.splice(to, 0, image);
			}),
		);

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveProductFn({
				data: {
					productId: isNew() ? null : params().productId,
					product: {
						title: draft.title,
						description: draft.description,
						basePrice: Number(draft.basePrice),
						isVisible: draft.isVisible,
						variants: draft.variants.map((v) => ({
							id: v.id,
							colorName: v.colorName,
							colorHex: v.colorHex,
							sku: v.sku,
							price: v.price.trim() === "" ? null : Number(v.price),
							stockQuantity: Number(v.stockQuantity),
							isAvailable: v.isAvailable,
							images: v.images,
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
				<Field
					label="Price (₱)"
					hint="Colors use this unless they set their own."
				>
					<input
						type="number"
						min="1"
						step="0.01"
						inputMode="decimal"
						value={draft.basePrice}
						onInput={(e) => setDraft("basePrice", e.currentTarget.value)}
						required
						class={adminInput}
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

			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Colors</h2>
				<button
					type="button"
					class={adminButton.secondary}
					onClick={() =>
						setDraft("variants", (list) => [...list, newVariant()])
					}
				>
					+ Add color
				</button>
			</div>

			<div class="flex flex-col gap-4">
				<Index each={draft.variants}>
					{(variant, index) => (
						<section
							class={cn(adminCard, "p-5")}
							aria-label={variant().colorName || `Color ${index + 1}`}
						>
							<div class="grid gap-4 sm:grid-cols-6">
								<Field label="Color name" class="sm:col-span-2">
									<input
										value={variant().colorName}
										onInput={(e) => {
											const colorName = e.currentTarget.value;
											updateVariant(index, {
												colorName,
												...(variant().skuTouched
													? {}
													: { sku: skuFor(colorName) }),
											});
										}}
										maxLength={40}
										required
										placeholder="e.g. Lavender Mist"
										class={adminInput}
									/>
								</Field>
								<Field label="Swatch">
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
										<span class="font-mono text-xs text-petal-900/60">
											{variant().colorHex}
										</span>
									</span>
								</Field>
								<Field label="SKU" class="sm:col-span-3">
									<input
										value={variant().sku}
										onInput={(e) =>
											updateVariant(index, {
												sku: e.currentTarget.value,
												skuTouched: true,
											})
										}
										maxLength={40}
										required
										class={cn(adminInput, "font-mono")}
									/>
								</Field>
								<Field
									label="Own price (₱)"
									hint="Leave empty to use the product price."
									class="sm:col-span-2"
								>
									<input
										type="number"
										min="1"
										step="0.01"
										inputMode="decimal"
										value={variant().price}
										onInput={(e) =>
											updateVariant(index, { price: e.currentTarget.value })
										}
										placeholder={draft.basePrice || "—"}
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

							<div class="mt-5">
								<p class="mb-2 text-sm font-medium">
									Photos{" "}
									<span class="font-normal text-petal-900/55">
										— the first one is the main photo
									</span>
								</p>
								<ul class="flex flex-wrap gap-3">
									<For each={variant().images}>
										{(image, imageIndex) => (
											<li class="group relative w-24">
												<img
													src={image}
													alt=""
													class="size-24 rounded-xl border border-petal-100 bg-petal-50 object-cover"
												/>
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
														onClick={() =>
															updateVariant(index, {
																images: variant().images.filter(
																	(_, i) => i !== imageIndex(),
																),
															})
														}
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

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-4xl items-center justify-end gap-2">
					<Link to="/admin/products" class={adminButton.secondary}>
						Cancel
					</Link>
					<button
						type="submit"
						class={adminButton.primary}
						disabled={saving() || uploading() !== null}
					>
						{saving() ? "Saving…" : isNew() ? "Create product" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
