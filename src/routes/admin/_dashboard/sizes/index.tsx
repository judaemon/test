import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	PageHeader,
	toastError,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { listSizesAdmin, moveSizeFn } from "~/server/admin/sizes";

export const Route = createFileRoute("/admin/_dashboard/sizes/")({
	loader: () => listSizesAdmin(),
	component: SizesPage,
});

function SizesPage() {
	const sizes = Route.useLoaderData();
	const router = useRouter();
	const [moving, setMoving] = createSignal(false);

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
				description="The sizes a signature bouquet can have, smallest first. The shop shows them side by side as the size guide, and shoppers can filter bouquets by size."
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
			<section class={adminCard}>
				<Show
					when={sizes().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">None yet.</p>
					}
				>
					<ol class="divide-y divide-petal-50">
						<For each={sizes()}>
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
												? `${size.usedIn} signature ${size.usedIn === 1 ? "bouquet" : "bouquets"}`
												: "No bouquets yet"}
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
											disabled={index() === sizes().length - 1 || moving()}
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
		</div>
	);
}
