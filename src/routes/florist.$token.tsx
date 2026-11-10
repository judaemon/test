import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { Show } from "solid-js";

import { FloristSheet } from "~/components/florist/florist-sheet";
import { getFloristWorkByToken } from "~/server/florist-public";

/**
 * A florist's own page, from the private link staff send them (Admin →
 * Florists): their bouquets to make, to read on a phone or print. No sign-in;
 * a link that was turned off or replaced shows nothing.
 */
export const Route = createFileRoute("/florist/$token")({
	validateSearch: (search: Record<string, unknown>): { done?: boolean } => ({
		done: [true, 1, "1"].includes(search.done as never) || undefined,
	}),
	loaderDeps: ({ search }) => ({ done: !!search.done }),
	loader: ({ params, deps }) =>
		getFloristWorkByToken({
			data: { token: params.token, includeDone: deps.done },
		}),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.florist.name} · Bouquets to make · ORAIA`
					: "Link not working · ORAIA",
			},
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	component: FloristPage,
});

function FloristPage() {
	const work = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<main class="min-h-screen bg-cream px-4 py-6 text-petal-900 sm:px-6 lg:px-8 print:bg-white print:p-0">
			<div class="mx-auto max-w-6xl print:max-w-none">
				<Show
					when={work()}
					fallback={
						<div class="mx-auto max-w-md py-20 text-center">
							<p class="font-display text-2xl font-semibold">
								This link isn’t working
							</p>
							<p class="mt-2 text-sm text-petal-900/65">
								It may have been turned off or replaced. Ask ORAIA for your new
								link.
							</p>
						</div>
					}
				>
					{(data) => (
						<FloristSheet
							work={data()}
							includeDone={!!search().done}
							onIncludeDone={(on) =>
								void navigate({
									search: { done: on || undefined },
									replace: true,
									resetScroll: false,
								})
							}
							top={
								<p class="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-petal-700">
									ORAIA
								</p>
							}
						/>
					)}
				</Show>
			</div>
		</main>
	);
}
