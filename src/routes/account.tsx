import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { For } from "solid-js";

import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { authClient } from "~/lib/auth-client";

export const Route = createFileRoute("/account")({
	beforeLoad: ({ context, location }) => {
		// Runs on the server for direct visits too, so account pages are never
		// rendered for guests.
		if (!context.user) {
			throw redirect({ to: "/sign-in", search: { redirect: location.href } });
		}
		return { user: context.user };
	},
	head: () => ({
		meta: [
			{ title: "Your account · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: AccountLayout,
});

const TABS = [
	{ to: "/account", label: "Overview", exact: true },
	{ to: "/account/orders", label: "Orders" },
	{ to: "/account/occasions", label: "Occasions" },
	{ to: "/account/addresses", label: "Addresses" },
] as const;

function AccountLayout() {
	const context = Route.useRouteContext();
	const router = useRouter();
	const navigate = useNavigate();
	const firstName = () => context().user.name.split(" ")[0] || "there";

	const signOut = async () => {
		await authClient.signOut();
		await router.invalidate();
		await navigate({ to: "/" });
	};

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
				<div class="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p class="text-sm font-medium uppercase tracking-[0.2em] text-petal-700">
							Your account
						</p>
						<h1 class="mt-1 font-display type-soft text-4xl font-semibold tracking-tight">
							Hi, {firstName()}!
						</h1>
					</div>
					<button
						type="button"
						onClick={signOut}
						class="rounded-full border border-petal-200 bg-white px-4 py-2 text-sm text-petal-900/80 transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						Sign out
					</button>
				</div>
				<nav
					aria-label="Account"
					class="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-petal-100 px-4 sm:mx-0 sm:px-0"
				>
					<For each={TABS}>
						{(tab) => (
							<Link
								to={tab.to}
								activeOptions={{ exact: "exact" in tab }}
								activeProps={{
									class: "border-petal-700 font-semibold text-petal-900",
									"aria-current": "page",
								}}
								inactiveProps={{
									class:
										"border-transparent text-petal-900/65 hover:text-petal-900",
								}}
								class="-mb-px shrink-0 border-b-2 px-3 pb-3 pt-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
							>
								{tab.label}
							</Link>
						)}
					</For>
				</nav>
				<div class="mt-8">
					<Outlet />
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
