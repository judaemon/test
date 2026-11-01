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
import type { FlowerColor, FlowerRecord } from "~/lib/custom-bouquet";
import { formatPrice, LOW_STOCK_THRESHOLD } from "~/lib/product";
import { cn } from "~/lib/utils";
import { listFlowersAdmin, setFlowerEnabledFn } from "~/server/admin/flowers";

export const Route = createFileRoute("/admin/_dashboard/flowers/")({
	loader: () => listFlowersAdmin(),
	component: FlowersPage,
});

function stockLabel(color: FlowerColor) {
	if (color.stock === undefined) return "Not counted";
	if (color.stock === 0) return "Sold out";
	return `${color.stock} left`;
}

function FlowersPage() {
	const flowers = Route.useLoaderData();
	const router = useRouter();

	const setEnabled = async (flower: FlowerRecord, enabled: boolean) => {
		try {
			await setFlowerEnabledFn({ data: { id: flower.id, enabled } });
		} catch (error) {
			toastError(error);
		}
		await router.invalidate();
	};

	const FlowerItem = (props: { flower: FlowerRecord }) => (
		<li class="flex flex-wrap items-start gap-4 px-5 py-4">
			<Show
				when={props.flower.image}
				fallback={
					<span class="flex size-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-petal-200 text-[10px] text-petal-900/45">
						No photo
					</span>
				}
			>
				{(src) => (
					<ZoomableImage
						src={src()}
						alt={props.flower.name}
						hoverPreview
						class="size-14 shrink-0 rounded-lg border border-black/10 object-cover"
					/>
				)}
			</Show>
			<div class="min-w-0 flex-1 basis-56">
				<Link
					to="/admin/flowers/$flowerId"
					params={{ flowerId: props.flower.id }}
					class="font-medium underline-offset-2 hover:underline"
				>
					{props.flower.name}
				</Link>
				<span
					class={cn(
						"ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
						props.flower.enabled
							? "bg-sage-100 text-sage-600"
							: "bg-petal-50 text-petal-900/50",
					)}
				>
					{props.flower.enabled ? "Custom bouquets" : "Recipes only"}
				</span>
				<Show when={props.flower.kind.hint}>
					<p class="text-xs text-petal-900/55">{props.flower.kind.hint}</p>
				</Show>
				<ul class="mt-2 flex flex-wrap gap-1.5">
					<For each={props.flower.colors}>
						{(color) => (
							<li
								class={cn(
									"rounded-full border px-2.5 py-0.5 text-xs tabular-nums",
									!color.enabled
										? "border-petal-100 text-petal-900/40 line-through"
										: color.stock === 0
											? "border-error-foreground/30 bg-error text-error-foreground"
											: color.stock !== undefined &&
													color.stock <= LOW_STOCK_THRESHOLD
												? "border-warning-foreground/30 bg-warning text-warning-foreground"
												: "border-petal-200",
								)}
							>
								<Show when={props.flower.kind.colors}>
									<span class="font-medium">{color.name}</span> ·{" "}
								</Show>
								{formatPrice(color.price, "PHP")} · {stockLabel(color)}
							</li>
						)}
					</For>
				</ul>
				<Show when={props.flower.usedIn > 0}>
					<p class="mt-1.5 text-xs text-petal-900/55">
						In {props.flower.usedIn} signature bouquet{" "}
						{props.flower.usedIn === 1 ? "style" : "styles"}
					</p>
				</Show>
			</div>
			<div class="flex items-center gap-3">
				<Toggle
					label="Use in custom bouquets"
					checked={props.flower.enabled}
					onChange={(checked) => void setEnabled(props.flower, checked)}
				/>
				<Link
					to="/admin/flowers/$flowerId"
					params={{ flowerId: props.flower.id }}
					class={adminButton.secondary}
				>
					Edit
				</Link>
			</div>
		</li>
	);

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Flowers"
				description="Every flower the shop uses, with its colors, prices and stock. Flowers marked for custom bouquets can be picked in the bouquet builder; signature bouquet recipes can use any of them."
				actions={
					<Link
						to="/admin/flowers/$flowerId"
						params={{ flowerId: "new" }}
						class={adminButton.primary}
					>
						+ Add flower
					</Link>
				}
			/>
			<section class={adminCard}>
				<Show
					when={flowers().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">None yet.</p>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={flowers()}>
							{(flower) => <FlowerItem flower={flower} />}
						</For>
					</ul>
				</Show>
			</section>
		</div>
	);
}
