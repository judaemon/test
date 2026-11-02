import * as Dialog from "@kobalte/core/dialog";
import { useRouter } from "@tanstack/solid-router";
import { createSignal, For, onCleanup, Show } from "solid-js";

import {
	adminButton,
	Toggle,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import type { CustomWrapper } from "~/lib/custom-bouquet";
import { formatPrice } from "~/lib/product";
import { cn } from "~/lib/utils";
import {
	FALLBACK_WRAPPER_COLOR,
	prepareWrapperPhoto,
	readWrapperWorkbook,
	type WrapperImportPlan,
	type WrapperImportRow,
} from "~/lib/wrapper-import";
import { uploadProductImage } from "~/server/admin/catalog";
import { importWrapperFn } from "~/server/admin/wrappers";

/** Reads the stock workbook, shows what it will do, then saves row by row. */
export function WrapperImport(props: { wrappers: CustomWrapper[] }) {
	const router = useRouter();
	const [reading, setReading] = createSignal(false);
	const [plan, setPlan] = createSignal<WrapperImportPlan | null>(null);
	const [offer, setOffer] = createSignal(false);
	const [running, setRunning] = createSignal(false);
	const [done, setDone] = createSignal(0);

	const previews = new Map<WrapperImportRow, string>();
	const clearPreviews = () => {
		for (const url of previews.values()) URL.revokeObjectURL(url);
		previews.clear();
	};
	onCleanup(clearPreviews);
	const preview = (row: WrapperImportRow) => {
		if (!row.image) return undefined;
		const url = previews.get(row) ?? URL.createObjectURL(row.image);
		previews.set(row, url);
		return url;
	};

	const existing = (code: string) =>
		props.wrappers.find((wrapper) => wrapper.code === code);
	const overwrites = () =>
		plan()?.rows.filter((row) => existing(row.code)).length ?? 0;

	const choose = async (file: File | undefined) => {
		if (!file) return;
		setReading(true);
		try {
			setDone(0);
			setPlan(await readWrapperWorkbook(file));
		} catch (error) {
			toastError(error);
		} finally {
			setReading(false);
		}
	};

	const close = () => {
		if (running()) return;
		setPlan(null);
		clearPreviews();
	};

	const importRow = async (row: WrapperImportRow) => {
		const current = existing(row.code);
		let image = current?.image ?? "";
		let colorHex = current?.colorHex ?? FALLBACK_WRAPPER_COLOR;
		if (row.image) {
			const photo = await prepareWrapperPhoto(row.image, row.code);
			const body = new FormData();
			body.set("file", photo.file);
			const uploaded = await uploadProductImage({ data: body });
			if (!uploaded.ok) throw new Error(uploaded.message);
			image = uploaded.url;
			colorHex = photo.colorHex;
		}
		await importWrapperFn({
			data: {
				wrapper: {
					code: row.code,
					name: row.code,
					colorHex,
					price: row.price,
					stock: row.stock,
					stockActual: row.stockActual,
					enabled: offer(),
					image,
				},
			},
		});
	};

	const run = async () => {
		const rows = plan()?.rows ?? [];
		setRunning(true);
		setDone(0);
		try {
			// One at a time: stopping part-way loses nothing, and importing the
			// file again overwrites what's already in.
			for (const row of rows) {
				await importRow(row);
				setDone((count) => count + 1);
			}
			toastSuccess(`Imported ${rows.length} wrappers.`);
			setRunning(false);
			close();
		} catch (error) {
			toastError(error);
		} finally {
			setRunning(false);
			await router.invalidate();
		}
	};

	return (
		<>
			<label
				class={cn(
					adminButton.secondary,
					"cursor-pointer",
					reading() && "pointer-events-none opacity-50",
				)}
			>
				{reading() ? "Reading file…" : "Import from Excel"}
				<input
					type="file"
					accept=".xlsx"
					class="sr-only"
					onChange={(e) => {
						void choose(e.currentTarget.files?.[0]);
						e.currentTarget.value = "";
					}}
				/>
			</label>
			<Dialog.Root
				open={!!plan()}
				onOpenChange={(open) => !open && close()}
				modal
			>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/40" />
					<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
						<Dialog.Content class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white text-petal-900 shadow-xl outline-none sm:rounded-2xl">
							<div class="border-b border-petal-100 px-5 py-4">
								<Dialog.Title class="text-lg font-semibold">
									Import wrappers
								</Dialog.Title>
								<Dialog.Description class="text-sm text-petal-900/60">
									{plan()?.rows.length} wrappers:{" "}
									{(plan()?.rows.length ?? 0) - overwrites()} new,{" "}
									{overwrites()} overwritten by code. Left out: {plan()?.hidden}{" "}
									hidden, {plan()?.noPrice} with no price.
									<Show when={plan()?.repeats}>
										{" "}
										{plan()?.repeats} repeated rows replaced by the last row
										with the same code.
									</Show>
								</Dialog.Description>
							</div>
							<div class="overflow-auto">
								<table class="w-full text-left text-sm">
									<thead class="sticky top-0 bg-white text-xs uppercase tracking-wide text-petal-900/55">
										<tr>
											<th class="px-5 py-2 font-medium">Code</th>
											<th class="px-2 py-2 text-right font-medium sm:px-3">
												Price
											</th>
											<th class="px-2 py-2 text-right font-medium sm:px-3">
												Actual
											</th>
											<th class="px-2 py-2 text-right font-medium whitespace-nowrap sm:px-3">
												On hand
											</th>
											<th class="hidden px-5 py-2 font-medium sm:table-cell">
												Result
											</th>
										</tr>
									</thead>
									<tbody>
										<For each={plan()?.rows}>
											{(row) => (
												<tr class="border-t border-petal-50">
													<td class="py-1.5 pl-5 pr-2">
														<span class="flex items-center gap-2 font-medium">
															<Show when={preview(row)}>
																{(src) => (
																	<img
																		src={src()}
																		alt=""
																		loading="lazy"
																		class="size-8 rounded border border-black/10 object-cover"
																	/>
																)}
															</Show>
															{row.code}
														</span>
														<span class="ml-10 block text-xs text-petal-900/60 sm:hidden">
															{existing(row.code) ? "Overwrite" : "New"}
														</span>
													</td>
													<td class="px-2 py-1.5 text-right tabular-nums sm:px-3">
														{formatPrice(row.price, "PHP")}
													</td>
													<td class="px-2 py-1.5 text-right tabular-nums sm:px-3">
														{row.stockActual ?? "—"}
													</td>
													<td class="px-2 py-1.5 text-right tabular-nums sm:px-3">
														{row.stock}
													</td>
													<td class="hidden px-5 py-1.5 text-xs text-petal-900/60 sm:table-cell">
														{existing(row.code) ? "Overwrite" : "New"}
													</td>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
							<div class="flex flex-wrap items-center gap-3 border-t border-petal-100 px-5 py-3">
								<Toggle
									label="Offer new wrappers in the bouquet builder"
									checked={offer()}
									onChange={setOffer}
									disabled={running()}
								/>
								<div class="ml-auto flex items-center gap-2">
									<button
										type="button"
										disabled={running()}
										onClick={close}
										class={adminButton.secondary}
									>
										Cancel
									</button>
									<button
										type="button"
										disabled={running() || !plan()?.rows.length}
										onClick={() => void run()}
										class={adminButton.primary}
									>
										{running()
											? `Importing ${done()} of ${plan()?.rows.length}…`
											: "Import"}
									</button>
								</div>
							</div>
						</Dialog.Content>
					</div>
				</Dialog.Portal>
			</Dialog.Root>
		</>
	);
}
