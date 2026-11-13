import * as Dialog from "@kobalte/core/dialog";
import { createSignal, type JSX, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { cn } from "~/lib/utils";

const ZOOM = 2.5;

/**
 * Full-screen photo viewer. Click or tap the photo to zoom in where you
 * point; move the pointer (or drag) to look around; click again to zoom out.
 * Tap the dark backdrop, swipe the photo down, press Escape or use the close
 * button to put it away.
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
	const [drag, setDrag] = createSignal(0);

	const aim = (event: PointerEvent | MouseEvent) => {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = ((event.clientX - box.left) / box.width) * 100;
		const y = ((event.clientY - box.top) / box.height) * 100;
		setOrigin(
			`${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`,
		);
	};

	const close = () => {
		setZoomed(false);
		setDrag(0);
		props.onOpenChange(false);
	};

	// Swipe down on the (unzoomed) photo to dismiss it, as on a phone.
	let startY: number | undefined;
	let swiped = false;
	const onDown = (event: PointerEvent) => {
		swiped = false;
		startY =
			event.pointerType !== "mouse" && !zoomed() ? event.clientY : undefined;
	};
	const onMove = (event: PointerEvent) => {
		if (zoomed()) return aim(event);
		if (startY === undefined) return;
		const dy = Math.max(0, event.clientY - startY);
		if (dy > 8) swiped = true;
		setDrag(dy);
	};
	const onUp = () => {
		if (startY !== undefined && drag() > 90) close();
		else setDrag(0);
		startY = undefined;
	};

	return (
		<Dialog.Root
			open={props.open}
			onOpenChange={(open) => {
				if (!open) {
					setZoomed(false);
					setDrag(0);
				}
				props.onOpenChange(open);
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay
					class="fixed inset-0 z-[60] bg-black/85 transition-opacity"
					style={{ opacity: drag() ? Math.max(0.35, 1 - drag() / 400) : 1 }}
				/>
				<Dialog.Content
					class="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 p-4 outline-none"
					// The dark space around the photo is the backdrop: tap it to close.
					onClick={(event: MouseEvent) => {
						if (event.target === event.currentTarget) close();
					}}
				>
					<Dialog.Title class="sr-only">{props.alt}</Dialog.Title>
					<Dialog.CloseButton
						class="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex size-12 items-center justify-center rounded-full bg-white/95 text-black shadow-[0_4px_16px_rgb(0_0_0/0.35)] outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
						aria-label="Close photo"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							class="size-6"
						>
							<path d="M6 6l12 12M18 6 6 18" />
						</svg>
					</Dialog.CloseButton>
					<button
						type="button"
						aria-label={zoomed() ? "Zoom out" : "Zoom in"}
						onPointerDown={onDown}
						onPointerMove={onMove}
						onPointerUp={onUp}
						onPointerCancel={onUp}
						onClick={(event) => {
							if (swiped) return;
							aim(event);
							setZoomed((z) => !z);
						}}
						class={cn(
							"max-h-[85vh] max-w-[92vw] touch-none overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white",
							zoomed() ? "cursor-zoom-out" : "cursor-zoom-in",
							!drag() && "transition-transform duration-200",
						)}
						style={{
							transform: drag()
								? `translateY(${drag()}px) scale(${1 - Math.min(drag(), 300) / 1500})`
								: "none",
						}}
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
					<p class="pointer-events-none text-center text-sm text-white/80">
						{props.caption ? `${props.caption} · ` : ""}
						<span class="pointer-coarse:hidden">
							{zoomed()
								? "Move to look around · click to zoom out"
								: "Click the photo to zoom in · Esc to close"}
						</span>
						<span class="hidden pointer-coarse:inline">
							{zoomed()
								? "Drag to look around · tap to zoom out"
								: "Tap to zoom · swipe down or tap outside to close"}
						</span>
					</p>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

const PREVIEW = 288;

/**
 * A larger copy of a photo beside whatever the mouse is pointing at:
 * spread `on(src)` onto the element and render `<Preview />` once.
 */
export function createHoverPreview() {
	const [preview, setPreview] = createSignal<{
		src: string;
		x: number;
		y: number;
	} | null>(null);

	const show = (src: string, event: PointerEvent) => {
		if (event.pointerType !== "mouse") return;
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// Beside it, flipped to the left near the screen edge.
		const x =
			box.right + 12 + PREVIEW < window.innerWidth
				? box.right + 12
				: Math.max(8, box.left - 12 - PREVIEW);
		const y = Math.min(
			Math.max(8, box.top + box.height / 2 - PREVIEW / 2),
			window.innerHeight - PREVIEW - 8,
		);
		setPreview({ src, x, y });
	};
	const hide = () => setPreview(null);

	return {
		on: (src: string) => ({
			onPointerEnter: (event: PointerEvent) => show(src, event),
			onPointerLeave: hide,
		}),
		hide,
		Preview: () => (
			<Show when={preview()}>
				{(at) => (
					<Portal>
						<img
							src={at().src}
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
		),
	};
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
	const preview = createHoverPreview();

	return (
		<>
			<button
				type="button"
				aria-label={`Enlarge photo: ${props.alt}`}
				onClick={(event) => {
					// Inside a clickable row, a photo click shouldn't open the row too.
					event.stopPropagation();
					preview.hide();
					setOpen(true);
				}}
				onPointerEnter={(event) =>
					props.hoverPreview && preview.on(props.src).onPointerEnter(event)
				}
				onPointerLeave={preview.hide}
				class="block cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
			>
				<img src={props.src} alt={props.alt} class={props.class} />
				{props.children}
			</button>
			<preview.Preview />
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
