import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { adminButton, adminCard, PageHeader } from "~/components/admin/ui";
import { listSuppliersAdmin } from "~/server/admin/suppliers";

export const Route = createFileRoute("/admin/_dashboard/suppliers/")({
	// Stepped back to after a save, wait for the fresh rows rather than
	// showing the old ones first and swapping them in.
	loader: {
		handler: () => listSuppliersAdmin(),
		staleReloadMode: "blocking",
	},
	component: SuppliersPage,
});

function SuppliersPage() {
	const suppliers = Route.useLoaderData();

	return (
		<div class="mx-auto max-w-4xl">
			<PageHeader
				title="Suppliers"
				description="Who the shop buys wrappers from. Pick a wrapper’s supplier on the wrapper, then filter Wrappers by supplier."
				actions={
					<Link
						to="/admin/suppliers/$supplierId"
						params={{ supplierId: "new" }}
						class={adminButton.primary}
					>
						+ Add supplier
					</Link>
				}
			/>
			<section class={adminCard}>
				<Show
					when={suppliers().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">None yet.</p>
					}
				>
					<ul class="divide-y divide-petal-50">
						<For each={suppliers()}>
							{(supplier) => (
								<li class="flex flex-wrap items-center gap-4 px-5 py-4">
									<div class="min-w-0 flex-1 basis-48">
										<Link
											to="/admin/suppliers/$supplierId"
											params={{ supplierId: supplier.id }}
											class="font-medium underline-offset-2 hover:underline"
										>
											{supplier.name}
										</Link>
										<p class="text-sm text-petal-900/65">
											{[supplier.contactName, supplier.phone, supplier.email]
												.filter(Boolean)
												.join(" · ") || "No contact details"}
										</p>
									</div>
									<div class="flex items-center gap-3">
										<Show
											when={supplier.wrapperCount > 0}
											fallback={
												<span class="text-sm text-petal-900/50">
													No wrappers yet
												</span>
											}
										>
											<Link
												to="/admin/wrappers"
												search={{ supplier: supplier.id }}
												class="text-sm text-petal-700 underline-offset-2 hover:underline"
											>
												{supplier.wrapperCount}{" "}
												{supplier.wrapperCount === 1 ? "wrapper" : "wrappers"}
											</Link>
										</Show>
										<Link
											to="/admin/suppliers/$supplierId"
											params={{ supplierId: supplier.id }}
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
