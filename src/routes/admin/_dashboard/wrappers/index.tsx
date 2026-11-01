import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	PageHeader,
	Toggle,
	toastError,
} from "~/components/admin/ui";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import type { CustomWrapper } from "~/lib/custom-bouquet";
import { formatPrice, LOW_STOCK_THRESHOLD } from "~/lib/product";
import { cn } from "~/lib/utils";
import {
	listWrappersAdmin,
	setWrapperEnabledFn,
} from "~/server/admin/wrappers";

export const Route = createFileRoute("/admin/_dashboard/wrappers/")({
	loader: () => listWrappersAdmin(),
	component: WrappersPage,
});

function WrappersPage() {
	const wrappers = Route.useLoaderData();
	const router = useRouter();

	const setEnabled = async (wrapper: CustomWrapper, enabled: boolean) => {
		try {
			await setWrapperEnabledFn({ data: { id: wrapper.id, enabled } });
		} catch (error) {
			toastError(error);
		}
		await router.invalidate();
	};

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Wrappers"
				description="Shoppers pick one for each bouquet they build. A price of 0 shows as “Free”."
				actions={
					<Link
						to="/admin/wrappers/$wrapperId"
						params={{ wrapperId: "new" }}
						class={adminButton.primary}
					>
						+ Add wrapper
					</Link>
				}
			/>
			<section class={adminCard}>
				<Show
					when={wrappers().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">None yet.</p>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={wrappers()}>
							{(wrapper) => (
								<li class="flex flex-wrap items-center gap-4 px-5 py-4">
									<Show
										when={wrapper.image}
										fallback={
											<span
												aria-hidden="true"
												class="size-14 shrink-0 rounded-lg border border-black/10"
												style={{ background: wrapper.colorHex }}
											/>
										}
									>
										{(src) => (
											<ZoomableImage
												src={src()}
												alt={`${wrapper.name} wrapper`}
												hoverPreview
												class="size-14 shrink-0 rounded-lg border border-black/10 object-cover"
											/>
										)}
									</Show>
									<div class="min-w-0 flex-1 basis-48">
										<Link
											to="/admin/wrappers/$wrapperId"
											params={{ wrapperId: wrapper.id }}
											class="font-medium underline-offset-2 hover:underline"
										>
											{wrapper.name}
										</Link>
										<p class="flex items-center gap-1.5 text-sm text-petal-900/65 tabular-nums">
											<span
												aria-hidden="true"
												class="size-3 rounded-full border border-black/15"
												style={{ background: wrapper.colorHex }}
											/>
											{wrapper.price === 0
												? "Free"
												: formatPrice(wrapper.price, "PHP")}{" "}
											·{" "}
											<span
												class={cn(
													wrapper.stock === 0 && "text-error-foreground",
													wrapper.stock !== undefined &&
														wrapper.stock > 0 &&
														wrapper.stock <= LOW_STOCK_THRESHOLD &&
														"text-warning-foreground",
												)}
											>
												{wrapper.stock === undefined
													? "Stock not counted"
													: wrapper.stock === 0
														? "Sold out"
														: `${wrapper.stock} left`}
											</span>
										</p>
									</div>
									<div class="flex items-center gap-3">
										<Toggle
											label="Offered"
											checked={wrapper.enabled}
											onChange={(checked) => void setEnabled(wrapper, checked)}
										/>
										<Link
											to="/admin/wrappers/$wrapperId"
											params={{ wrapperId: wrapper.id }}
											class={adminButton.secondary}
										>
											Edit
										</Link>
									</div>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>
		</div>
	);
}
