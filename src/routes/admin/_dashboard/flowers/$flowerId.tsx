import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { createCropper } from "~/components/admin/image-cropper";
import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { type FlowerRecord, SINGLE_COLOR_NAME } from "~/lib/custom-bouquet";
import { cn } from "~/lib/utils";
import { uploadProductImage } from "~/server/admin/catalog";
import {
	deleteFlowerFn,
	getFlowerAdmin,
	saveFlowerFn,
} from "~/server/admin/flowers";

export const Route = createFileRoute("/admin/_dashboard/flowers/$flowerId")({
	loader: async ({ params }) => {
		if (params.flowerId === "new") return null;
		const flower = await getFlowerAdmin({ data: params.flowerId });
		if (!flower) throw notFound();
		return flower;
	},
	component: FlowerEditor,
});

interface ColorDraft {
	/** Stable for rendering; new colors have no `id` until saved. */
	key: string;
	id?: string;
	name: string;
	price: string;
	/** Blank means not counted. */
	stock: string;
	enabled: boolean;
	image: string;
}

interface FlowerDraft {
	/** The name as last saved; empty for a new flower. */
	savedName: string;
	name: string;
	hint: string;
	enabled: boolean;
	image: string;
	colors: ColorDraft[];
}

const newColor = (name = ""): ColorDraft => ({
	key: crypto.randomUUID(),
	name,
	price: "",
	stock: "",
	enabled: true,
	image: "",
});

function toDraft(flower: FlowerRecord | null): FlowerDraft {
	if (!flower)
		return {
			savedName: "",
			name: "",
			hint: "",
			enabled: true,
			image: "",
			colors: [newColor(SINGLE_COLOR_NAME)],
		};
	return {
		savedName: flower.name,
		name: flower.name,
		hint: flower.kind.hint ?? "",
		enabled: flower.enabled,
		image: flower.image ?? "",
		colors: flower.colors.map((color) => ({
			key: color.id,
			id: color.id,
			name: color.name,
			price: String(color.price),
			stock: color.stock === undefined ? "" : String(color.stock),
			enabled: color.enabled,
			image: color.image ?? "",
		})),
	};
}

function FlowerEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	const isNew = () => params().flowerId === "new";
	const [draft, setDraft] = createStore<FlowerDraft>(toDraft(loaded()));
	const [saving, setSaving] = createSignal(false);
	const usedIn = () => loaded()?.usedIn ?? 0;
	const renamed = () =>
		!!draft.savedName && draft.savedName !== draft.name.trim();

	const cropper = createCropper();
	/** "flower" for the main photo, or a color's key. */
	const [uploading, setUploading] = createSignal<string | null>(null);
	const uploadPhoto = async (files: FileList | null, colorKey?: string) => {
		const chosen = files?.[0];
		if (!chosen) return;
		const color = draft.colors.find((c) => c.key === colorKey);
		const file = await cropper.crop(chosen, {
			aspect: 1,
			title: `Crop the ${color ? `${color.name} ` : ""}${draft.name || "flower"} photo`,
		});
		if (!file) return;
		setUploading(colorKey ?? "flower");
		try {
			const body = new FormData();
			body.set("file", file);
			const result = await uploadProductImage({ data: body });
			if (!result.ok) toastError(new Error(result.message));
			else if (colorKey)
				setDraft("colors", (c) => c.key === colorKey, "image", result.url);
			else setDraft("image", result.url);
		} catch (error) {
			toastError(error);
		} finally {
			setUploading(null);
		}
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveFlowerFn({
				data: {
					id: isNew() ? "" : params().flowerId,
					flower: {
						name: draft.name,
						hint: draft.hint,
						enabled: draft.enabled,
						image: draft.image,
						colors: draft.colors.map((c) => ({
							...(c.id ? { id: c.id } : {}),
							name: c.name,
							price: c.price.trim() === "" ? Number.NaN : Number(c.price),
							stock: c.stock.trim() === "" ? null : Number(c.stock),
							enabled: c.enabled,
							image: c.image,
						})),
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the flower.");
			toastSuccess(isNew() ? "Flower added." : "Changes saved.");
			setDraft(toDraft(saved));
			if (isNew())
				await navigate({
					to: "/admin/flowers/$flowerId",
					params: { flowerId: saved.id },
					replace: true,
				});
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const PhotoPicker = (props: {
		src: string;
		alt: string;
		slot: string;
		onFiles: (files: FileList | null) => void;
		onRemove: () => void;
		size: string;
	}) => (
		<div class="flex flex-col items-start gap-1 text-xs">
			<Show
				when={props.src}
				fallback={
					<span
						class={cn(
							"flex items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-[10px] text-petal-900/45",
							props.size,
						)}
					>
						No photo
					</span>
				}
			>
				<ZoomableImage
					src={props.src}
					alt={props.alt}
					hoverPreview
					class={cn(
						"rounded-lg border border-black/10 object-cover",
						props.size,
					)}
				/>
			</Show>
			<span class="flex gap-2">
				<label
					class={cn(
						"cursor-pointer text-petal-700 py-2 underline-offset-2 hover:underline sm:py-0",
						uploading() === props.slot && "pointer-events-none opacity-60",
					)}
				>
					{uploading() === props.slot
						? "Uploading…"
						: props.src
							? "Replace"
							: "Add photo"}
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp"
						class="sr-only"
						aria-label={`${props.alt} photo`}
						onChange={(e) => {
							props.onFiles(e.currentTarget.files);
							e.currentTarget.value = "";
						}}
					/>
				</label>
				<Show when={props.src}>
					<button
						type="button"
						aria-label={`Remove ${props.alt} photo`}
						class="text-error-foreground py-2 underline-offset-2 hover:underline sm:py-0"
						onClick={props.onRemove}
					>
						Remove
					</button>
				</Show>
			</span>
		</div>
	);

	return (
		<form onSubmit={save} class="mx-auto max-w-3xl pb-24">
			{cropper.element()}
			<Link to="/admin/flowers" class={cn(adminButton.ghost, "-ml-2 mb-2")}>
				← Flowers
			</Link>
			<PageHeader
				title={isNew() ? "New flower" : draft.savedName || "Untitled flower"}
			/>

			<section
				class={cn(adminCard, "mb-6 grid gap-4 p-5 sm:grid-cols-[auto_1fr]")}
			>
				<PhotoPicker
					src={draft.image}
					alt={draft.name || "Flower"}
					slot="flower"
					size="size-24"
					onFiles={(files) => void uploadPhoto(files)}
					onRemove={() => setDraft("image", "")}
				/>
				<div class="grid gap-4">
					<Field label="Name">
						<input
							value={draft.name}
							onInput={(e) => setDraft("name", e.currentTarget.value)}
							required
							maxLength={40}
							placeholder="e.g. Peony"
							class={adminInput}
						/>
					</Field>
					<Show when={renamed() && usedIn() > 0}>
						<p class="-mt-2 text-xs text-petal-900/60">
							{usedIn()} signature bouquet{" "}
							{usedIn() === 1 ? "style uses" : "styles use"} “{draft.savedName}
							”; their recipes show the new name when you save.
						</p>
					</Show>
					<Field
						label="Note (optional)"
						hint="Shown with the name in the builder."
					>
						<input
							value={draft.hint}
							onInput={(e) => setDraft("hint", e.currentTarget.value)}
							maxLength={60}
							placeholder="e.g. big yellow chrysanthemum"
							class={adminInput}
						/>
					</Field>
					<div class="flex flex-col gap-1">
						<Toggle
							label="Use in custom bouquets"
							checked={draft.enabled}
							onChange={(checked) => setDraft("enabled", checked)}
						/>
						<span class="text-xs text-petal-900/55">
							Shoppers can pick it in the bouquet builder. Signature bouquet
							recipes can use it either way.
						</span>
					</div>
				</div>
			</section>

			<section class={cn(adminCard, "mb-6 p-5")}>
				<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="font-semibold">Colors</h2>
						<p class="text-sm text-petal-900/60">
							Each color has its own price and stock, per stem or bunch. Switch
							on “In custom bouquets” for the colors shoppers can choose in the
							builder. With just one color, shoppers don’t pick one.
						</p>
						<p id="color-stock-hint" class="text-sm text-petal-900/60">
							Built bouquets take from stock; cancelled orders put it back.
							Leave stock blank to not count it.
						</p>
					</div>
					<button
						type="button"
						class={adminButton.secondary}
						onClick={() => setDraft("colors", (list) => [...list, newColor()])}
					>
						+ Add color
					</button>
				</div>
				<ul class="flex flex-col gap-3">
					<For each={draft.colors}>
						{(color, index) => (
							<li class="flex flex-wrap items-end gap-3 rounded-xl border border-petal-100 p-3">
								<PhotoPicker
									src={color.image}
									alt={`${color.name} ${draft.name}`.trim() || "Color"}
									slot={color.key}
									size="size-16"
									onFiles={(files) => void uploadPhoto(files, color.key)}
									onRemove={() => setDraft("colors", index(), "image", "")}
								/>
								<Field label="Color" class="min-w-36 flex-1">
									<input
										value={color.name}
										onInput={(e) =>
											setDraft("colors", index(), "name", e.currentTarget.value)
										}
										required
										maxLength={30}
										placeholder="e.g. Red"
										class={adminInput}
									/>
								</Field>
								<Field label="Price each (₱)">
									<input
										type="number"
										min="0"
										step="0.01"
										inputMode="decimal"
										value={color.price}
										onInput={(e) =>
											setDraft(
												"colors",
												index(),
												"price",
												e.currentTarget.value,
											)
										}
										required
										class={cn(adminInput, "w-32 tabular-nums")}
									/>
								</Field>
								<Field label="In stock">
									<input
										type="number"
										min="0"
										step="1"
										inputMode="numeric"
										value={color.stock}
										onInput={(e) =>
											setDraft(
												"colors",
												index(),
												"stock",
												e.currentTarget.value,
											)
										}
										placeholder="Not counted"
										aria-describedby="color-stock-hint"
										class={cn(
											adminInput,
											"w-32 tabular-nums",
											color.stock === "0" && "border-error-foreground",
										)}
									/>
								</Field>
								<div class="pb-2">
									<Toggle
										label="In custom bouquets"
										checked={color.enabled}
										onChange={(checked) =>
											setDraft("colors", index(), "enabled", checked)
										}
									/>
								</div>
								<button
									type="button"
									class={cn(adminButton.ghost, "mb-1 text-error-foreground")}
									disabled={draft.colors.length === 1}
									title={
										draft.colors.length === 1
											? "Every flower needs at least one color."
											: undefined
									}
									onClick={() =>
										setDraft("colors", (list) =>
											list.filter((c) => c.key !== color.key),
										)
									}
								>
									Remove
								</button>
							</li>
						)}
					</For>
				</ul>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description={
								usedIn() > 0
									? `It’s in ${usedIn()} signature bouquet ${usedIn() === 1 ? "style" : "styles"}, so it can’t be deleted until it’s taken out of those recipes. To hide it from the builder, stop using it in custom bouquets instead.`
									: "It and its colors are removed for good. Past orders keep their details."
							}
							confirmLabel="Delete flower"
							onConfirm={async () => {
								try {
									await deleteFlowerFn({ data: { id: params().flowerId } });
									toastSuccess("Flower deleted.");
									await navigate({ to: "/admin/flowers" });
								} catch (error) {
									toastError(error);
								}
							}}
						>
							Delete
						</ConfirmButton>
					</Show>
					<Link to="/admin/flowers" class={adminButton.secondary}>
						Cancel
					</Link>
					<button
						type="submit"
						class={adminButton.primary}
						disabled={saving() || uploading() !== null}
					>
						{saving() ? "Saving…" : isNew() ? "Add flower" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
