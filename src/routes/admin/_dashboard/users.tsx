import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";

import { adminCard, adminInput, PageHeader } from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { listShopUsers } from "~/server/admin/users";

export const Route = createFileRoute("/admin/_dashboard/users")({
	loader: () => listShopUsers(),
	head: () => ({ meta: [{ title: "Users · ORAIA Admin" }] }),
	component: UsersPage,
});

const day = (at: string) =>
	new Date(at).toLocaleDateString("en-PH", {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
		year: "numeric",
	});

/** Everyone who made an account on the shop, newest first. */
function UsersPage() {
	const users = Route.useLoaderData();
	const [query, setQuery] = createSignal("");
	const shown = () => {
		const q = query().trim().toLowerCase();
		return q
			? users().filter(
					(user) =>
						user.name.toLowerCase().includes(q) ||
						user.email.toLowerCase().includes(q),
				)
			: users();
	};
	const withOrders = () => users().filter((user) => user.orders > 0).length;

	return (
		<div class="mx-auto max-w-4xl pb-16">
			<PageHeader
				title="Users"
				description="People who made an account on the shop. Staff accounts are on Staff."
			/>

			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<p class="text-sm tabular-nums text-petal-900/65">
					{users().length} {users().length === 1 ? "account" : "accounts"} ·{" "}
					{withOrders()} ordered while signed in
				</p>
				<label class="w-full sm:w-72">
					<span class="sr-only">Search users</span>
					<input
						type="search"
						class={adminInput}
						placeholder="Search name or email"
						value={query()}
						onInput={(e) => setQuery(e.currentTarget.value)}
					/>
				</label>
			</div>

			<Show
				when={users().length > 0}
				fallback={
					<section class={cn(adminCard, "px-6 py-12 text-center")}>
						<h2 class="font-semibold">No accounts yet</h2>
						<p class="mx-auto mt-1 max-w-md text-sm text-petal-900/65">
							They appear here as people sign up on the shop.
						</p>
					</section>
				}
			>
				<section class={cn(adminCard, "overflow-hidden")}>
					<div
						aria-hidden="true"
						class="hidden grid-cols-[minmax(0,1fr)_8rem_9rem] gap-4 border-b border-petal-100 bg-petal-50/60 px-5 py-2.5 text-xs font-medium text-petal-900/60 sm:grid"
					>
						<span>Name</span>
						<span>Joined</span>
						<span class="text-end">Orders</span>
					</div>
					<Show
						when={shown().length}
						fallback={
							<p class="px-5 py-10 text-center text-sm text-petal-900/60">
								No one matches “{query().trim()}”.
							</p>
						}
					>
						<ul class="divide-y divide-petal-100">
							<For each={shown()}>
								{(user) => (
									<li class="grid gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem] sm:items-center">
										<div class="min-w-0">
											<p class="truncate font-medium">{user.name || "—"}</p>
											<p class="truncate text-sm text-petal-900/65">
												{user.email}
											</p>
										</div>
										<p class="text-sm tabular-nums text-petal-900/75">
											<span class="sm:hidden">Joined </span>
											{day(user.createdAt)}
										</p>
										<p class="text-sm tabular-nums text-petal-900/75 sm:text-end">
											<Show
												when={user.orders}
												fallback={<span class="text-petal-900/45">None</span>}
											>
												{user.orders} {user.orders === 1 ? "order" : "orders"}
												<Show when={user.lastOrderAt}>
													{(at) => (
														<span class="block whitespace-nowrap text-xs text-petal-900/50">
															Last {day(at())}
														</span>
													)}
												</Show>
											</Show>
										</p>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</section>
			</Show>
		</div>
	);
}
