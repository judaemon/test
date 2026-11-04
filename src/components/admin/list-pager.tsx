import { For, Show } from "solid-js";

import { adminInput } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

const PAGE_BUTTON =
	"inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-petal-900 transition-colors outline-none hover:bg-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500 disabled:pointer-events-none disabled:opacity-40";

/** Page numbers to offer: the ends, and a couple either side of this one. */
function pageList(page: number, count: number) {
	const pages: (number | "…")[] = [];
	for (let n = 1; n <= count; n++) {
		if (n === 1 || n === count || Math.abs(n - page) <= 1) pages.push(n);
		else if (pages.at(-1) !== "…") pages.push("…");
	}
	return pages;
}

/** A list's footer: rows per page, and the pages to step through. */
export function ListPager(props: {
	page: number;
	pageCount: number;
	pageSize: number;
	pageSizes: readonly number[];
	onPage: (page: number) => void;
	onPageSize: (size: number) => void;
}) {
	return (
		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-petal-100 px-4 py-3 text-sm text-petal-900/65">
			<label class="flex items-center gap-2">
				Rows per page
				<select
					value={props.pageSize}
					onChange={(e) => props.onPageSize(Number(e.currentTarget.value))}
					class={cn(adminInput, "h-9 w-auto py-0 pr-8 sm:h-9")}
				>
					<For each={props.pageSizes}>
						{(size) => <option value={size}>{size}</option>}
					</For>
				</select>
			</label>
			<Show when={props.pageCount > 1}>
				<nav aria-label="Pages" class="flex items-center gap-1">
					<button
						type="button"
						disabled={props.page <= 1}
						onClick={() => props.onPage(props.page - 1)}
						class={PAGE_BUTTON}
					>
						<span aria-hidden="true">←</span> Previous
					</button>
					<For each={pageList(props.page, props.pageCount)}>
						{(page) => (
							<Show
								when={typeof page === "number" && page}
								fallback={
									<span aria-hidden="true" class="px-1">
										…
									</span>
								}
							>
								{(n) => (
									<button
										type="button"
										onClick={() => props.onPage(n())}
										aria-current={n() === props.page ? "page" : undefined}
										aria-label={`Page ${n()}`}
										class={cn(
											PAGE_BUTTON,
											"hidden min-w-9 justify-center tabular-nums sm:inline-flex",
											n() === props.page &&
												"bg-petal-700 font-medium text-white hover:bg-petal-700",
										)}
									>
										{n()}
									</button>
								)}
							</Show>
						)}
					</For>
					<span class="px-2 tabular-nums sm:hidden">
						{props.page} / {props.pageCount}
					</span>
					<button
						type="button"
						disabled={props.page >= props.pageCount}
						onClick={() => props.onPage(props.page + 1)}
						class={PAGE_BUTTON}
					>
						Next <span aria-hidden="true">→</span>
					</button>
				</nav>
			</Show>
		</div>
	);
}
