import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
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
import type { CustomWrapper } from "~/lib/custom-bouquet";
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
	name: string;
	colorHex: string;
	price: string;
	/** Blank means not counted. */
	stock: string;
	enabled: boolean;
	image: string;
}

function toDraft(wrapper: CustomWrapper | null): WrapperDraft {
	return {
		savedName: wrapper?.name ?? "",
		name: wrapper?.name ?? "",
		colorHex: wrapper?.colorHex ?? "#c9a77c",
		price: wrapper ? String(wrapper.price) : "0",
		stock: wrapper?.stock === undefined ? "" : String(wrapper.stock),
		enabled: wrapper?.enabled ?? true,
		image: wrapper?.image ?? "",
	};
}

function WrapperEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
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
			if (result.ok) setDraft("image", result.url);
			else toastError(new Error(result.message));
		} catch (error) {
			toastError(error);
		} finally {
			setUploading(false);
		}
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveWrapperFn({
				data: {
					id: isNew() ? "" : params().wrapperId,
					wrapper: {
						name: draft.name,
						colorHex: draft.colorHex,
						price: Number(draft.price),
						stock: draft.stock.trim() === "" ? null : Number(draft.stock),
						enabled: draft.enabled,
						image: draft.image,
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the wrapper.");
			toastSuccess(isNew() ? "Wrapper added." : "Changes saved.");
			setDraft(toDraft(saved));
			if (isNew())
				await navigate({
					to: "/admin/wrappers/$wrapperId",
					params: { wrapperId: saved.id },
					replace: true,
				});
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
								class="size-24 rounded-lg border border-black/10"
								style={{ background: draft.colorHex }}
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
									: "Add photo"}
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
					<Field label="Name" class="sm:col-span-2">
						<input
							value={draft.name}
							onInput={(e) => setDraft("name", e.currentTarget.value)}
							required
							maxLength={40}
							placeholder="e.g. Kraft brown"
							class={adminInput}
						/>
					</Field>
					<Field label="Color" hint="Shown as a swatch when there’s no photo.">
						<input
							type="color"
							value={draft.colorHex}
							onInput={(e) => setDraft("colorHex", e.currentTarget.value)}
							class="h-10 w-full cursor-pointer rounded-lg border border-petal-200 bg-white p-1"
						/>
					</Field>
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
						label="In stock"
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
