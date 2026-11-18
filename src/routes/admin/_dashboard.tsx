import * as Dialog from "@kobalte/core/dialog";
import * as DropdownMenu from "@kobalte/core/dropdown-menu";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
	useNavigate,
} from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import {
	createEffect,
	createSignal,
	createUniqueId,
	For,
	on,
	Show,
} from "solid-js";

import { AdminIcons, Avatar, RoleBadge } from "~/components/admin/ui";
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

type NavItem = {
	to: string;
	label: string;
	icon: (props: { class?: string }) => JSX.Element;
	owner?: boolean;
};

/** The sidebar, grouped the way the work happens: orders first, setup last. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
	{
		label: "Orders",
		items: [
			{ to: "/admin/orders", label: "Orders", icon: AdminIcons.orders },
			{ to: "/admin/cards", label: "Cards", icon: AdminIcons.cards },
			{
				to: "/admin/printer",
				label: "Order printer",
				icon: AdminIcons.printer,
			},
		],
	},
	{
		label: "Catalog",
		items: [
			{
				to: "/admin/signature-bouquets",
				label: "Floral arrangements",
				icon: AdminIcons.products,
			},
			{
				to: "/admin/custom",
				label: "Custom bouquets",
				icon: AdminIcons.custom,
			},
			{ to: "/admin/flowers", label: "Flowers", icon: AdminIcons.flowers },
			{ to: "/admin/wrappers", label: "Wrappers", icon: AdminIcons.wrappers },
			{ to: "/admin/sizes", label: "Sizes", icon: AdminIcons.sizes },
			{
				to: "/admin/arrangement-types",
				label: "Arrangement types",
				icon: AdminIcons.types,
			},
			{
				to: "/admin/sales",
				label: "Sales",
				icon: AdminIcons.sale,
				owner: true,
			},
		],
	},
	{
		label: "People",
		items: [
			{ to: "/admin/florists", label: "Florists", icon: AdminIcons.florists },
			{
				to: "/admin/suppliers",
				label: "Suppliers",
				icon: AdminIcons.suppliers,
			},
			{
				to: "/admin/staff",
				label: "Staff",
				icon: AdminIcons.staff,
				owner: true,
			},
		],
	},
	{
		label: "Shop setup",
		items: [
			{ to: "/admin/shop", label: "Shop", icon: AdminIcons.shop },
			{
				to: "/admin/delivery-dates",
				label: "Delivery dates",
				icon: AdminIcons.calendar,
			},
			{
				to: "/admin/payments",
				label: "Payments",
				icon: AdminIcons.payments,
				owner: true,
			},
		],
	},
	{
		label: "Records",
		items: [
			{ to: "/admin/reports", label: "Reports", icon: AdminIcons.reports },
			{ to: "/admin/logs", label: "Logs", icon: AdminIcons.log },
		],
	},
];

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

function ChevronIcon(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={props.class}
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	);
}

function ProfileIcon(props: { class?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={props.class}
		>
			<circle cx="12" cy="8" r="4" />
			<path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
		</svg>
	);
}

const menuItem =
	"flex w-full cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-petal-900/80 outline-none transition-colors data-[highlighted]:bg-petal-100 data-[highlighted]:text-petal-900";

/** The signed-in person in the top bar; opens to their profile and sign out. */
function ProfileMenu(props: {
	user: { name: string; email: string; role: "owner" | "staff" };
	onProfile: () => void;
	onSignOut: () => void;
}) {
	return (
		<DropdownMenu.Root placement="bottom-end" gutter={6}>
			<DropdownMenu.Trigger
				class="group flex h-11 shrink-0 items-center gap-2 rounded-full py-1 pr-1 pl-1 text-petal-900 outline-none transition-colors hover:bg-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500 data-[expanded]:bg-petal-100 sm:pr-2.5"
				aria-label={`Account: ${props.user.name}`}
			>
				<Avatar name={props.user.name} class="size-9 text-sm" />
				<span class="hidden max-w-40 truncate text-sm font-medium sm:inline">
					{props.user.name}
				</span>
				<ChevronIcon class="hidden size-4 text-petal-900/55 transition-transform group-data-[expanded]:rotate-180 sm:block" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class="z-50 w-[min(18rem,calc(100vw-1.5rem))] origin-[var(--kb-menu-content-transform-origin)] rounded-2xl border border-petal-100 bg-white p-1.5 text-petal-900 shadow-[0_16px_40px_-16px_rgb(92_31_49/0.35)] outline-none data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95">
					<div class="flex items-center gap-3 px-3 pt-2.5 pb-3">
						<Avatar name={props.user.name} class="size-10 text-sm" />
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-2">
								<span class="truncate text-sm font-semibold">
									{props.user.name}
								</span>
								<RoleBadge role={props.user.role} class="shrink-0" />
							</p>
							<p class="truncate text-xs text-petal-900/60">
								{props.user.email}
							</p>
						</div>
					</div>
					<DropdownMenu.Separator class="mx-1.5 mb-1.5 border-petal-100" />
					<DropdownMenu.Item class={menuItem} onSelect={props.onProfile}>
						<ProfileIcon class="size-5" />
						My profile
					</DropdownMenu.Item>
					<DropdownMenu.Item class={menuItem} onSelect={props.onSignOut}>
						<AdminIcons.logout class="size-5" />
						Sign out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
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
	// Owner-only pages are left out for staff, and so is a group left empty.
	const groups = () =>
		NAV_GROUPS.map((group) => ({
			...group,
			items: group.items.filter(
				(item) => !item.owner || user().role === "owner",
			),
		})).filter((group) => group.items.length > 0);
	const items = () => groups().flatMap((group) => group.items);

	const location = useLocation();
	const current = () =>
		location().pathname.startsWith("/admin/profile")
			? "My profile"
			: items().find((item) => location().pathname.startsWith(item.to))?.label;

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
		<nav aria-label="Admin" class="flex flex-col gap-5">
			<For each={groups()}>
				{(group) => {
					const headingId = createUniqueId();
					return (
						<div>
							<h2
								id={headingId}
								class="mb-1 px-3 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-petal-900/55"
							>
								{group.label}
							</h2>
							<ul aria-labelledby={headingId} class="flex flex-col gap-0.5">
								<For each={group.items}>
									{(item) => (
										<li>
											<Link
												to={item.to}
												activeProps={{
													class: "bg-petal-100 font-medium text-petal-900",
												}}
												class={navLink}
											>
												<item.icon class="size-5" />
												{item.label}
											</Link>
										</li>
									)}
								</For>
							</ul>
						</div>
					);
				}}
			</For>
		</nav>
	);

	// Bottom of the sidebar and drawer: the public shop, in a new tab.
	const ViewShop = () => (
		<div class="shrink-0 border-t border-petal-100 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
			<a href="/" target="_blank" rel="noreferrer" class={navLink}>
				<AdminIcons.shop class="size-5" />
				View shop
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="ml-auto size-4 text-petal-900/45"
				>
					<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
				</svg>
				<span class="sr-only">(opens in a new tab)</span>
			</a>
		</div>
	);

	return (
		<div class="min-h-screen bg-cream text-petal-900 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] print:block print:bg-white">
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
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-4">
							<NavList />
						</div>
						<ViewShop />
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			{/* iPad sideways and desktop: the sidebar, scrolling on short screens. */}
			<aside class="sticky top-0 hidden h-dvh flex-col border-r border-petal-100 bg-white/90 backdrop-blur lg:flex print:hidden">
				<div class="flex h-16 shrink-0 items-center px-5">
					<Brand />
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-4">
					<NavList />
				</div>
				<ViewShop />
			</aside>

			<div class="flex min-w-0 flex-col">
				{/* The top bar: the menu button and brand on smaller screens, and who's signed in. */}
				<header class="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-petal-100 bg-white/90 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur lg:h-16 lg:px-8 print:hidden">
					<button
						type="button"
						onClick={() => setMenuOpen(true)}
						class={`${iconButton} lg:hidden`}
						aria-label="Open menu"
						aria-expanded={menuOpen()}
					>
						<MenuIcon class="size-6" />
					</button>
					<div class="lg:hidden">
						<Brand />
					</div>
					<Show when={current()}>
						{(label) => (
							<span class="hidden min-w-0 truncate pl-3 text-sm font-medium text-petal-900/70 sm:block lg:pl-0">
								{label()}
							</span>
						)}
					</Show>
					<div class="ml-auto">
						<ProfileMenu
							user={user()}
							onProfile={() => navigate({ to: "/admin/profile" })}
							onSignOut={signOut}
						/>
					</div>
				</header>
				<main class="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
					<Show when={user()}>
						<Outlet />
					</Show>
				</main>
			</div>
		</div>
	);
}
