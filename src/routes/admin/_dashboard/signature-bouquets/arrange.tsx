import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import {
	closestCenter,
	createSortable,
	DragDropProvider,
	DragDropSensors,
	type DragEventHandler,
	DragOverlay,
	maybeTransformStyle,
	SortableProvider,
} from "@thisbeyond/solid-dnd";
import { createSignal, For, Show } from "solid-js";
import {
	adminButton,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { listInventory, reorderProductsFn } from "~/server/admin/catalog";
import type { AdminProduct } from "~/types/product";

export const Route = createFileRoute(
	"/admin/_dashboard/signature-bouquets/arrange",
)({
	loader: ({ abortController }) =>
		listInventory({ signal: abortController.signal }),
	component: ArrangePage,
});

/** The photo the shop's card leads with. */
const coverPhoto = (product: AdminProduct) =>
	(product.variants.find((variant) => variant.inStock) ?? product.variants[0])
		?.images[0];

/** A list with one item taken out of `from` and put back at `to`. */
function moved(list: string[], from: number, to: number) {
	const next = [...list];
	next.splice(to, 0, ...next.splice(from, 1));
	return next;
}

/**
 * Puts the bouquets in the order the shop shows them. Nothing changes for
 * shoppers until Save, so they never see a half-finished arrangement.
 */
function ArrangePage() {
	const loaded = Route.useLoaderData();
	const navigate = useNavigate();
	const saved = loaded().map((product) => product.id);
	const byId = new Map(loaded().map((product) => [product.id, product]));
	const [order, setOrder] = createSignal(saved);
	const [saving, setSaving] = createSignal(false);
	const [announcement, setAnnouncement] = createSignal("");
	const changed = () => order().some((id, index) => id !== saved[index]);

	const onDragEnd: DragEventHandler = ({ draggable, droppable }) => {
		if (!droppable) return;
		const from = order().indexOf(String(draggable.id));
		const to = order().indexOf(String(droppable.id));
		if (from !== to) setOrder(moved(order(), from, to));
	};

	/** For the buttons, which keyboards and phones can use instead of dragging. */
	const moveTo = (id: string, to: number) => {
		const from = order().indexOf(id);
		if (to < 0 || to >= order().length || to === from) return;
		setOrder(moved(order(), from, to));
		setAnnouncement(`${byId.get(id)?.title} moved to position ${to + 1}.`);
	};

	const save = async () => {
		setSaving(true);
		try {
			await reorderProductsFn({ data: { ids: order() } });
			toastSuccess("Shop order saved.");
			await navigate({ to: "/admin/signature-bouquets" });
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			{/* Stays in view on wider screens, so Save is there from any row. */}
			<div class="flow-root lg:sticky lg:top-0 lg:z-10 lg:-mx-8 lg:-mt-8 lg:bg-cream lg:px-8 lg:pt-8">
				<PageHeader
					title="Arrange shop order"
					description="Drag a bouquet by its handle, or use the arrows. Shoppers see the new order once you save."
					actions={
						<>
							<Link
								to="/admin/signature-bouquets"
								class={adminButton.secondary}
							>
								Cancel
							</Link>
							<button
								type="button"
								class={adminButton.primary}
								disabled={!changed() || saving()}
								onClick={save}
							>
								{saving() ? "Saving…" : "Save order"}
							</button>
						</>
					}
				/>
			</div>
			<p class="sr-only" aria-live="polite">
				{announcement()}
			</p>
			<DragDropProvider onDragEnd={onDragEnd} collisionDetector={closestCenter}>
				<DragDropSensors />
				{/* The same columns as the shop, so rows break where shoppers see them. */}
				<ul class="grid grid-cols-3 gap-x-3 gap-y-5 sm:gap-x-5 lg:grid-cols-5">
					<SortableProvider ids={order()}>
						<For each={order()}>
							{(id, index) => (
								<Show when={byId.get(id)}>
									{(product) => (
										<ArrangeCard
											product={product()}
											position={index() + 1}
											onMove={(to) => moveTo(id, to)}
										/>
									)}
								</Show>
							)}
						</For>
					</SortableProvider>
				</ul>
				<DragOverlay>
					{(draggable) => (
						<img
							src={coverPhoto(byId.get(String(draggable?.id)) as AdminProduct)}
							alt=""
							class="size-28 rounded-2xl object-cover shadow-lg"
						/>
					)}
				</DragOverlay>
			</DragDropProvider>
		</div>
	);
}

function ArrangeCard(props: {
	product: AdminProduct;
	/** Counting from 1. */
	position: number;
	/** Takes the place to move to, counting from 0. */
	onMove: (to: number) => void;
}) {
	const sortable = createSortable(props.product.id);
	/** Moving a card can drop keyboard focus, so its button takes it back. */
	const move = (event: MouseEvent, to: number) => {
		const button = event.currentTarget as HTMLButtonElement;
		props.onMove(to);
		button.focus();
	};
	const arrow = cn(adminButton.ghost, "px-2");

	return (
		<li
			ref={sortable.ref}
			style={maybeTransformStyle(sortable.transform)}
			class={cn(sortable.isActiveDraggable && "opacity-30")}
		>
			<div class="relative aspect-square overflow-hidden rounded-2xl bg-petal-50">
				<img
					src={coverPhoto(props.product)}
					alt=""
					draggable={false}
					class={cn(
						"size-full object-cover",
						!props.product.isVisible && "opacity-50",
					)}
				/>
				<span class="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold tabular-nums">
					{props.position}
				</span>
				{/* Only the handle starts a drag; the photo has to scroll on phones. */}
				<span
					{...sortable.dragActivators}
					aria-hidden="true"
					title="Drag to move"
					class="absolute right-1.5 top-1.5 flex size-9 cursor-grab touch-none select-none items-center justify-center rounded-full bg-white/90 text-lg leading-none active:cursor-grabbing"
				>
					⠿
				</span>
				<Show when={!props.product.isVisible}>
					<span class="absolute bottom-1.5 left-1.5 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
						Hidden
					</span>
				</Show>
			</div>
			<p class="mt-1.5 truncate text-center font-semibold">
				{props.product.title}
			</p>
			<div class="flex justify-center">
				<button
					type="button"
					class={arrow}
					title="Move to the start"
					aria-label={`Move ${props.product.title} to the start`}
					onClick={(event) => move(event, 0)}
				>
					⇤
				</button>
				<button
					type="button"
					class={arrow}
					title="Move earlier"
					aria-label={`Move ${props.product.title} earlier`}
					onClick={(event) => move(event, props.position - 2)}
				>
					←
				</button>
				<button
					type="button"
					class={arrow}
					title="Move later"
					aria-label={`Move ${props.product.title} later`}
					onClick={(event) => move(event, props.position)}
				>
					→
				</button>
			</div>
		</li>
	);
}
