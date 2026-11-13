import { createFileRoute } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import {
	createOrderList,
	drill,
	OrderList,
	ReportHeading,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/admin/_dashboard/reports/bouquets")({
	component: BouquetsReport,
});

function BouquetsReport() {
	const report = useReport();
	const money = useMoney();
	const list = createOrderList();
	const show = list.show;
	const showBouquets = () =>
		list.showSections(
			"Orders by bouquet",
			report().byBouquet.map((row) => ({
				heading: `${row.code} · ${row.name}`,
				group: row,
			})),
		);

	return (
		<>
			<section
				class={cn(adminCard, "overflow-x-auto p-5 print:overflow-visible")}
				aria-labelledby="by-bouquet"
			>
				<ReportHeading
					id="by-bouquet"
					title="Orders by bouquet"
					onOpen={showBouquets}
				/>
				<Show
					when={report().byBouquet.length > 0}
					fallback={<p class="text-sm text-petal-900/60">No orders yet.</p>}
				>
					<table class="w-full min-w-[560px] text-left text-sm print:min-w-0">
						<thead class="text-xs uppercase tracking-wide text-petal-900/55">
							<tr>
								<th class="pb-2 pr-3 text-right font-medium">
									<span class="sr-only">Count</span>#
								</th>
								<th class="pb-2 pr-4 font-medium">Bouquet</th>
								<th class="pb-2 pr-4 text-right font-medium">Orders</th>
								<th class="pb-2 pr-4 text-right font-medium">Bouquets</th>
								<th class="pb-2 text-right font-medium">Sales</th>
							</tr>
						</thead>
						<tbody>
							<For each={report().byBouquet}>
								{(row, i) => (
									<tr
										class="cursor-pointer border-t border-petal-100 transition-colors hover:bg-petal-50"
										onClick={(event) => {
											if ((event.target as HTMLElement).closest("button"))
												return;
											show(`Bouquet: ${row.code}`, row);
										}}
									>
										<td class="py-2.5 pr-3 text-right text-xs tabular-nums text-petal-900/55 print:text-black/70">
											{i() + 1}
										</td>
										<th scope="row" class="py-2.5 pr-4 font-normal">
											<span class="flex items-center gap-3">
												<Show when={row.image}>
													{(src) => (
														<ZoomableImage
															src={src()}
															alt={row.name}
															caption={row.code}
															hoverPreview
															class="size-11 rounded-lg border border-black/10 object-cover"
														/>
													)}
												</Show>
												<button
													type="button"
													onClick={() => show(`Bouquet: ${row.code}`, row)}
													class={cn(drill, "px-1")}
												>
													<span class="block font-semibold">{row.code}</span>
													<span class="text-xs text-petal-900/60">
														{row.name}
													</span>
												</button>
											</span>
										</th>
										<td class="py-2.5 pr-4 text-right tabular-nums">
											{row.orders}
										</td>
										<td class="py-2.5 pr-4 text-right font-semibold tabular-nums">
											{row.quantity}
										</td>
										<td class="py-2.5 text-right tabular-nums">
											{money(row.sales)}
										</td>
									</tr>
								)}
							</For>
						</tbody>
						<tfoot>
							<tr class="border-t-2 border-petal-200 font-semibold">
								<td />
								<th scope="row" class="py-3 pr-4 font-semibold">
									Total
								</th>
								<td class="py-3 pr-4 text-right tabular-nums">
									{report().active.orders}
								</td>
								<td class="py-3 pr-4 text-right tabular-nums">
									{report().byBouquet.reduce(
										(sum, row) => sum + row.quantity,
										0,
									)}
								</td>
								<td class="py-3 text-right tabular-nums">
									{money(
										report().byBouquet.reduce((sum, row) => sum + row.sales, 0),
									)}
								</td>
							</tr>
						</tfoot>
					</table>
				</Show>
			</section>

			<OrderList list={list} />
		</>
	);
}
