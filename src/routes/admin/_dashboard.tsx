import * as Dialog from "@kobalte/core/dialog";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
	useNavigate,
} from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, Show } from "solid-js";

import { AdminIcons } from "~/components/admin/ui";
import { FlowerMark, Wordmark } from "~/components/site/brand";
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
	{ to: "/admin/cards", label: "Cards", icon: AdminIcons.cards },
	{ to: "/admin/shop", label: "Shop", icon: AdminIcons.shop },
	{
		to: "/admin/signature-bouquets",
		label: "Floral arrangements",
		icon: AdminIcons.products,
	},
	{ to: "/admin/flowers", label: "Flowers", icon: AdminIcons.flowers },
	{ to: "/admin/wrappers", label: "Wrappers", icon: AdminIcons.wrappers },
	{ to: "/admin/suppliers", label: "Suppliers", icon: AdminIcons.suppliers },
	{ to: "/admin/florists", label: "Florists", icon: AdminIcons.florists },
	{
		to: "/admin/delivery-dates",
		label: "Delivery dates",
		icon: AdminIcons.calendar,
	},
	{
		to: "/admin/arrangement-types",
		label: "Arrangement types",
		icon: AdminIcons.types,
	},
	{ to: "/admin/sizes", label: "Sizes", icon: AdminIcons.sizes },
	{ to: "/admin/custom", label: "Custom bouquets", icon: AdminIcons.custom },
	{ to: "/admin/reports", label: "Reports", icon: AdminIcons.reports },
	{ to: "/admin/logs", label: "Logs", icon: AdminIcons.log },
	{
		to: "/admin/sales",
		label: "Sales",
		icon: AdminIcons.sale,
		owner: true,
	},
	{
		to: "/admin/payments",
		label: "Payments",
		icon: AdminIcons.payments,
		owner: true,
	},
	{ to: "/admin/staff", label: "Staff", icon: AdminIcons.staff, owner: true },
	{ to: "/admin/password", label: "My password", icon: AdminIcons.staff },
] as const;

const navLink =
	"flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-petal-900/75 lg:py-2 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

const iconButton =
	"flex size-11 shrink-0 items-center justify-center rounded-full text-petal-900/70 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

function MenuIcon(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			class={props.class}
		>
			<path d="M4 7h16M4 12h16M4 17h16" />
		</svg>
	);
}

function CloseIcon(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			class={props.class}
		>
			<path d="M6 6l12 12M18 6 6 18" />
		</svg>
	);
}

function Brand() {
	return (
		<Link
			to="/admin"
			class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
		>
			<FlowerMark class="size-7" />
			<Wordmark class="text-lg" />
			<span class="rounded-full bg-petal-100 px-2 py-0.5 text-[11px] font-medium text-petal-700">
				Admin
			</span>
		</Link>
	);
}

function AdminLayout() {
	const context = Route.useRouteContext();
	const navigate = useNavigate();
	const user = () => context().user;
	const items = () =>
		NAV.filter((item) => !("owner" in item) || user().role === "owner");

	const location = useLocation();
	const current = () =>
		items().find((item) => location().pathname.startsWith(item.to))?.label;

	// Below lg (phones, iPad upright) the nav lives in a drawer.
	const [menuOpen, setMenuOpen] = createSignal(false);
	createEffect(
		on(
			() => location().pathname,
			() => setMenuOpen(false),
		),
	);

	// Swipe the drawer back toward the edge to put it away.
	let swipeX: number | undefined;
	const swipeStart = (event: PointerEvent) => {
		swipeX = event.pointerType === "mouse" ? undefined : event.clientX;
	};
	const swipeEnd = (event: PointerEvent) => {
		if (swipeX !== undefined && swipeX - event.clientX > 60) setMenuOpen(false);
		swipeX = undefined;
	};

	const signOut = async () => {
		await authClient.signOut();
		await navigate({ to: "/admin/login" });
	};

	const NavList = () => (
		<nav aria-label="Admin" class="flex flex-col gap-1">
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
	);

	const Account = () => (
		<div class="flex flex-col gap-1 border-t border-petal-100 pt-4">
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
	);

	return (
		<div class="min-h-screen bg-cream text-petal-900 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] print:block print:bg-white">
			{/* Phones and iPad upright: a bar with the menu button. */}
			<header class="sticky top-0 z-20 flex items-center gap-1 border-b border-petal-100 bg-white/90 py-1.5 pr-3 pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur lg:hidden print:hidden">
				<button
					type="button"
					onClick={() => setMenuOpen(true)}
					class={iconButton}
					aria-label="Open menu"
					aria-expanded={menuOpen()}
				>
					<MenuIcon class="size-6" />
				</button>
				<Brand />
				<Show when={current()}>
					{(label) => (
						<span class="ml-auto truncate pl-3 text-sm font-medium text-petal-900/70">
							{label()}
						</span>
					)}
				</Show>
			</header>

			<Dialog.Root open={menuOpen()} onOpenChange={setMenuOpen}>
				<Dialog.Portal>
					<Dialog.Overlay class="admin-drawer-overlay fixed inset-0 z-50 bg-petal-900/40 lg:hidden" />
					<Dialog.Content
						class="admin-drawer fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-white shadow-[8px_0_32px_-12px_rgb(0_0_0/0.25)] outline-none lg:hidden"
						onPointerDown={swipeStart}
						onPointerUp={swipeEnd}
						onPointerCancel={() => (swipeX = undefined)}
					>
						<Dialog.Title class="sr-only">Admin menu</Dialog.Title>
						<div class="flex items-center justify-between gap-2 border-b border-petal-100 py-2 pr-2 pl-[max(1.25rem,env(safe-area-inset-left))]">
							<Brand />
							<Dialog.CloseButton class={iconButton} aria-label="Close menu">
								<CloseIcon class="size-6" />
							</Dialog.CloseButton>
						</div>
						<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
							<NavList />
							<Account />
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			{/* iPad sideways and desktop: the sidebar, scrolling on short screens. */}
			<aside class="sticky top-0 hidden h-dvh flex-col border-r border-petal-100 bg-white/90 backdrop-blur lg:flex print:hidden">
				<div class="px-5 pt-5 pb-4">
					<Brand />
				</div>
				<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-4">
					<NavList />
					<div class="mt-auto">
						<Account />
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
