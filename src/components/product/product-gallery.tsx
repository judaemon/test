import { createEffect, createSignal, For, on, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const SWIPE_THRESHOLD_PX = 40;

interface ProductGalleryProps {
	images: string[];
	/** Product + color description, used to build each image's alt text. */
	label: string;
	class?: string;
}

export function ProductGallery(props: ProductGalleryProps) {
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	let touchStartX: number | null = null;

	// A new variant brings a new image set; always open on its hero shot.
	createEffect(
		on(
			() => props.images,
			() => setSelectedIndex(0),
			{ defer: true },
		),
	);

	const count = () => props.images.length;
	const activeIndex = () => Math.min(selectedIndex(), count() - 1);
	const hasMultiple = () => count() > 1;
	const altFor = (index: number) =>
		`${props.label}, image ${index + 1} of ${count()}`;

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
				"flex flex-col gap-3 lg:flex-row-reverse lg:items-start",
				props.class,
			)}
		>
			<section
				aria-roledescription="carousel"
				aria-label={`${props.label} photos`}
				tabindex={hasMultiple() ? 0 : undefined}
				onKeyDown={handleKeyDown}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
				class="group relative aspect-square w-full touch-pan-y overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:flex-1"
			>
				<For each={props.images}>
					{(src, index) => (
						<img
							src={src}
							alt={index() === activeIndex() ? altFor(index()) : ""}
							aria-hidden={index() !== activeIndex()}
							width={800}
							height={800}
							loading={index() === 0 ? "eager" : "lazy"}
							decoding="async"
							draggable={false}
							class={cn(
								"absolute inset-0 size-full object-cover transition-opacity duration-300 ease-out select-none",
								index() === activeIndex() ? "opacity-100" : "opacity-0",
							)}
						/>
					)}
				</For>

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

			<Show when={hasMultiple()}>
				<ul
					aria-label="Choose an image"
					class="flex gap-2 overflow-x-auto pb-1 lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0"
				>
					<For each={props.images}>
						{(src, index) => (
							<li class="shrink-0">
								<button
									type="button"
									aria-label={`Show image ${index() + 1} of ${count()}`}
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
										src={src}
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
