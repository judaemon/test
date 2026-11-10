import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { adminButton, adminCard, PageHeader } from "~/components/admin/ui";
import { listFloristsAdmin } from "~/server/admin/florists";

export const Route = createFileRoute("/admin/_dashboard/florists/")({
	loader: {
		handler: () => listFloristsAdmin(),
		staleReloadMode: "blocking",
	},
	component: FloristsPage,
});

const plural = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;

function FloristsPage() {
	const florists = Route.useLoaderData();

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Florists"
				description="The florists who make the bouquets. Give them bouquets in Orders (tick the rows, then “Give to florist”). Each florist has a sheet of their bouquets to print, with photos, flowers and the customer’s details."
				actions={
					<Link
						to="/admin/florists/$floristId"
						params={{ floristId: "new" }}
						class={adminButton.primary}
					>
						+ Add florist
					</Link>
				}
			/>
			<Show when={florists().length > 0}>
				<p class="mb-3 text-sm text-petal-900/65">
					<Link
						to="/admin/orders"
						search={{ florist: "none" }}
						class="font-medium text-petal-700 underline underline-offset-2"
					>
						See bouquets not given to a florist yet
					</Link>
				</p>
			</Show>
			<section class={adminCard}>
				<Show
					when={florists().length > 0}
					fallback={
						<div class="px-5 py-8 text-center">
							<p class="font-medium">No florists yet.</p>
							<p class="mt-1 text-sm text-petal-900/60">
								Add the florists you give bouquets to, then assign them bouquets
								from Orders.
							</p>
						</div>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={florists()}>
							{(florist) => (
								<li class="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
									<div class="min-w-0 flex-1 basis-56">
										<p class="flex flex-wrap items-center gap-2">
											<Link
												to="/admin/florists/$floristId"
												params={{ floristId: florist.id }}
												class="font-medium underline-offset-2 hover:underline"
											>
												{florist.name}
											</Link>
											<Show when={!florist.active}>
												<span class="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-petal-900/70">
													Off
												</span>
											</Show>
										</p>
										<p class="text-sm text-petal-900/65">
											{[florist.phone, florist.email]
												.filter(Boolean)
												.join(" · ") || "No contact details"}
										</p>
									</div>
									<Link
										to="/admin/orders"
										search={{ florist: florist.id }}
										class="text-sm tabular-nums text-petal-700 underline-offset-2 hover:underline"
									>
										<strong class="font-semibold">
											{plural(florist.toMake, "bouquet", "bouquets")}
										</strong>{" "}
										to make
										<Show when={florist.done}>
											<span class="text-petal-900/55">
												{" "}
												· {florist.done} done
											</span>
										</Show>
									</Link>
									<div class="flex items-center gap-2">
										<Link
											to="/admin/florists/$floristId/bouquets"
											params={{ floristId: florist.id }}
											class={adminButton.primary}
										>
											Bouquet sheet
										</Link>
										<Link
											to="/admin/florists/$floristId"
											params={{ floristId: florist.id }}
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
