import * as Dialog from "@kobalte/core/dialog";
import { createSignal, type JSX, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { cn } from "~/lib/utils";

const ZOOM = 2.5;

/**
 * Full-screen photo viewer. Click or tap the photo to zoom in where you
 * point; move the pointer (or drag) to look around; click again to zoom out.
 */
export function Lightbox(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	src: string;
	alt: string;
	caption?: string;
}) {
	const [zoomed, setZoomed] = createSignal(false);
	const [origin, setOrigin] = createSignal("50% 50%");

	const aim = (event: PointerEvent | MouseEvent) => {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = ((event.clientX - box.left) / box.width) * 100;
		const y = ((event.clientY - box.top) / box.height) * 100;
		setOrigin(
			`${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`,
		);
	};

	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(open) => {
				if (!open) setZoomed(false);
				props.onOpenChange(open);
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-[60] bg-black/85" />
				<Dialog.Content class="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 p-4 outline-none">
					<Dialog.Title class="sr-only">{props.alt}</Dialog.Title>
					<Dialog.CloseButton
						class="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-xl text-black shadow outline-none focus-visible:ring-2 focus-visible:ring-white"
						aria-label="Close"
					>
						✕
					</Dialog.CloseButton>
					<button
						type="button"
						aria-label={zoomed() ? "Zoom out" : "Zoom in"}
						onClick={(event) => {
							aim(event);
							setZoomed((z) => !z);
						}}
						onPointerMove={(event) => zoomed() && aim(event)}
						class={cn(
							"max-h-[85vh] max-w-[92vw] touch-none overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white",
							zoomed() ? "cursor-zoom-out" : "cursor-zoom-in",
						)}
					>
						<img
							src={props.src}
							alt={props.alt}
							draggable={false}
							class="block max-h-[85vh] max-w-[92vw] object-contain transition-transform duration-200 select-none"
							style={{
								transform: zoomed() ? `scale(${ZOOM})` : "none",
								"transform-origin": origin(),
							}}
						/>
					</button>
					<p class="text-center text-sm text-white/80">
						{props.caption ? `${props.caption} · ` : ""}
						{zoomed()
							? "Move to look around · click to zoom out"
							: "Click the photo to zoom in"}
					</p>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/**
 * A thumbnail that opens full size in the Lightbox when clicked. With
 * `hoverPreview`, pointing at it also shows a larger preview beside it.
 */
export function ZoomableImage(props: {
	src: string;
	alt: string;
	/** Classes for the thumbnail image. */
	class?: string;
	hoverPreview?: boolean;
	caption?: string;
	children?: JSX.Element;
}) {
	const [open, setOpen] = createSignal(false);
	const [preview, setPreview] = createSignal<{ x: number; y: number } | null>(
		null,
	);
	const PREVIEW = 288;

	const showPreview = (event: PointerEvent) => {
		if (!props.hoverPreview || event.pointerType !== "mouse") return;
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// Beside the thumbnail, flipped to the left near the screen edge.
		const x =
			box.right + 12 + PREVIEW < window.innerWidth
				? box.right + 12
				: Math.max(8, box.left - 12 - PREVIEW);
		const y = Math.min(
			Math.max(8, box.top + box.height / 2 - PREVIEW / 2),
			window.innerHeight - PREVIEW - 8,
		);
		setPreview({ x, y });
	};

	return (
		<>
			<button
				type="button"
				aria-label={`Enlarge photo: ${props.alt}`}
				onClick={(event) => {
					// Inside a clickable row, a photo click shouldn't open the row too.
					event.stopPropagation();
					setPreview(null);
					setOpen(true);
				}}
				onPointerEnter={showPreview}
				onPointerLeave={() => setPreview(null)}
				class="block cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
			>
				<img src={props.src} alt={props.alt} class={props.class} />
				{props.children}
			</button>
			<Show when={preview()}>
				{(at) => (
					<Portal>
						<img
							src={props.src}
							alt=""
							aria-hidden="true"
							class="pointer-events-none fixed z-[55] rounded-xl border border-black/10 bg-white object-cover shadow-2xl"
							style={{
								left: `${at().x}px`,
								top: `${at().y}px`,
								width: `${PREVIEW}px`,
								height: `${PREVIEW}px`,
							}}
						/>
					</Portal>
				)}
			</Show>
			<Lightbox
				open={open()}
				onOpenChange={setOpen}
				src={props.src}
				alt={props.alt}
				caption={props.caption}
			/>
		</>
	);
}
