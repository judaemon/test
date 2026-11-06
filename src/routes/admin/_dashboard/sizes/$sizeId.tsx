import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
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
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { DEFAULT_ARRANGEMENT } from "~/lib/arrangements";
import { useArrangementTypes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { uploadProductImage } from "~/server/admin/catalog";
import { deleteSizeFn, getSizeAdmin, saveSizeFn } from "~/server/admin/sizes";

export const Route = createFileRoute("/admin/_dashboard/sizes/$sizeId")({
	// "+ Add corsage size" starts the new size with that type.
	validateSearch: (search: Record<string, unknown>): { type?: string } => ({
		type:
			typeof search.type === "string" && search.type
				? search.type.slice(0, 64)
				: undefined,
	}),
	loader: async ({ params }) => {
		if (params.sizeId === "new") return null;
		const size = await getSizeAdmin({ data: params.sizeId });
		if (!size) throw notFound();
		return size;
	},
	component: SizeEditor,
});

function SizeEditor() {
	const loaded = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	const router = useRouter();
	const isNew = () => params().sizeId === "new";
	const [draft, setDraft] = createStore({
		savedName: loaded()?.name ?? "",
		name: loaded()?.name ?? "",
		description: loaded()?.description ?? "",
		image: loaded()?.image ?? "",
		arrangement:
			loaded()?.arrangement ?? Route.useSearch()().type ?? DEFAULT_ARRANGEMENT,
		// Kept as typed; empty leaves the size out of the builder.
		price: loaded()?.price === undefined ? "" : String(loaded()?.price),
	});
	const [saving, setSaving] = createSignal(false);
	const [uploading, setUploading] = createSignal(false);
	const usedIn = () => loaded()?.usedIn ?? 0;
	const arrangementTypes = useArrangementTypes();

	const cropper = createCropper();
	const uploadPhoto = async (files: FileList | null) => {
		const chosen = files?.[0];
		if (!chosen) return;
		// Tall, like the figures in the size guide.
		const file = await cropper.crop(chosen, {
			aspect: 275 / 620,
			title: `Crop the ${draft.name || "size"} picture`,
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

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const saved = await saveSizeFn({
				data: {
					id: isNew() ? "" : params().sizeId,
					size: {
						name: draft.name,
						description: draft.description,
						image: draft.image,
						arrangement: draft.arrangement,
						price: draft.price.trim() === "" ? null : Number(draft.price),
					},
				},
			});
			if (!saved) throw new Error("Couldn’t save the size.");
			toastSuccess(isNew() ? "Size added." : "Changes saved.");
			// The shop and the bouquet editor read sizes from the root route.
			await router.invalidate();
			await navigate({ to: "/admin/sizes", replace: true });
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-3xl pb-24">
			{cropper.element()}
			<Link to="/admin/sizes" class={cn(adminButton.ghost, "-ml-2 mb-2")}>
				← Sizes
			</Link>
			<PageHeader
				title={isNew() ? "New size" : draft.savedName || "Untitled size"}
				description={
					isNew()
						? "New sizes go last (largest). Reorder them on the Sizes page."
						: undefined
				}
			/>

			<section class={cn(adminCard, "grid gap-5 p-5 sm:grid-cols-[auto_1fr]")}>
				<div class="flex flex-col items-start gap-1 text-xs">
					<Show
						when={draft.image}
						fallback={
							<span class="flex h-48 w-[85px] items-center justify-center rounded-lg border-2 border-dashed border-petal-200 px-2 text-center text-[10px] text-petal-900/45">
								No picture
							</span>
						}
					>
						<img
							src={draft.image}
							alt={`Someone holding a ${draft.name} bouquet`}
							class="h-48 w-[85px] rounded-lg border border-black/10 bg-[#fdf9ea] object-contain"
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
									: "Add picture"}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp"
								class="sr-only"
								aria-label={`${draft.name || "Size"} picture`}
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
				<div class="grid content-start gap-4">
					<Field
						label="Type"
						hint="Arrangements of this type can have this size. Changing it takes the size off arrangements of the old type."
					>
						<select
							value={draft.arrangement}
							onChange={(e) => setDraft("arrangement", e.currentTarget.value)}
							class={adminInput}
						>
							<For each={arrangementTypes()}>
								{(type) => (
									<option
										value={type.id}
										selected={draft.arrangement === type.id}
									>
										{type.name}
									</option>
								)}
							</For>
						</select>
					</Field>
					<Field label="Name">
						<input
							value={draft.name}
							onInput={(e) => setDraft("name", e.currentTarget.value)}
							required
							maxLength={30}
							placeholder="e.g. Petite"
							class={adminInput}
						/>
					</Field>
					<Field
						label="Description"
						hint="Shown under the name in the size guide and on each bouquet."
					>
						<input
							value={draft.description}
							onInput={(e) => setDraft("description", e.currentTarget.value)}
							maxLength={80}
							placeholder="e.g. Small enough to hold in one hand"
							class={adminInput}
						/>
					</Field>
					<Field
						label="Builder price (₱)"
						hint="Added to a custom bouquet this size. Leave empty to leave this size out of Build your bouquet; 0 shows as “Free”."
					>
						<input
							type="number"
							min="0"
							step="0.01"
							inputMode="decimal"
							value={draft.price}
							onInput={(e) => setDraft("price", e.currentTarget.value)}
							placeholder="Not in the builder"
							class={cn(adminInput, "tabular-nums")}
						/>
					</Field>
					<p class="text-xs text-petal-900/55">
						The picture shows someone holding a bouquet this size; the size
						guide puts all the pictures side by side.
					</p>
				</div>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show when={!isNew()}>
						<ConfirmButton
							class={cn(adminButton.danger, "mr-auto")}
							title={`Delete ${draft.savedName}?`}
							description={
								usedIn() > 0
									? `${usedIn()} ${usedIn() === 1 ? "arrangement has" : "arrangements have"} this size, so it can’t be deleted until they get another size.`
									: "It’s removed from the size guide for good."
							}
							confirmLabel="Delete size"
							onConfirm={async () => {
								try {
									await deleteSizeFn({ data: { id: params().sizeId } });
									toastSuccess("Size deleted.");
									await router.invalidate();
									await navigate({ to: "/admin/sizes" });
								} catch (error) {
									toastError(error);
								}
							}}
						>
							Delete
						</ConfirmButton>
					</Show>
					<Link to="/admin/sizes" class={adminButton.secondary}>
						Cancel
					</Link>
					<button
						type="submit"
						class={adminButton.primary}
						disabled={saving() || uploading()}
					>
						{saving() ? "Saving…" : isNew() ? "Add size" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
