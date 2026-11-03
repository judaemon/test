import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createSignal, Index, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { createCropper } from "~/components/admin/image-cropper";
import { saveThumbnailFor } from "~/components/admin/photo-thumbnails";
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
import {
	type CustomWrapper,
	MAX_WRAPPER_COLORS,
	wrapperColors,
} from "~/lib/custom-bouquet";
import { swatchColors } from "~/lib/product";
import { cn } from "~/lib/utils";
import { uploadProductImage } from "~/server/admin/catalog";
import {
	deleteWrapperFn,
	getWrapperAdmin,
	saveWrapperFn,
} from "~/server/admin/wrappers";

export const Route = createFileRoute("/admin/_dashboard/wrappers/$wrapperId")({
	loader: async ({ params }) => {
		if (params.wrapperId === "new") return null;
		const wrapper = await getWrapperAdmin({ data: params.wrapperId });
		if (!wrapper) throw notFound();
		return wrapper;
	},
	component: WrapperEditor,
});

interface WrapperDraft {
	/** The name as last saved; empty for a new wrapper. */
	savedName: string;
	code: string;
	name: string;
	/** Empty until staff pick one: a new wrapper has no color yet. */
	colorHex: string;
	extraColors: string[];
	price: string;
	/** Blank means not counted. */
	stock: string;
	stockActual: string;
	enabled: boolean;
	image: string;
}

function toDraft(wrapper: CustomWrapper | null): WrapperDraft {
	return {
		savedName: wrapper?.name ?? "",
		code: wrapper?.code ?? "",
		name: wrapper?.name ?? "",
		colorHex: wrapper?.colorHex ?? "",
		extraColors: [...(wrapper?.extraColors ?? [])],
		price: wrapper ? String(wrapper.price) : "0",
		stock: wrapper?.stock === undefined ? "" : String(wrapper.stock),
		stockActual:
			wrapper?.stockActual === undefined ? "" : String(wrapper.stockActual),
		enabled: wrapper?.enabled ?? true,
		image: wrapper?.image ?? "",
	};
}

function WrapperEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	const router = useRouter();
	const isNew = () => params().wrapperId === "new";
	const [draft, setDraft] = createStore<WrapperDraft>(toDraft(loaded()));
	const [saving, setSaving] = createSignal(false);
	const [uploading, setUploading] = createSignal(false);

	const cropper = createCropper();
	const uploadPhoto = async (files: FileList | null) => {
		const chosen = files?.[0];
		if (!chosen) return;
		const file = await cropper.crop(chosen, {
			aspect: 1,
			title: `Crop the ${draft.name || "wrapper"} photo`,
		});
		if (!file) return;
		setUploading(true);
		try {
			const body = new FormData();
			body.set("file", file);
			const result = await uploadProductImage({ data: body });
			if (result.ok) {
				setDraft("image", result.url);
				// The shop's smaller copy; it falls back to this photo without one.
				void saveThumbnailFor(result.url, file).catch(() => undefined);
			} else toastError(new Error(result.message));
		} catch (error) {
			toastError(error);
		} finally {
			setUploading(false);
		}
	};

	const swatch = () =>
		draft.colorHex ? swatchColors(wrapperColors(draft)) : "transparent";

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveWrapperFn({
				data: {
					id: isNew() ? "" : params().wrapperId,
					wrapper: {
						code: draft.code,
						name: draft.name,
						colorHex: draft.colorHex,
						extraColors: [...draft.extraColors],
						price: Number(draft.price),
						stock: draft.stock.trim() === "" ? null : Number(draft.stock),
						stockActual:
							draft.stockActual.trim() === ""
								? null
								: Number(draft.stockActual),
						enabled: draft.enabled,
						image: draft.image,
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the wrapper.");
			toastSuccess(isNew() ? "Wrapper added." : "Changes saved.");
			// So the list shows this save straight away.
			await router.invalidate();
			await navigate({ to: "/admin/wrappers", replace: true });
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-3xl pb-24">
			{cropper.element()}
			<Link to="/admin/wrappers" class={cn(adminButton.ghost, "-ml-2 mb-2")}>
				← Wrappers
			</Link>
			<PageHeader
				title={isNew() ? "New wrapper" : draft.savedName || "Untitled wrapper"}
			/>

			<section
				class={cn(adminCard, "mb-6 grid gap-4 p-5 sm:grid-cols-[auto_1fr]")}
			>
				<div class="flex flex-col items-start gap-1 text-xs">
					<Show
						when={draft.image}
						fallback={
							<span
								aria-hidden="true"
								class={cn(
									"size-24 rounded-lg border border-black/10",
									!draft.colorHex && "border-dashed border-petal-300",
								)}
								style={{ background: swatch() }}
							/>
						}
					>
						<ZoomableImage
							src={draft.image}
							alt={`${draft.name} wrapper`}
							hoverPreview
							class="size-24 rounded-lg border border-black/10 object-cover"
						/>
					</Show>
					<span class="flex gap-2">
						<label
							class={cn(
								"cursor-pointer text-petal-700 py-2 underline-offset-2 hover:underline sm:py-0",
								uploading() && "pointer-events-none opacity-60",
							)}
						>
							{uploading()
								? "Uploading…"
								: draft.image
									? "Replace"
									: "Add photo (optional)"}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp"
								class="sr-only"
								aria-label={`${draft.name || "Wrapper"} photo`}
								onChange={(e) => {
									void uploadPhoto(e.currentTarget.files);
									e.currentTarget.value = "";
								}}
							/>
						</label>
						<Show when={draft.image}>
							<button
								type="button"
								class="text-error-foreground py-2 underline-offset-2 hover:underline sm:py-0"
								onClick={() => setDraft("image", "")}
							>
								Remove
							</button>
						</Show>
					</span>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field label="Name">
						<input
							value={draft.name}
							onInput={(e) => setDraft("name", e.currentTarget.value)}
							required
							maxLength={40}
							placeholder="e.g. Kraft brown"
							class={adminInput}
						/>
					</Field>
					<Field
						label="Code"
						hint="Unique. An Excel import overwrites the wrapper with its code."
					>
						<input
							value={draft.code}
							onInput={(e) => setDraft("code", e.currentTarget.value)}
							maxLength={40}
							placeholder="e.g. 2T RED GOLD"
							class={adminInput}
						/>
					</Field>
					<div class="flex flex-col gap-1.5">
						<span class="text-sm font-medium">Color</span>
						<div class="flex flex-wrap items-center gap-2">
							<input
								type="color"
								aria-label="Color 1"
								value={draft.colorHex || "#ffffff"}
								onInput={(e) => setDraft("colorHex", e.currentTarget.value)}
								class="h-10 w-12 cursor-pointer rounded-lg border border-petal-200 bg-white p-1"
							/>
							<Index each={draft.extraColors}>
								{(color, index) => (
									<span class="relative">
										<input
											type="color"
											aria-label={`Color ${index + 2}`}
											value={color()}
											onInput={(e) =>
												setDraft("extraColors", index, e.currentTarget.value)
											}
											class="h-10 w-12 cursor-pointer rounded-lg border border-petal-200 bg-white p-1"
										/>
										<button
											type="button"
											aria-label={`Remove color ${index + 2}`}
											onClick={() =>
												setDraft("extraColors", (list) =>
													list.filter((_, i) => i !== index),
												)
											}
											class="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-petal-200 bg-white text-xs text-petal-900/70 outline-none hover:bg-petal-50 hover:text-error-foreground focus-visible:ring-2 focus-visible:ring-petal-500"
										>
											✕
										</button>
									</span>
								)}
							</Index>
							<Show when={draft.extraColors.length + 1 < MAX_WRAPPER_COLORS}>
								<button
									type="button"
									aria-label="Add a color"
									title="Add a color"
									onClick={() =>
										setDraft("extraColors", (list) => [...list, "#ffffff"])
									}
									class="flex h-10 w-12 items-center justify-center rounded-lg border border-dashed border-petal-300 text-lg text-petal-700 outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									+
								</button>
							</Show>
							<span
								aria-hidden="true"
								class="size-7 shrink-0 rounded-full border border-black/10"
								style={{ background: swatch() }}
							/>
						</div>
						<span class="text-xs text-petal-900/55">
							Required. Press + for wrappers with more than one color, up to{" "}
							{MAX_WRAPPER_COLORS}.
						</span>
					</div>
					<Field label="Price (₱)" hint="0 shows as “Free”.">
						<input
							type="number"
							min="0"
							step="0.01"
							inputMode="decimal"
							value={draft.price}
							onInput={(e) => setDraft("price", e.currentTarget.value)}
							required
							class={cn(adminInput, "tabular-nums")}
						/>
					</Field>
					<Field
						label="Stock actual"
						hint="The count on your stock sheet. Orders don’t change it."
					>
						<input
							type="number"
							min="0"
							step="1"
							inputMode="numeric"
							value={draft.stockActual}
							onInput={(e) => setDraft("stockActual", e.currentTarget.value)}
							placeholder="Not recorded"
							class={cn(adminInput, "tabular-nums")}
						/>
					</Field>
					<Field
						label="Stock on hand"
						hint="Each built bouquet uses one; cancelled orders put it back. Leave blank to not count it."
					>
						<input
							type="number"
							min="0"
							step="1"
							inputMode="numeric"
							value={draft.stock}
							onInput={(e) => setDraft("stock", e.currentTarget.value)}
							placeholder="Not counted"
							class={cn(
								adminInput,
								"tabular-nums",
								draft.stock === "0" && "border-error-foreground",
							)}
						/>
					</Field>
					<div class="flex items-center sm:pt-6">
						<Toggle
							label="Offer in the bouquet builder"
							checked={draft.enabled}
							onChange={(checked) => setDraft("enabled", checked)}
						/>
					</div>
				</div>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description="It can’t be picked in the builder any more. Bouquets already in shoppers’ bags with it ask them to pick another; past orders keep their details."
							confirmLabel="Delete wrapper"
							onConfirm={async () => {
								try {
									await deleteWrapperFn({ data: { id: params().wrapperId } });
									toastSuccess("Wrapper deleted.");
									await navigate({ to: "/admin/wrappers" });
								} catch (error) {
									toastError(error);
								}
							}}
						>
							Delete
						</ConfirmButton>
					</Show>
					<Link to="/admin/wrappers" class={adminButton.secondary}>
						Cancel
					</Link>
					<button
						type="submit"
						class={adminButton.primary}
						disabled={saving() || uploading()}
					>
						{saving() ? "Saving…" : isNew() ? "Add wrapper" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
