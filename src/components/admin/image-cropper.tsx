import * as Dialog from "@kobalte/core/dialog";
import { createSignal, type JSX, onCleanup, Show } from "solid-js";

import { adminButton } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

/** Longest side of a cropped photo; plenty for the shop, small enough to upload fast. */
const OUTPUT_MAX = 1600;
/** On-screen crop frame width, in CSS pixels. */
const FRAME = 320;

interface Pending {
	file: File;
	url: string;
	image: HTMLImageElement;
	aspect: number;
	title: string;
	resolve: (file: File | null) => void;
}

/**
 * Lets staff crop a photo on the site before it uploads: drag to position,
 * slide to zoom. `crop()` resolves with the cropped file, the original
 * ("Use without cropping"), or null if they cancel. Render `element` once.
 */
export function createCropper(): {
	crop: (
		file: File,
		options?: { aspect?: number; title?: string },
	) => Promise<File | null>;
	element: () => JSX.Element;
} {
	const [pending, setPending] = createSignal<Pending | null>(null);
	// Scale of the image inside the frame, and its top-left offset in frame pixels.
	const [scale, setScale] = createSignal(1);
	const [offset, setOffset] = createSignal({ x: 0, y: 0 });
	let drag: { x: number; y: number; ox: number; oy: number } | null = null;

	const frameHeight = () => FRAME / (pending()?.aspect ?? 1);
	/** Smallest scale that still covers the whole frame. */
	const minScale = () => {
		const p = pending();
		if (!p) return 1;
		return Math.max(
			FRAME / p.image.naturalWidth,
			frameHeight() / p.image.naturalHeight,
		);
	};
	const clamp = (x: number, y: number, s = scale()) => {
		const p = pending();
		if (!p) return { x, y };
		const w = p.image.naturalWidth * s;
		const h = p.image.naturalHeight * s;
		return {
			x: Math.min(0, Math.max(FRAME - w, x)),
			y: Math.min(0, Math.max(frameHeight() - h, y)),
		};
	};

	const finish = (file: File | null) => {
		const p = pending();
		if (!p) return;
		URL.revokeObjectURL(p.url);
		setPending(null);
		p.resolve(file);
	};

	const exportCrop = async () => {
		const p = pending();
		if (!p) return;
		const s = scale();
		const { x, y } = offset();
		// The crop in the photo's own pixels.
		const sx = -x / s;
		const sy = -y / s;
		const sw = FRAME / s;
		const sh = frameHeight() / s;
		const outW = Math.round(Math.min(OUTPUT_MAX, sw));
		const outH = Math.round(outW / p.aspect);
		const canvas = document.createElement("canvas");
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext("2d");
		if (!ctx) return finish(p.file);
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(p.image, sx, sy, sw, sh, 0, 0, outW, outH);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", 0.9),
		);
		if (!blob) return finish(p.file);
		const name = p.file.name.replace(/\.[^.]+$/, "") || "photo";
		finish(new File([blob], `${name}-cropped.jpg`, { type: "image/jpeg" }));
	};

	const crop = (
		file: File,
		options: { aspect?: number; title?: string } = {},
	) =>
		new Promise<File | null>((resolve) => {
			const url = URL.createObjectURL(file);
			const image = new Image();
			image.onload = () => {
				setPending({
					file,
					url,
					image,
					aspect: options.aspect ?? 1,
					title: options.title ?? "Crop photo",
					resolve,
				});
				const s = minScale();
				setScale(s);
				// Start centred.
				setOffset(
					clamp(
						(FRAME - image.naturalWidth * s) / 2,
						(frameHeight() - image.naturalHeight * s) / 2,
						s,
					),
				);
			};
			// Not something the browser can show (e.g. HEIC): upload it as is.
			image.onerror = () => {
				URL.revokeObjectURL(url);
				resolve(file);
			};
			image.src = url;
		});

	const zoomTo = (next: number) => {
		const s = scale();
		const { x, y } = offset();
		// Zoom around the frame's centre.
		const cx = FRAME / 2;
		const cy = frameHeight() / 2;
		const nx = cx - ((cx - x) / s) * next;
		const ny = cy - ((cy - y) / s) * next;
		setScale(next);
		setOffset(clamp(nx, ny, next));
	};

	onCleanup(() => {
		const p = pending();
		if (p) URL.revokeObjectURL(p.url);
	});

	const element = () => (
		<Dialog.Root
			open={!!pending()}
			onOpenChange={(open) => {
				if (!open) finish(null);
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/50" />
				<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
					<Dialog.Content class="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-5 text-petal-900 shadow-xl outline-none">
						<Dialog.Title class="text-lg font-semibold">
							{pending()?.title}
						</Dialog.Title>
						<Dialog.Description class="-mt-3 text-sm text-petal-900/60">
							Drag to position, use the slider to zoom.
						</Dialog.Description>
						<Show when={pending()}>
							{(p) => (
								<>
									<div
										class="relative mx-auto touch-none overflow-hidden rounded-xl bg-petal-50 select-none"
										style={{
											width: `${FRAME}px`,
											height: `${frameHeight()}px`,
											cursor: "grab",
										}}
										onPointerDown={(e) => {
											e.currentTarget.setPointerCapture(e.pointerId);
											drag = {
												x: e.clientX,
												y: e.clientY,
												ox: offset().x,
												oy: offset().y,
											};
										}}
										onPointerMove={(e) => {
											if (!drag) return;
											setOffset(
												clamp(
													drag.ox + e.clientX - drag.x,
													drag.oy + e.clientY - drag.y,
												),
											);
										}}
										onPointerUp={() => {
											drag = null;
										}}
										onWheel={(e) => {
											e.preventDefault();
											zoomTo(
												Math.min(
													minScale() * 4,
													Math.max(
														minScale(),
														scale() * (e.deltaY < 0 ? 1.08 : 0.92),
													),
												),
											);
										}}
									>
										<img
											src={p().url}
											alt=""
											draggable={false}
											class="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
											style={{
												width: `${p().image.naturalWidth}px`,
												height: `${p().image.naturalHeight}px`,
												transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()})`,
											}}
										/>
										{/* Rule-of-thirds guide. */}
										<div
											aria-hidden="true"
											class="pointer-events-none absolute inset-0 border-2 border-white/80 [background-image:linear-gradient(to_right,transparent_33%,rgb(255_255_255/0.35)_33%,rgb(255_255_255/0.35)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/0.35)_66%,rgb(255_255_255/0.35)_calc(66%+1px),transparent_calc(66%+1px)),linear-gradient(to_bottom,transparent_33%,rgb(255_255_255/0.35)_33%,rgb(255_255_255/0.35)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/0.35)_66%,rgb(255_255_255/0.35)_calc(66%+1px),transparent_calc(66%+1px))]"
										/>
									</div>
									<label class="flex items-center gap-3 text-sm">
										<span aria-hidden="true">−</span>
										<input
											type="range"
											min={minScale()}
											max={minScale() * 4}
											step={minScale() / 100}
											value={scale()}
											onInput={(e) => zoomTo(Number(e.currentTarget.value))}
											aria-label="Zoom"
											class="flex-1 accent-petal-700"
										/>
										<span aria-hidden="true">+</span>
									</label>
								</>
							)}
						</Show>
						<div class="flex flex-wrap justify-end gap-2">
							<button
								type="button"
								class={adminButton.ghost}
								onClick={() => finish(null)}
							>
								Cancel
							</button>
							<button
								type="button"
								class={adminButton.secondary}
								onClick={() => finish(pending()?.file ?? null)}
							>
								Use without cropping
							</button>
							<button
								type="button"
								class={cn(adminButton.primary)}
								onClick={exportCrop}
							>
								Use photo
							</button>
						</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog.Root>
	);

	return { crop, element };
}
