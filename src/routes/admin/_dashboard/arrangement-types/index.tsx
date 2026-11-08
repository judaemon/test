import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	PageHeader,
	toastError,
} from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import {
	listArrangementTypesAdmin,
	moveArrangementTypeFn,
} from "~/server/admin/arrangement-types";

export const Route = createFileRoute("/admin/_dashboard/arrangement-types/")({
	// Stepped back to after a save, wait for the fresh rows rather than
	// showing the old ones first and swapping them in.
	loader: {
		handler: () => listArrangementTypesAdmin(),
		staleReloadMode: "blocking",
	},
	component: ArrangementTypesPage,
});

const count = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;

function ArrangementTypesPage() {
	const types = Route.useLoaderData();
	const router = useRouter();
	const [moving, setMoving] = createSignal(false);

	const move = async (id: string, direction: -1 | 1) => {
		if (moving()) return;
		setMoving(true);
		try {
			await moveArrangementTypeFn({
				data: { id, direction: String(direction) },
			});
			// The shop's tabs read the order too.
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
				title="Arrangement types"
				description="The kinds of floral arrangement the shop sells, like bouquets, corsages and boutonnières. Each one is a tab in the shop, in this order; the first is shown by default. Give a type sizes in Sizes."
				actions={
					<Link
						to="/admin/arrangement-types/$typeId"
						params={{ typeId: "new" }}
						class={adminButton.primary}
					>
						+ Add type
					</Link>
				}
			/>
			<section class={adminCard}>
				<Show
					when={types().length > 0}
					fallback={
						<p class="px-5 py-4 text-sm text-petal-900/55">None yet.</p>
					}
				>
					<ol class="divide-y divide-petal-50">
						<For each={types()}>
							{(type, index) => (
								<li class="flex flex-wrap items-center gap-4 px-5 py-4">
									<div class="min-w-0 flex-1 basis-48">
										<Link
											to="/admin/arrangement-types/$typeId"
											params={{ typeId: type.id }}
											class="font-medium underline-offset-2 hover:underline"
										>
											{type.name}
										</Link>
										<span class="text-sm text-petal-900/55">
											{" "}
											· shop tab “{type.pluralName}”
										</span>
										<p class="text-sm text-petal-900/65">
											{type.description || "No description"}
										</p>
										<p class="text-xs text-petal-900/50">
											{type.usedIn
												? count(type.usedIn, "arrangement", "arrangements")
												: "No arrangements yet"}
											{" · "}
											{type.sizeCount
												? count(type.sizeCount, "size", "sizes")
												: "No sizes"}
										</p>
									</div>
									<div class="flex items-center gap-1">
										<button
											type="button"
											class={adminButton.ghost}
											disabled={index() === 0 || moving()}
											aria-label={`Move ${type.name} earlier`}
											onClick={() => move(type.id, -1)}
										>
											↑
										</button>
										<button
											type="button"
											class={adminButton.ghost}
											disabled={index() === types().length - 1 || moving()}
											aria-label={`Move ${type.name} later`}
											onClick={() => move(type.id, 1)}
										>
											↓
										</button>
										<Link
											to="/admin/arrangement-types/$typeId"
											params={{ typeId: type.id }}
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
