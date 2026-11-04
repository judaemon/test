import { createEffect, createSignal, For, on, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { Lightbox } from "~/components/zoom/zoomable-image";
import { photoSrc } from "~/lib/photos";
import { cn } from "~/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const SWIPE_THRESHOLD_PX = 40;

export interface GalleryPhoto {
	src: string;
	/** What the photo shows, e.g. "Top view". */
	label: string;
	/** A line staff wrote about the photo, shown under it. */
	caption?: string;
}

interface ProductGalleryProps {
	photos: GalleryPhoto[];
	/** Product + color description, used to build each image's alt text. */
	label: string;
	class?: string;
}

export function ProductGallery(props: ProductGalleryProps) {
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	let touchStartX: number | null = null;
	/** Where the magnifier is aimed (CSS transform-origin), while the mouse is over the photo. */
	const [lens, setLens] = createSignal<string | null>(null);
	const [viewing, setViewing] = createSignal(false);

	// A new variant brings a new image set; always open on its hero shot.
	createEffect(
		on(
			() => props.photos,
			() => setSelectedIndex(0),
			{ defer: true },
		),
	);

	const count = () => props.photos.length;
	const activeIndex = () => Math.min(selectedIndex(), count() - 1);
	const hasMultiple = () => count() > 1;
	const hasCaptions = () => props.photos.some((photo) => photo.caption);
	const altFor = (index: number) =>
		`${props.label}, ${props.photos[index]?.label ?? `image ${index + 1}`}`;

	const go = (delta: number) =>
		setSelectedIndex((activeIndex() + delta + count()) % count());

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			go(-1);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			go(1);
		}
	};

	const handleTouchStart = (event: TouchEvent) => {
		touchStartX = event.touches[0]?.clientX ?? null;
	};

	const handleTouchEnd = (event: TouchEvent) => {
		const endX = event.changedTouches[0]?.clientX;
		if (touchStartX === null || endX === undefined) return;
		const deltaX = endX - touchStartX;
		touchStartX = null;
		if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
		go(deltaX < 0 ? 1 : -1);
	};

	return (
		<div
			class={cn(
				"flex flex-col gap-3 lg:flex-row-reverse lg:items-start lg:justify-end",
				props.class,
			)}
		>
			<figure class="m-0 w-full lg:max-w-[calc(100svh-11rem)] lg:flex-1">
				<section
					aria-roledescription="carousel"
					aria-label={`${props.label} photos`}
					tabindex={hasMultiple() ? 0 : undefined}
					onKeyDown={handleKeyDown}
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
					// Magnifying glass: on a mouse, the photo enlarges under the pointer.
					onPointerMove={(event) => {
						if (event.pointerType !== "mouse") return;
						const box = event.currentTarget.getBoundingClientRect();
						setLens(
							`${((event.clientX - box.left) / box.width) * 100}% ${((event.clientY - box.top) / box.height) * 100}%`,
						);
					}}
					onPointerLeave={() => setLens(null)}
					onClick={(event) => {
						// The arrow buttons sit on top; only clicks on the photo open it.
						if ((event.target as HTMLElement).closest("button")) return;
						setViewing(true);
					}}
					class="group relative aspect-square w-full cursor-zoom-in touch-pan-y overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
				>
					<For each={props.photos}>
						{(photo, index) => (
							<img
								src={photoSrc(photo.src)}
								alt={index() === activeIndex() ? altFor(index()) : ""}
								aria-hidden={index() !== activeIndex()}
								width={800}
								height={800}
								loading={index() === 0 ? "eager" : "lazy"}
								decoding="async"
								draggable={false}
								class={cn(
									"absolute inset-0 size-full object-cover transition-[opacity,transform] duration-300 ease-out select-none",
									index() === activeIndex() ? "opacity-100" : "opacity-0",
								)}
								style={
									index() === activeIndex() && lens()
										? {
												transform: "scale(2)",
												"transform-origin": lens() as string,
											}
										: undefined
								}
							/>
						)}
					</For>

					<button
						type="button"
						onClick={() => setViewing(true)}
						class="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
					>
						<span aria-hidden="true">🔍</span> Zoom
					</button>
					<Show when={props.photos[activeIndex()]}>
						{(photo) => (
							<Lightbox
								open={viewing()}
								onOpenChange={setViewing}
								src={photoSrc(photo().src)}
								alt={altFor(activeIndex())}
								caption={[photo().label, photo().caption]
									.filter(Boolean)
									.join(" · ")}
							/>
						)}
					</Show>

					{/* Which view this is, so shoppers know what they're looking at. */}
					<Show when={props.photos[activeIndex()]}>
						{(photo) => (
							<span class="pointer-events-none absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold shadow-sm">
								{photo().label}
							</span>
						)}
					</Show>

					<Show when={hasMultiple()}>
						<Button
							variant="secondary"
							size="icon"
							tabindex={-1}
							aria-label="Previous image"
							onClick={() => go(-1)}
							class="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 shadow-sm backdrop-blur transition-opacity hover:bg-background lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100"
						>
							<ChevronLeftIcon />
						</Button>
						<Button
							variant="secondary"
							size="icon"
							tabindex={-1}
							aria-label="Next image"
							onClick={() => go(1)}
							class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 shadow-sm backdrop-blur transition-opacity hover:bg-background lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100"
						>
							<ChevronRightIcon />
						</Button>
						<p
							aria-live="polite"
							aria-atomic="true"
							class="absolute bottom-3 right-3 rounded-full bg-foreground/70 px-2.5 py-1 text-xs font-medium tabular-nums text-background"
						>
							<span class="sr-only">Image </span>
							{activeIndex() + 1}
							<span aria-hidden="true"> / </span>
							<span class="sr-only"> of </span>
							{count()}
						</p>
					</Show>
				</section>

				{/*
				 * Staff's captions, under the photo. Every caption sits in the same
				 * grid cell and cross-fades, so the space keeps the height of the
				 * longest one and the page doesn't jump between photos.
				 */}
				<Show when={hasCaptions()}>
					<figcaption class="mt-4 grid px-1">
						<For each={props.photos}>
							{(photo, index) => (
								<p
									aria-hidden={index() !== activeIndex()}
									class={cn(
										"col-start-1 row-start-1 flex items-baseline gap-3 font-display text-[0.95rem] italic leading-relaxed text-petal-900/80 transition-opacity duration-300 ease-out sm:text-base",
										index() === activeIndex() && photo.caption
											? "opacity-100"
											: "pointer-events-none opacity-0",
									)}
								>
									<Show when={photo.caption}>
										<span
											aria-hidden="true"
											class="h-px w-6 shrink-0 translate-y-[-0.3em] bg-petal-300"
										/>
										<span class="text-pretty">{photo.caption}</span>
									</Show>
								</p>
							)}
						</For>
					</figcaption>
				</Show>
			</figure>

			<Show when={hasMultiple()}>
				<ul
					aria-label="Choose an image"
					class="flex gap-2 overflow-x-auto pb-1 lg:max-h-[calc(100svh-11rem)] lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0"
				>
					<For each={props.photos}>
						{(photo, index) => (
							<li class="shrink-0">
								<button
									type="button"
									aria-label={`Show ${photo.label}`}
									title={photo.label}
									aria-current={index() === activeIndex() ? "true" : undefined}
									onClick={() => setSelectedIndex(index())}
									class={cn(
										"block size-16 overflow-hidden rounded-md border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:size-20",
										index() === activeIndex()
											? "border-foreground"
											: "border-transparent opacity-70 hover:opacity-100",
									)}
								>
									<img
										src={photoSrc(photo.src, "thumb")}
										alt=""
										width={80}
										height={80}
										loading="lazy"
										decoding="async"
										class="size-full object-cover"
									/>
								</button>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</div>
	);
}
