import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { adminButton } from "~/components/admin/ui";
import { FloristSheet } from "~/components/florist/florist-sheet";
import { cn } from "~/lib/utils";
import { getFloristWorkAdmin } from "~/server/admin/florists";

export const Route = createFileRoute(
	"/admin/_dashboard/florists/$floristId_/bouquets",
)({
	validateSearch: (search: Record<string, unknown>): { done?: boolean } => ({
		done: [true, 1, "1"].includes(search.done as never) || undefined,
	}),
	loaderDeps: ({ search }) => ({ done: !!search.done }),
	loader: async ({ params, deps }) => {
		const work = await getFloristWorkAdmin({
			data: { id: params.floristId, includeDone: deps.done },
		});
		if (!work) throw notFound();
		return work;
	},
	component: FloristBouquetsPage,
});

function FloristBouquetsPage() {
	const work = Route.useLoaderData();
	const search = Route.useSearch();
	const params = Route.useParams();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<div class="mx-auto max-w-6xl pb-16 print:max-w-none print:pb-0">
			<FloristSheet
				work={work()}
				staff
				includeDone={!!search().done}
				onIncludeDone={(on) =>
					void navigate({
						search: { done: on || undefined },
						replace: true,
						resetScroll: false,
					})
				}
				top={
					<Link
						to="/admin/florists"
						class={cn(adminButton.ghost, "-ml-2 mb-2")}
					>
						← Florists
					</Link>
				}
				actions={
					<>
						<Link
							to="/admin/orders"
							search={{ florist: params().floristId }}
							class={adminButton.secondary}
						>
							See in Orders
						</Link>
						<Link
							to="/admin/florists/$floristId"
							params={{ floristId: params().floristId }}
							class={adminButton.secondary}
						>
							Edit · private link
						</Link>
					</>
				}
			/>
		</div>
	);
}
