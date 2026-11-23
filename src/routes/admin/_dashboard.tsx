import * as Dialog from "@kobalte/core/dialog";
import * as DropdownMenu from "@kobalte/core/dropdown-menu";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
	useMatches,
	useNavigate,
} from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import {
	createEffect,
	createSignal,
	createUniqueId,
	For,
	on,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

import { type NavItem, visibleNav } from "~/components/admin/nav";
import { AdminIcons, Avatar, RoleBadges } from "~/components/admin/ui";
import { FlowerMark, Wordmark } from "~/components/site/brand";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { authClient } from "~/lib/auth-client";
import type { Crumb } from "~/lib/crumbs";
import type { RoleRef } from "~/lib/permissions";
import { cn } from "~/lib/utils";
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

const navLink =
	"flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-petal-900/75 lg:py-2 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

/** Slim sidebar: icon-only rows, centered. */
const railLink = "justify-center px-0";

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

/** A window with its left panel marked: shrinks or expands the sidebar. */
function PanelIcon(props: { class?: string }) {
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
			<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
			<path d="M9.5 4.5v15" />
		</svg>
	);
}

function HomeIcon(props: { class?: string }) {
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
			<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />
		</svg>
	);
}

function CrumbIcon(props: { class?: string }) {
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
			<path d="m9.5 6 6 6-6 6" />
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

function LockIcon(props: { class?: string }) {
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
			<rect x="4.5" y="10.5" width="15" height="10" rx="2" />
			<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
		</svg>
	);
}

function BackIcon(props: { class?: string }) {
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
			<path d="M19 12H5M11 6l-6 6 6 6" />
		</svg>
	);
}

/** Inside Account, the sidebar swaps to these. */
const ACCOUNT_GROUPS: { label: string; items: NavItem[] }[] = [
	{
		label: "Account settings",
		items: [
			{ to: "/admin/account/profile", label: "Profile", icon: ProfileIcon },
			{ to: "/admin/account/security", label: "Security", icon: LockIcon },
		],
	},
];

const menuItem =
	"flex w-full cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-petal-900/80 outline-none transition-colors data-[highlighted]:bg-petal-100 data-[highlighted]:text-petal-900";

/** The signed-in person in the top bar; opens to their profile and sign out. */
function ProfileMenu(props: {
	user: {
		name: string;
		email: string;
		roles: RoleRef[];
		image?: string;
	};
	onOpen: (to: "/admin/account/profile" | "/admin/account/security") => void;
	onSignOut: () => void;
}) {
	return (
		<DropdownMenu.Root placement="bottom-end" gutter={6}>
			<DropdownMenu.Trigger
				class="flex size-10 shrink-0 items-center justify-center rounded-full outline-none transition-shadow hover:ring-4 hover:ring-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500 data-[expanded]:ring-4 data-[expanded]:ring-petal-100"
				aria-label={`Account: ${props.user.name}`}
			>
				<Avatar
					name={props.user.name}
					image={props.user.image}
					class="size-9 text-sm"
				/>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class="z-50 w-[min(18rem,calc(100vw-1.5rem))] origin-[var(--kb-menu-content-transform-origin)] rounded-2xl border border-petal-100 bg-white p-1.5 text-petal-900 shadow-[0_16px_40px_-16px_rgb(92_31_49/0.35)] outline-none data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95">
					<div class="flex items-center gap-3 px-3 pt-2.5 pb-3">
						<Avatar
							name={props.user.name}
							image={props.user.image}
							class="size-10 text-sm"
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold">{props.user.name}</p>
							<p class="truncate text-xs text-petal-900/60">
								{props.user.email}
							</p>
							<RoleBadges roles={props.user.roles} class="mt-1.5" />
						</div>
					</div>
					<DropdownMenu.Separator class="mx-1.5 mb-1.5 border-petal-100" />
					<DropdownMenu.Item
						class={menuItem}
						onSelect={() => props.onOpen("/admin/account/profile")}
					>
						<ProfileIcon class="size-5" />
						Profile
					</DropdownMenu.Item>
					<DropdownMenu.Item
						class={menuItem}
						onSelect={() => props.onOpen("/admin/account/security")}
					>
						<LockIcon class="size-5" />
						Security
					</DropdownMenu.Item>
					<DropdownMenu.Separator class="mx-1.5 my-1.5 border-petal-100" />
					<DropdownMenu.Item class={menuItem} onSelect={props.onSignOut}>
						<AdminIcons.logout class="size-5" />
						Sign out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

/** The name and Admin tag; just the flower when the sidebar is slim. */
function Brand(props: { compact?: boolean }) {
	return (
		<Link
			to="/admin"
			aria-label={props.compact ? "ORAIA Admin home" : undefined}
			class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
		>
			<FlowerMark class="size-7" />
			<Show when={!props.compact}>
				<Wordmark class="text-lg" />
				<span class="rounded-full bg-petal-100 px-2 py-0.5 text-[11px] font-medium text-petal-700">
					Admin
				</span>
			</Show>
		</Link>
	);
}

/** In the slim sidebar, a row shows its name beside it on hover. */
function RailTip(props: {
	label: string;
	rail: boolean;
	children: JSX.Element;
}) {
	return (
		<Show when={props.rail} fallback={props.children}>
			<Tooltip placement="right" openDelay={150} closeDelay={0} gutter={10}>
				<TooltipTrigger as="div">{props.children}</TooltipTrigger>
				<TooltipContent class="rounded-lg border-petal-100 bg-petal-900 px-2.5 py-1 text-xs font-medium text-white shadow-[0_8px_20px_-10px_rgb(92_31_49/0.5)]">
					{props.label}
				</TooltipContent>
			</Tooltip>
		</Show>
	);
}

function AdminLayout() {
	const context = Route.useRouteContext();
	const navigate = useNavigate();
	const user = () => context().user;
	// Pages their roles don't open are left out, and so is a group left empty.
	const groups = () => visibleNav(user());
	const items = () => groups().flatMap((group) => group.items);

	const location = useLocation();
	// Account has its own short sidebar, with a way back to the dashboard.
	const inAccount = () => location().pathname.startsWith("/admin/account");

	// The trail after home: the sidebar page, then whatever the page under it
	// names (an editor, an order, a report), e.g. Sizes › New size.
	const matches = useMatches();
	const crumbs = (): Crumb[] => {
		const trail: Crumb[] = [];
		if (inAccount()) trail.push({ label: "Account", to: "/admin/account" });
		const pathname = location().pathname;
		const section = (inAccount() ? ACCOUNT_GROUPS[0].items : items()).find(
			(item) => pathname.startsWith(item.to),
		);
		const deepest = [...matches()]
			.reverse()
			.find((match) => match.staticData?.crumbs);
		const own =
			deepest?.staticData.crumbs?.({
				params: deepest.params as Record<string, string>,
				loaderData: deepest.loaderData,
			}) ?? [];
		if (section)
			trail.push({
				label: section.label,
				to: own.length ? section.to : undefined,
			});
		trail.push(...own);
		return trail;
	};

	// Large screens: the button at the bottom of the sidebar shrinks it to
	// icons or expands it, remembered on this device. Smaller screens use the
	// drawer, opened from the top bar.
	const [sidebarOpen, setSidebarOpen] = createSignal(true);
	const [wide, setWide] = createSignal(false);
	const rail = () => wide() && !sidebarOpen();
	onMount(() => {
		try {
			if (localStorage.getItem("admin-sidebar") === "hidden")
				setSidebarOpen(false);
		} catch {}
		const query = window.matchMedia("(min-width: 64rem)");
		const update = () => setWide(query.matches);
		update();
		query.addEventListener("change", update);
		onCleanup(() => query.removeEventListener("change", update));
	});
	const togglePanel = () => {
		const next = !sidebarOpen();
		setSidebarOpen(next);
		try {
			localStorage.setItem("admin-sidebar", next ? "shown" : "hidden");
		} catch {}
	};

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

	const NavList = (props: { rail?: boolean }) => (
		<nav
			aria-label={inAccount() ? "Account" : "Admin"}
			class={cn("flex flex-col", props.rail ? "gap-3" : "gap-5")}
		>
			<Show when={inAccount()}>
				<RailTip label="Back to dashboard" rail={!!props.rail}>
					<Link to="/admin" class={cn(navLink, props.rail && railLink)}>
						<BackIcon class="size-5" />
						<span class={cn(props.rail && "sr-only")}>Back to dashboard</span>
					</Link>
				</RailTip>
			</Show>
			<For each={inAccount() ? ACCOUNT_GROUPS : groups()}>
				{(group, index) => {
					const headingId = createUniqueId();
					return (
						<div>
							<h2
								id={headingId}
								class={cn(
									"mb-1 px-3 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-petal-900/55",
									props.rail && "sr-only",
								)}
							>
								{group.label}
							</h2>
							{/* Slim sidebar: a short line stands in for the group name. */}
							<Show when={props.rail && index() > 0}>
								<span
									aria-hidden="true"
									class="mx-auto mb-3 block h-px w-6 bg-petal-200"
								/>
							</Show>
							<ul aria-labelledby={headingId} class="flex flex-col gap-0.5">
								<For each={group.items}>
									{(item) => (
										<li>
											<RailTip label={item.label} rail={!!props.rail}>
												<Link
													to={item.to}
													activeProps={{
														class: "bg-petal-100 font-medium text-petal-900",
													}}
													class={cn(navLink, props.rail && railLink)}
												>
													<item.icon class="size-5" />
													<span class={cn(props.rail && "sr-only")}>
														{item.label}
													</span>
												</Link>
											</RailTip>
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

	// Bottom of the sidebar and drawer: the public shop in a new tab, and on
	// large screens the button that shrinks or expands the sidebar.
	const SidebarFooter = (props: { rail?: boolean; toggle?: boolean }) => (
		<div
			class={cn(
				"flex shrink-0 gap-1 border-t border-petal-100 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
				props.rail ? "flex-col items-center" : "items-center",
			)}
		>
			<RailTip label="View shop" rail={!!props.rail}>
				<a
					href="/"
					target="_blank"
					rel="noreferrer"
					class={cn(navLink, "min-w-0 flex-1", props.rail && railLink)}
				>
					<AdminIcons.shop class="size-5" />
					<span class={cn(props.rail && "sr-only")}>View shop</span>
					<Show when={!props.rail}>
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
					</Show>
					<span class="sr-only">(opens in a new tab)</span>
				</a>
			</RailTip>
			<Show when={props.toggle}>
				<RailTip label="Expand sidebar" rail={!!props.rail}>
					<button
						type="button"
						onClick={togglePanel}
						class="flex size-10 shrink-0 items-center justify-center rounded-xl text-petal-900/60 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						aria-label={props.rail ? "Expand sidebar" : "Collapse sidebar"}
						aria-controls="admin-sidebar"
						aria-expanded={!props.rail}
					>
						<PanelIcon class="size-5" />
					</button>
				</RailTip>
			</Show>
		</div>
	);

	return (
		<div
			class="min-h-screen bg-cream text-petal-900 lg:grid lg:grid-cols-[var(--admin-sidebar)_minmax(0,1fr)] print:block print:bg-white"
			// Pages' fixed save bars line up with it too: lg:left-[var(--admin-sidebar)].
			style={{ "--admin-sidebar": sidebarOpen() ? "240px" : "72px" }}
		>
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
						<SidebarFooter />
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			{/* iPad sideways and desktop: the sidebar, scrolling on short screens. */}
			<aside
				id="admin-sidebar"
				class="sticky top-0 hidden h-dvh flex-col border-r border-petal-100 bg-white/90 backdrop-blur lg:flex print:hidden"
			>
				{/* The line under the brand meets the top bar's bottom edge. */}
				<div
					class={cn(
						"flex h-16 shrink-0 items-center border-b border-petal-100",
						rail() ? "justify-center" : "px-5",
					)}
				>
					<Brand compact={rail()} />
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
					<NavList rail={rail()} />
				</div>
				<SidebarFooter rail={rail()} toggle />
			</aside>

			<div class="flex min-w-0 flex-col">
				{/* The top bar: where you are, and who's signed in. */}
				<header class="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-petal-100 bg-white/90 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur lg:h-16 lg:pr-4 lg:pl-3 print:hidden">
					{/* Phones and iPad upright: the menu lives in a drawer. */}
					<button
						type="button"
						onClick={() => setMenuOpen(true)}
						class={cn(iconButton, "mr-1 lg:hidden")}
						aria-label="Open menu"
						aria-expanded={menuOpen()}
					>
						<MenuIcon class="size-6" />
					</button>
					<nav aria-label="Breadcrumb" class="min-w-0">
						<ol class="flex min-w-0 items-center gap-1.5 text-sm">
							<li class="shrink-0">
								<Link
									to="/admin"
									aria-label="Dashboard"
									class="flex size-8 items-center justify-center rounded-full text-petal-900/60 transition-colors hover:bg-petal-100 hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									<HomeIcon class="size-[1.125rem]" />
								</Link>
							</li>
							<For each={crumbs()}>
								{(crumb, index) => {
									const last = () => index() === crumbs().length - 1;
									return (
										<>
											<li aria-hidden="true" class="shrink-0 text-petal-900/35">
												<CrumbIcon class="size-4" />
											</li>
											{/* Earlier steps keep their full name; the page you're on shortens first. */}
											<li
												class={cn(
													last() ? "min-w-0" : "min-w-0 max-w-40 shrink-[2]",
												)}
											>
												<Show
													when={!last() && crumb.to}
													fallback={
														<span
															aria-current={last() ? "page" : undefined}
															class={cn(
																"block truncate",
																last()
																	? "font-medium text-petal-900"
																	: "text-petal-900/60",
															)}
														>
															{crumb.label}
														</span>
													}
												>
													{(to) => (
														<Link
															to={to()}
															class="block truncate rounded-md text-petal-900/60 transition-colors hover:text-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
														>
															{crumb.label}
														</Link>
													)}
												</Show>
											</li>
										</>
									);
								}}
							</For>
						</ol>
					</nav>
					<div class="ml-auto shrink-0 pl-2">
						<ProfileMenu
							user={user()}
							onOpen={(to) => navigate({ to })}
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
