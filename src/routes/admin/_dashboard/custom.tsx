import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { createCropper } from "~/components/admin/image-cropper";
import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { type CustomBouquetSettings, PESO_BILLS } from "~/lib/custom-bouquet";
import { cn } from "~/lib/utils";
import { uploadProductImage } from "~/server/admin/catalog";
import {
	getCustomSettingsAdmin,
	saveCustomSettingsFn,
} from "~/server/admin/custom";

export const Route = createFileRoute("/admin/_dashboard/custom")({
	loader: () => getCustomSettingsAdmin(),
	component: CustomBouquetSettingsPage,
});

interface FlowerDraft {
	/** Stable while editing, even when the name changes. */
	key: string;
	/** The name as last saved; empty for flowers added since. */
	savedName: string;
	name: string;
	enabled: boolean;
	price: string;
	colors: string;
	image: string;
	/** Photos of particular colors, keyed by color name. */
	colorImages: Record<string, string>;
	counted: boolean;
	hasColors: boolean;
	hint: string;
	/** Showing the name / kind editor. */
	editing: boolean;
}

interface Draft {
	enabled: boolean;
	baseFee: string;
	flowers: FlowerDraft[];
	wrappers: {
		key: string;
		id: string;
		name: string;
		colorHex: string;
		price: string;
		enabled: boolean;
		/** Blank means not counted. */
		stock: string;
		image: string;
	}[];
	money: {
		enabled: boolean;
		feePerBill: string;
		denominations: number[];
		maxBills: string;
	};
}

/** The colors typed as "Red, Pink, White", without blanks or repeats. */
function colorList(colors: string) {
	return [
		...new Set(
			colors
				.split(",")
				.map((c) => c.trim())
				.filter(Boolean),
		),
	];
}

function toDraft(settings: CustomBouquetSettings): Draft {
	return {
		enabled: settings.enabled,
		baseFee: String(settings.baseFee),
		flowers: settings.flowers.map((f) => ({
			key: crypto.randomUUID(),
			savedName: f.name,
			name: f.name,
			enabled: f.enabled,
			price: String(f.price),
			colors: f.colors.join(", "),
			image: f.image ?? "",
			colorImages: { ...f.colorImages },
			counted: f.kind.counted,
			hasColors: f.kind.colors,
			hint: f.kind.hint ?? "",
			editing: false,
		})),
		wrappers: settings.wrappers.map((w) => ({
			key: w.id,
			id: w.id,
			name: w.name,
			colorHex: w.colorHex,
			price: String(w.price),
			enabled: w.enabled,
			stock: w.stock === undefined ? "" : String(w.stock),
			image: w.image ?? "",
		})),
		money: {
			enabled: settings.money.enabled,
			feePerBill: String(settings.money.feePerBill),
			denominations: [...settings.money.denominations],
			maxBills: String(settings.money.maxBills),
		},
	};
}

function CustomBouquetSettingsPage() {
	const loaded = Route.useLoaderData();
	const router = useRouter();
	const [draft, setDraft] = createStore<Draft>(toDraft(loaded()));
	const [saving, setSaving] = createSignal(false);
	const [sample, setSample] = createSignal(!loaded().saved);

	const flowerIndex = (key: string) =>
		draft.flowers.findIndex((f) => f.key === key);
	const counted = () => draft.flowers.filter((f) => f.counted);
	const fillers = () => draft.flowers.filter((f) => !f.counted);
	const nameTaken = (name: string, exceptKey?: string) =>
		draft.flowers.some(
			(f) =>
				f.key !== exceptKey &&
				f.name.trim().toLowerCase() === name.toLowerCase(),
		);

	// "Add a flower" form.
	const [newName, setNewName] = createSignal("");
	const [newCounted, setNewCounted] = createSignal(true);
	const [newColors, setNewColors] = createSignal(false);
	const [newPrice, setNewPrice] = createSignal("");
	const [newError, setNewError] = createSignal("");
	const addFlower = () => {
		const name = newName().trim().replace(/\s+/g, " ");
		if (!name) return setNewError("Give the flower a name.");
		if (nameTaken(name))
			return setNewError(`There’s already a flower called “${name}”.`);
		if (!(Number(newPrice()) >= 0) || newPrice().trim() === "")
			return setNewError("Set a price (0 or more).");
		setDraft("flowers", (list) => [
			...list,
			{
				key: crypto.randomUUID(),
				savedName: "",
				name,
				enabled: true,
				price: newPrice().trim(),
				colors: "",
				image: "",
				colorImages: {},
				counted: newCounted(),
				hasColors: newColors(),
				hint: "",
				editing: false,
			},
		]);
		setNewName("");
		setNewPrice("");
		setNewColors(false);
		setNewError("");
	};

	const cropper = createCropper();
	const photoSlot = (key: string, color?: string) =>
		color ? `${key}:${color}` : key;
	const [uploadingFlower, setUploadingFlower] = createSignal<string | null>(
		null,
	);
	/** Uploads the main photo, or the photo of one color when `color` is given. */
	const uploadFlowerPhoto = async (
		key: string,
		files: FileList | null,
		color?: string,
	) => {
		const chosen = files?.[0];
		if (!chosen) return;
		const name = draft.flowers[flowerIndex(key)]?.name ?? "flower";
		const file = await cropper.crop(chosen, {
			aspect: 1,
			title: `Crop the ${color ? `${color} ` : ""}${name} photo`,
		});
		if (!file) return;
		setUploadingFlower(photoSlot(key, color));
		try {
			const body = new FormData();
			body.set("file", file);
			const result = await uploadProductImage({ data: body });
			if (!result.ok) toastError(new Error(result.message));
			else if (color)
				setDraft("flowers", flowerIndex(key), "colorImages", color, result.url);
			else setDraft("flowers", flowerIndex(key), "image", result.url);
		} catch (error) {
			toastError(error);
		} finally {
			setUploadingFlower(null);
		}
	};

	const uploadWrapperPhoto = async (key: string, files: FileList | null) => {
		const chosen = files?.[0];
		if (!chosen) return;
		const at = () => draft.wrappers.findIndex((w) => w.key === key);
		const file = await cropper.crop(chosen, {
			aspect: 1,
			title: `Crop the ${draft.wrappers[at()]?.name || "wrapper"} photo`,
		});
		if (!file) return;
		setUploadingFlower(`wrapper:${key}`);
		try {
			const body = new FormData();
			body.set("file", file);
			const result = await uploadProductImage({ data: body });
			if (result.ok) setDraft("wrappers", at(), "image", result.url);
			else toastError(new Error(result.message));
		} catch (error) {
			toastError(error);
		} finally {
			setUploadingFlower(null);
		}
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (draft.flowers.some((f) => !f.name.trim()))
			return toastError(new Error("Every flower needs a name."));
		setSaving(true);
		try {
			const saved = await saveCustomSettingsFn({
				data: {
					enabled: draft.enabled,
					baseFee: Number(draft.baseFee),
					flowers: draft.flowers.map((f) => ({
						name: f.name.trim(),
						...(f.savedName ? { renamedFrom: f.savedName } : {}),
						enabled: f.enabled,
						price: Number(f.price),
						colors: colorList(f.colors),
						...(f.image ? { image: f.image } : {}),
						colorImages: Object.fromEntries(
							Object.entries(f.colorImages).filter(([, src]) => src),
						),
						kind: {
							counted: f.counted,
							colors: f.hasColors,
							hint: f.hint.trim(),
						},
					})),
					wrappers: draft.wrappers.map((w) => ({
						id: w.id,
						name: w.name,
						colorHex: w.colorHex,
						price: Number(w.price),
						enabled: w.enabled,
						stock: w.stock.trim() === "" ? null : Number(w.stock),
						...(w.image ? { image: w.image } : {}),
					})),
					money: {
						enabled: draft.money.enabled,
						feePerBill: Number(draft.money.feePerBill),
						denominations: draft.money.denominations,
						maxBills: Number(draft.money.maxBills),
					},
				},
			});
			setDraft(toDraft(saved));
			setSample(false);
			toastSuccess("Builder settings saved.");
			// The shop reads these on every page, so refresh its copy too.
			void router.invalidate();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const ColorPhoto = (props: { flowerKey: string; color: string }) => {
		const flower = () => draft.flowers[flowerIndex(props.flowerKey)];
		const src = () => flower()?.colorImages[props.color] || "";
		const uploading = () =>
			uploadingFlower() === photoSlot(props.flowerKey, props.color);
		return (
			<li class="flex w-16 flex-col items-center gap-0.5 text-center text-[11px]">
				<Show
					when={src()}
					fallback={
						<span class="flex size-12 items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-lg text-petal-900/35">
							+
						</span>
					}
				>
					<ZoomableImage
						src={src()}
						alt={`${props.color} ${flower()?.name ?? ""}`}
						hoverPreview
						class="size-12 rounded-lg border border-black/10 object-cover"
					/>
				</Show>
				<span class="w-full truncate font-medium">{props.color}</span>
				<span class="flex gap-1.5">
					<label
						class={cn(
							"cursor-pointer text-petal-700 py-2 underline-offset-2 hover:underline sm:py-0",
							uploading() && "pointer-events-none opacity-60",
						)}
					>
						{uploading() ? "…" : src() ? "Replace" : "Add"}
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							class="sr-only"
							aria-label={`${props.color} ${flower()?.name ?? ""} photo`}
							onChange={(e) => {
								void uploadFlowerPhoto(
									props.flowerKey,
									e.currentTarget.files,
									props.color,
								);
								e.currentTarget.value = "";
							}}
						/>
					</label>
					<Show when={src()}>
						<button
							type="button"
							aria-label={`Remove ${props.color} photo`}
							class="text-error-foreground py-2 underline-offset-2 hover:underline sm:py-0"
							onClick={() =>
								setDraft(
									"flowers",
									flowerIndex(props.flowerKey),
									"colorImages",
									props.color,
									"",
								)
							}
						>
							✕
						</button>
					</Show>
				</span>
			</li>
		);
	};

	const FlowerRow = (props: { key: string }) => {
		const index = () => flowerIndex(props.key);
		const flower = () => draft.flowers[index()];
		const set = <K extends keyof FlowerDraft>(
			field: K,
			value: FlowerDraft[K],
		) => setDraft("flowers", index(), field, value);
		const taken = () => nameTaken(flower()?.name.trim() ?? "", props.key);
		const renamed = () =>
			!!flower()?.savedName && flower()?.savedName !== flower()?.name.trim();
		return (
			<tr class="border-t border-petal-50 align-top">
				<td class="py-2.5 pr-3">
					<div class="flex w-24 flex-col items-start gap-1">
						<Show
							when={flower()?.image}
							fallback={
								<span class="flex size-14 items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-[10px] text-petal-900/45">
									No photo
								</span>
							}
						>
							{(src) => (
								<ZoomableImage
									src={src()}
									alt={flower()?.name ?? ""}
									hoverPreview
									class="size-14 rounded-lg border border-black/10 object-cover"
								/>
							)}
						</Show>
						<div class="flex gap-2 text-xs">
							<label
								class={cn(
									"cursor-pointer text-petal-700 py-2 underline-offset-2 hover:underline sm:py-0",
									uploadingFlower() === props.key &&
										"pointer-events-none opacity-60",
								)}
							>
								{uploadingFlower() === props.key
									? "Uploading…"
									: flower()?.image
										? "Replace"
										: "Add"}
								<input
									type="file"
									accept="image/png,image/jpeg,image/webp"
									class="sr-only"
									onChange={(e) => {
										void uploadFlowerPhoto(props.key, e.currentTarget.files);
										e.currentTarget.value = "";
									}}
								/>
							</label>
							<Show when={flower()?.image}>
								<button
									type="button"
									class="text-error-foreground py-2 underline-offset-2 hover:underline sm:py-0"
									onClick={() => set("image", "")}
								>
									Remove
								</button>
							</Show>
						</div>
					</div>
				</td>
				<td class="py-2.5 pr-3">
					<Show
						when={flower()?.editing}
						fallback={
							<>
								<p class="font-medium">{flower()?.name}</p>
								<Show when={flower()?.hint}>
									<p class="text-xs text-petal-900/55">{flower()?.hint}</p>
								</Show>
								<p class="mt-1 flex gap-3 text-xs">
									<button
										type="button"
										class="text-petal-700 py-2 underline-offset-2 hover:underline sm:py-0"
										onClick={() => set("editing", true)}
									>
										Edit
									</button>
									<button
										type="button"
										class="text-error-foreground py-2 underline-offset-2 hover:underline sm:py-0"
										onClick={() =>
											setDraft("flowers", (list) =>
												list.filter((f) => f.key !== props.key),
											)
										}
									>
										Remove
									</button>
								</p>
							</>
						}
					>
						<div class="flex w-full flex-col gap-2 rounded-xl sm:w-64 border border-petal-200 bg-petal-50/60 p-3">
							<label class="flex flex-col gap-1 text-xs font-medium">
								Name
								<input
									value={flower()?.name ?? ""}
									onInput={(e) => set("name", e.currentTarget.value)}
									maxLength={40}
									aria-invalid={taken() ? "true" : undefined}
									class={cn(adminInput, "h-9 font-normal")}
								/>
							</label>
							<Show when={taken()}>
								<p class="text-xs text-destructive">
									Another flower already has this name.
								</p>
							</Show>
							<Show when={renamed()}>
								<p class="text-xs text-petal-900/60">
									Bouquets that use “{flower()?.savedName}” switch to the new
									name when you save.
								</p>
							</Show>
							<div class="flex gap-1.5 text-xs">
								<For
									each={
										[
											[true, "Counted"],
											[false, "Cluster"],
										] as const
									}
								>
									{([value, label]) => (
										<label class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-petal-200 bg-white py-1.5 has-[:checked]:border-petal-700 has-[:checked]:font-medium">
											<input
												type="radio"
												name={`counted-${props.key}`}
												checked={flower()?.counted === value}
												onChange={() => set("counted", value)}
												class="accent-petal-700"
											/>
											{label}
										</label>
									)}
								</For>
							</div>
							<label class="flex items-center gap-2 text-xs">
								<input
									type="checkbox"
									checked={flower()?.hasColors ?? false}
									onChange={(e) => set("hasColors", e.currentTarget.checked)}
									class="accent-petal-700"
								/>
								Comes in colors
							</label>
							<label class="flex flex-col gap-1 text-xs font-medium">
								Note (optional)
								<input
									value={flower()?.hint ?? ""}
									onInput={(e) => set("hint", e.currentTarget.value)}
									maxLength={60}
									placeholder="e.g. big yellow chrysanthemum"
									class={cn(adminInput, "h-9 font-normal")}
								/>
							</label>
							<button
								type="button"
								class={cn(adminButton.secondary, "self-end")}
								onClick={() => set("editing", false)}
							>
								Done
							</button>
						</div>
					</Show>
				</td>
				<td data-label="Offered" class="py-2.5 pr-3">
					<Toggle
						label={`Offer ${flower()?.name}`}
						hideLabel
						checked={flower()?.enabled ?? false}
						onChange={(checked) => set("enabled", checked)}
					/>
				</td>
				<td data-label="Price (₱)" class="py-2.5 pr-3">
					<input
						type="number"
						min="0"
						step="1"
						inputMode="decimal"
						value={flower()?.price ?? ""}
						onInput={(e) => set("price", e.currentTarget.value)}
						aria-label={`${flower()?.name} price`}
						class={cn(adminInput, "w-28 tabular-nums")}
					/>
				</td>
				<td
					data-label="Colors shoppers can pick"
					data-wide
					class="py-2.5"
					classList={{ "max-md:hidden": !flower()?.hasColors }}
				>
					<Show
						when={flower()?.hasColors}
						fallback={<span class="text-sm text-petal-900/55">—</span>}
					>
						<input
							value={flower()?.colors ?? ""}
							onInput={(e) => set("colors", e.currentTarget.value)}
							placeholder="e.g. Red, Pink, White"
							aria-label={`${flower()?.name} colors`}
							class={cn(adminInput, "w-full min-w-48")}
						/>
						<Show when={colorList(flower()?.colors ?? "").length > 0}>
							<p class="mt-2 text-[11px] text-petal-900/55">
								Photo per color (otherwise the main photo is used):
							</p>
							<ul class="mt-1 flex flex-wrap gap-2">
								<For each={colorList(flower()?.colors ?? "")}>
									{(color) => (
										<ColorPhoto flowerKey={props.key} color={color} />
									)}
								</For>
							</ul>
						</Show>
					</Show>
				</td>
			</tr>
		);
	};

	return (
		<form onSubmit={save} class="mx-auto max-w-4xl pb-24">
			{cropper.element()}
			<PageHeader
				title="Custom bouquets"
				description="What shoppers can pick in the bouquet builder (flowers, money and wrappers) and what each part costs."
			/>

			<Show when={sample()}>
				<p class="mb-4 rounded-2xl border border-warning-foreground/30 bg-warning px-4 py-3 text-sm text-warning-foreground">
					<strong class="font-semibold">These are sample prices.</strong> Set
					your real prices, colors and wrappers, then save. Until then the
					builder sells at these amounts.
				</p>
			</Show>

			<section class={cn(adminCard, "mb-6 grid gap-4 p-5 sm:grid-cols-2")}>
				<div class="flex flex-col justify-center gap-1">
					<Toggle
						label="Show the builder in the shop"
						checked={draft.enabled}
						onChange={(checked) => setDraft("enabled", checked)}
					/>
					<span class="text-xs text-petal-900/55">
						When off, shoppers are asked to message you instead.
					</span>
				</div>
				<Field
					label="Base fee (₱)"
					hint="Arranging and tying, added once to every custom bouquet."
				>
					<input
						type="number"
						min="0"
						step="1"
						inputMode="decimal"
						value={draft.baseFee}
						onInput={(e) => setDraft("baseFee", e.currentTarget.value)}
						class={adminInput}
					/>
				</Field>
			</section>

			<For
				each={[
					{
						title: "Counted flowers",
						note: "Price is per stem.",
						rows: counted,
					},
					{
						title: "Fillers",
						note: "Price is per cluster.",
						rows: fillers,
					},
				]}
			>
				{(group) => (
					<section class={cn(adminCard, "relative mb-6 overflow-x-auto p-5")}>
						<h2 class="font-semibold">{group.title}</h2>
						<p class="mb-3 text-sm text-petal-900/60">{group.note}</p>
						<table class="stack-table w-full text-left text-sm">
							<thead class="text-xs uppercase tracking-wide text-petal-900/55">
								<tr>
									<th class="pb-2 pr-3 font-medium">Photo</th>
									<th class="pb-2 pr-3 font-medium">Flower</th>
									<th class="pb-2 pr-3 font-medium">Offered</th>
									<th class="pb-2 pr-3 font-medium">Price (₱)</th>
									<th class="pb-2 font-medium">Colors shoppers can pick</th>
								</tr>
							</thead>
							<tbody>
								<For each={group.rows()}>
									{(flower) => <FlowerRow key={flower.key} />}
								</For>
							</tbody>
						</table>
					</section>
				)}
			</For>
			<section class={cn(adminCard, "mb-6 p-5")} aria-labelledby="add-flower">
				<h2 id="add-flower" class="font-semibold">
					Add a flower
				</h2>
				<p class="mb-4 text-sm text-petal-900/60">
					For flowers not in the list above. Once saved, it can be picked in the
					builder and used in bouquet recipes.
				</p>
				<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_9rem] sm:items-end">
					<Field label="Flower name">
						<input
							value={newName()}
							onInput={(e) => {
								setNewName(e.currentTarget.value);
								setNewError("");
							}}
							maxLength={40}
							placeholder="e.g. Peony"
							class={adminInput}
						/>
					</Field>
					<fieldset>
						<legend class="mb-1.5 text-sm font-medium">Sold as</legend>
						<div class="flex gap-2">
							<For
								each={
									[
										[true, "Counted (per stem)"],
										[false, "Cluster (no count)"],
									] as const
								}
							>
								{([value, label]) => (
									<label class="flex cursor-pointer items-center gap-2 rounded-xl border border-petal-200 px-3 py-2 text-sm has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50">
										<input
											type="radio"
											name="new-flower-counted"
											checked={newCounted() === value}
											onChange={() => setNewCounted(value)}
											class="accent-petal-700"
										/>
										{label}
									</label>
								)}
							</For>
						</div>
					</fieldset>
					<Field
						label={
							newCounted() ? "Price per stem (₱)" : "Price per cluster (₱)"
						}
					>
						<input
							type="number"
							min="0"
							step="1"
							inputMode="decimal"
							value={newPrice()}
							onInput={(e) => {
								setNewPrice(e.currentTarget.value);
								setNewError("");
							}}
							class={adminInput}
						/>
					</Field>
				</div>
				<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={newColors()}
							onChange={(e) => setNewColors(e.currentTarget.checked)}
							class="accent-petal-700"
						/>
						Comes in colors (list them in the table after adding)
					</label>
					<button
						type="button"
						class={adminButton.secondary}
						onClick={addFlower}
					>
						+ Add flower
					</button>
				</div>
				<Show when={newError()}>
					<p role="alert" class="mt-2 text-sm text-destructive">
						{newError()}
					</p>
				</Show>
				<p class="mt-2 text-xs text-petal-900/55">
					New flowers show in the tables above. Press “Save changes” to keep
					them.
				</p>
			</section>

			<section class={cn(adminCard, "mb-6 p-5")}>
				<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="font-semibold">Money bouquets</h2>
						<p class="text-sm text-petal-900/60">
							Shoppers add bills to their bouquet. They pay each bill’s value
							plus the fee per bill.
						</p>
					</div>
					<Toggle
						label="Offer money bouquets"
						checked={draft.money.enabled}
						onChange={(checked) => setDraft("money", "enabled", checked)}
					/>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field
						label="Fee per bill (₱)"
						hint="Folding and handling each bill."
					>
						<input
							type="number"
							min="0"
							step="1"
							inputMode="decimal"
							value={draft.money.feePerBill}
							onInput={(e) =>
								setDraft("money", "feePerBill", e.currentTarget.value)
							}
							class={adminInput}
						/>
					</Field>
					<Field label="Most bills per bouquet">
						<input
							type="number"
							min="1"
							max="500"
							step="1"
							inputMode="numeric"
							value={draft.money.maxBills}
							onInput={(e) =>
								setDraft("money", "maxBills", e.currentTarget.value)
							}
							class={adminInput}
						/>
					</Field>
				</div>
				<fieldset class="mt-4">
					<legend class="mb-2 text-sm font-medium">Bills you can add</legend>
					<div class="flex flex-wrap gap-2">
						<For each={PESO_BILLS}>
							{(bill) => (
								<label class="flex cursor-pointer items-center gap-2 rounded-full border border-petal-200 px-3 py-1.5 text-sm tabular-nums has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50">
									<input
										type="checkbox"
										checked={draft.money.denominations.includes(bill)}
										onChange={(e) =>
											setDraft("money", "denominations", (list) =>
												e.currentTarget.checked
													? [...list, bill].sort((a, b) => a - b)
													: list.filter((value) => value !== bill),
											)
										}
										class="accent-petal-700"
									/>
									₱{bill.toLocaleString("en-PH")}
								</label>
							)}
						</For>
					</div>
				</fieldset>
			</section>

			<section class={cn(adminCard, "mb-6 p-5")}>
				<div class="mb-3 flex items-center justify-between gap-3">
					<div>
						<h2 class="font-semibold">Wrappers</h2>
						<p class="text-sm text-petal-900/60">
							Shoppers pick one. A price of 0 shows as “Free”.
						</p>
						<p id="wrapper-stock-hint" class="text-sm text-petal-900/60">
							Each built bouquet uses one wrapper from stock; cancelled orders
							put it back. Leave stock blank to not count it.
						</p>
					</div>
					<button
						type="button"
						class={adminButton.secondary}
						onClick={() =>
							setDraft("wrappers", (list) => [
								...list,
								{
									key: crypto.randomUUID(),
									id: "",
									name: "",
									colorHex: "#c9a77c",
									price: "0",
									enabled: true,
									stock: "",
									image: "",
								},
							])
						}
					>
						+ Add wrapper
					</button>
				</div>
				<ul class="flex flex-col gap-3">
					<For each={draft.wrappers}>
						{(wrapper, index) => (
							<li class="flex flex-wrap items-end gap-3 rounded-xl border border-petal-100 p-3">
								<div class="flex w-20 flex-col items-center gap-1 text-xs">
									<Show
										when={wrapper.image}
										fallback={
											<span class="flex size-16 items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-[10px] text-petal-900/45">
												No photo
											</span>
										}
									>
										<ZoomableImage
											src={wrapper.image}
											alt={`${wrapper.name} wrapper`}
											hoverPreview
											class="size-16 rounded-lg border border-black/10 object-cover"
										/>
									</Show>
									<span class="flex gap-2">
										<label
											class={cn(
												"cursor-pointer text-petal-700 py-2 underline-offset-2 hover:underline sm:py-0",
												uploadingFlower() === `wrapper:${wrapper.key}` &&
													"pointer-events-none opacity-60",
											)}
										>
											{uploadingFlower() === `wrapper:${wrapper.key}`
												? "Uploading…"
												: wrapper.image
													? "Replace"
													: "Add photo"}
											<input
												type="file"
												accept="image/png,image/jpeg,image/webp"
												class="sr-only"
												aria-label={`${wrapper.name || "Wrapper"} photo`}
												onChange={(e) => {
													void uploadWrapperPhoto(
														wrapper.key,
														e.currentTarget.files,
													);
													e.currentTarget.value = "";
												}}
											/>
										</label>
										<Show when={wrapper.image}>
											<button
												type="button"
												aria-label={`Remove ${wrapper.name} photo`}
												class="text-error-foreground"
												onClick={() =>
													setDraft("wrappers", index(), "image", "")
												}
											>
												✕
											</button>
										</Show>
									</span>
								</div>
								<Field label="Color">
									<input
										type="color"
										value={wrapper.colorHex}
										onInput={(e) =>
											setDraft(
												"wrappers",
												index(),
												"colorHex",
												e.currentTarget.value,
											)
										}
										class="h-10 w-12 cursor-pointer rounded-lg border border-petal-200 bg-white p-1"
									/>
								</Field>
								<Field label="Name" class="min-w-40 flex-1">
									<input
										value={wrapper.name}
										onInput={(e) =>
											setDraft(
												"wrappers",
												index(),
												"name",
												e.currentTarget.value,
											)
										}
										maxLength={40}
										required
										placeholder="e.g. Kraft brown"
										class={adminInput}
									/>
								</Field>
								<Field label="Price (₱)">
									<input
										type="number"
										min="0"
										step="1"
										inputMode="decimal"
										value={wrapper.price}
										onInput={(e) =>
											setDraft(
												"wrappers",
												index(),
												"price",
												e.currentTarget.value,
											)
										}
										class={cn(adminInput, "w-28 tabular-nums")}
									/>
								</Field>
								<Field label="In stock">
									<input
										type="number"
										min="0"
										step="1"
										inputMode="numeric"
										value={wrapper.stock}
										onInput={(e) =>
											setDraft(
												"wrappers",
												index(),
												"stock",
												e.currentTarget.value,
											)
										}
										placeholder="Not counted"
										aria-describedby="wrapper-stock-hint"
										class={cn(
											adminInput,
											"w-32 tabular-nums",
											wrapper.stock === "0" && "border-error-foreground",
										)}
									/>
								</Field>
								<div class="pb-2">
									<Toggle
										label="Offered"
										checked={wrapper.enabled}
										onChange={(checked) =>
											setDraft("wrappers", index(), "enabled", checked)
										}
									/>
								</div>
								<button
									type="button"
									class={cn(adminButton.ghost, "mb-1 text-error-foreground")}
									onClick={() =>
										setDraft("wrappers", (list) =>
											list.filter((_, i) => i !== index()),
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
				<div class="mx-auto flex max-w-4xl items-center justify-end gap-2">
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : "Save changes"}
					</button>
				</div>
			</div>
		</form>
	);
}
