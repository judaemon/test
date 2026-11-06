import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	PageHeader,
	toastError,
} from "~/components/admin/ui";
import { formatPrice } from "~/lib/product";
import { useArrangementTypes } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { listSizesAdmin, moveSizeFn } from "~/server/admin/sizes";

export const Route = createFileRoute("/admin/_dashboard/sizes/")({
	loader: () => listSizesAdmin(),
	component: SizesPage,
});

function SizesPage() {
	const sizes = Route.useLoaderData();
	const arrangementTypes = useArrangementTypes();
	const router = useRouter();
	const [moving, setMoving] = createSignal(false);
	/** One section per type, in the shop's order; sizes of an unknown type last. */
	const groups = () => {
		const types = arrangementTypes();
		const known = new Set(types.map((type) => type.id));
		const orphans = sizes().filter((size) => !known.has(size.arrangement));
		return [
			...types.map((type) => ({
				id: type.id as string | undefined,
				name: type.name,
				sizes: sizes().filter((size) => size.arrangement === type.id),
			})),
			...(orphans.length
				? [{ id: undefined, name: "No type", sizes: orphans }]
				: []),
		];
	};

	const move = async (id: string, direction: -1 | 1) => {
		if (moving()) return;
		setMoving(true);
		try {
			await moveSizeFn({ data: { id, direction: String(direction) } });
			// The shop's size guide reads the order too.
			await router.invalidate();
		} catch (error) {
			toastError(error);
		} finally {
			setMoving(false);
		}
	};

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Sizes"
				description="Sizes for each arrangement type, smallest first. An arrangement can only have a size for its type. The shop shows a type’s sizes side by side as its size guide, and shoppers can filter by size. Sizes with a builder price can be picked in Build your bouquet."
				actions={
					<Link
						to="/admin/sizes/$sizeId"
						params={{ sizeId: "new" }}
						class={adminButton.primary}
					>
						+ Add size
					</Link>
				}
			/>
			<div class="flex flex-col gap-6">
				<For each={groups()}>
					{(entry) => {
						const group = () => entry.sizes;
						return (
							<section class={adminCard}>
								<header class="flex flex-wrap items-center justify-between gap-2 border-b border-petal-50 px-5 py-3">
									<div>
										<h2 class="font-semibold">{entry.name}</h2>
										<p class="text-xs text-petal-900/55">
											{entry.sizes.length
												? "Smallest first: this is the size guide for this type."
												: "No sizes yet, so these arrangements don’t show one."}
										</p>
									</div>
									<Show when={entry.id}>
										{(typeId) => (
											<Link
												to="/admin/sizes/$sizeId"
												params={{ sizeId: "new" }}
												search={{ type: typeId() }}
												class={adminButton.secondary}
											>
												+ Add {entry.name.toLowerCase()} size
											</Link>
										)}
									</Show>
								</header>
								<Show when={entry.sizes.length > 0}>
									<ol class="divide-y divide-petal-50">
										<For each={entry.sizes}>
											{(size, index) => (
												<li class="flex flex-wrap items-center gap-4 px-5 py-4">
													<Show
														when={size.image}
														fallback={
															<span class="flex h-20 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-[10px] text-petal-900/45" />
														}
													>
														<img
															src={size.image}
															alt=""
															class="h-20 w-9 shrink-0 rounded-lg border border-black/10 bg-[#fdf9ea] object-contain"
														/>
													</Show>
													<div class="min-w-0 flex-1 basis-48">
														<Link
															to="/admin/sizes/$sizeId"
															params={{ sizeId: size.id }}
															class="font-medium underline-offset-2 hover:underline"
														>
															{size.name}
														</Link>
														<p class="text-sm text-petal-900/65">
															{size.description || "No description"}
														</p>
														<p class="text-xs text-petal-900/50">
															{size.usedIn
																? `${size.usedIn} ${size.usedIn === 1 ? "arrangement" : "arrangements"}`
																: "No arrangements yet"}
															{" · "}
															{size.price === undefined
																? "Not in the builder"
																: `Builder ${size.price > 0 ? `+${formatPrice(size.price, "PHP")}` : "free"}`}
														</p>
													</div>
													<div class="flex items-center gap-1">
														<button
															type="button"
															class={adminButton.ghost}
															disabled={index() === 0 || moving()}
															aria-label={`Move ${size.name} smaller`}
															onClick={() => move(size.id, -1)}
														>
															↑
														</button>
														<button
															type="button"
															class={adminButton.ghost}
															disabled={
																index() === group().length - 1 || moving()
															}
															aria-label={`Move ${size.name} larger`}
															onClick={() => move(size.id, 1)}
														>
															↓
														</button>
														<Link
															to="/admin/sizes/$sizeId"
															params={{ sizeId: size.id }}
															class={cn(adminButton.secondary, "ml-2")}
														>
															Edit
														</Link>
													</div>
												</li>
											)}
										</For>
									</ol>
								</Show>
							</section>
						);
					}}
				</For>
			</div>
		</div>
	);
}
