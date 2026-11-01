import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
	useNavigate,
} from "@tanstack/solid-router";
import { createEffect, For, on, Show } from "solid-js";

import { AdminIcons } from "~/components/admin/ui";
import { FlowerMark } from "~/components/site/brand";
import { authClient } from "~/lib/auth-client";
import { getAdminSession } from "~/server/admin/settings";

export const Route = createFileRoute("/admin/_dashboard")({
	beforeLoad: async ({ location }) => {
		const user = await getAdminSession();
		if (!user) {
			throw redirect({
				to: "/admin/login",
				search: { redirect: location.href },
			});
		}
		return { user };
	},
	head: () => ({
		meta: [{ title: "ORAIA Admin" }, { name: "robots", content: "noindex" }],
	}),
	component: AdminLayout,
});

const NAV = [
	{ to: "/admin/orders", label: "Orders", icon: AdminIcons.orders },
	{
		to: "/admin/products",
		label: "Signature bouquets",
		icon: AdminIcons.products,
	},
	{ to: "/admin/flowers", label: "Flowers", icon: AdminIcons.flowers },
	{ to: "/admin/wrappers", label: "Wrappers", icon: AdminIcons.wrappers },
	{ to: "/admin/custom", label: "Custom bouquets", icon: AdminIcons.custom },
	{ to: "/admin/reports", label: "Reports", icon: AdminIcons.reports },
	{
		to: "/admin/payments",
		label: "Payments",
		icon: AdminIcons.payments,
		owner: true,
	},
	{ to: "/admin/staff", label: "Staff", icon: AdminIcons.staff, owner: true },
] as const;

const navLink =
	"flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-petal-900/75 lg:py-2 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

function AdminLayout() {
	const context = Route.useRouteContext();
	const navigate = useNavigate();
	const user = () => context().user;
	const items = () =>
		NAV.filter((item) => !("owner" in item) || user().role === "owner");

	// On phones the tabs scroll sideways; keep the current page's tab in view.
	const location = useLocation();
	let nav: HTMLElement | undefined;
	createEffect(
		on(
			() => location().pathname,
			() =>
				requestAnimationFrame(() =>
					nav
						?.querySelector('[data-status="active"]')
						?.scrollIntoView({ block: "nearest", inline: "center" }),
				),
		),
	);

	const signOut = async () => {
		await authClient.signOut();
		await navigate({ to: "/admin/login" });
	};

	return (
		<div class="min-h-screen bg-cream text-petal-900 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] print:block print:bg-white">
			<aside class="sticky top-0 z-20 border-b border-petal-100 bg-white/90 backdrop-blur lg:h-screen lg:border-b-0 lg:border-r print:hidden">
				<div class="flex h-full flex-col gap-1 px-3 py-3 lg:py-5">
					<div class="flex items-center justify-between gap-2 px-2 lg:mb-5">
						<Link
							to="/admin"
							class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							<FlowerMark class="size-7" />
							<span class="font-display type-soft text-lg font-semibold tracking-[0.2em] text-black">
								ORAIA
							</span>
							<span class="rounded-full bg-petal-100 px-2 py-0.5 text-[11px] font-medium text-petal-700">
								Admin
							</span>
						</Link>
						<button
							type="button"
							onClick={signOut}
							class="rounded-full p-2.5 text-petal-900/60 hover:bg-petal-100 hover:text-petal-900 lg:hidden"
							aria-label="Sign out"
						>
							<AdminIcons.logout class="size-5" />
						</button>
					</div>
					<nav
						ref={nav}
						aria-label="Admin"
						class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
					>
						<For each={items()}>
							{(item) => (
								<Link
									to={item.to}
									activeOptions={{ exact: "exact" in item }}
									activeProps={{
										class: "bg-petal-100 font-medium text-petal-900",
									}}
									class={navLink}
								>
									<item.icon class="size-5" />
									{item.label}
								</Link>
							)}
						</For>
					</nav>
					<div class="mt-auto hidden flex-col gap-1 border-t border-petal-100 pt-4 lg:flex">
						<a href="/" target="_blank" rel="noreferrer" class={navLink}>
							<AdminIcons.shop class="size-5" />
							View shop
						</a>
						<div class="px-3 py-2">
							<p class="truncate text-sm font-medium">{user().name}</p>
							<p class="truncate text-xs text-petal-900/55">
								{user().email} · {user().role === "owner" ? "Owner" : "Staff"}
							</p>
						</div>
						<button type="button" onClick={signOut} class={navLink}>
							<AdminIcons.logout class="size-5" />
							Sign out
						</button>
					</div>
				</div>
			</aside>
			<main class="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
				<Show when={user()}>
					<Outlet />
				</Show>
			</main>
		</div>
	);
}
