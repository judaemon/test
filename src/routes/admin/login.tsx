import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createSignal, onMount, Show } from "solid-js";

import { adminButton, adminInput, Field } from "~/components/admin/ui";
import { FlowerMark } from "~/components/site/brand";
import { authClient } from "~/lib/auth-client";
import { getAdminSession, getAdminSetupStatus } from "~/server/admin/settings";

/** Only same-site admin paths, so the redirect can't send staff elsewhere. */
function safeRedirect(target: unknown) {
	return typeof target === "string" &&
		target.startsWith("/admin") &&
		!target.startsWith("/admin/login")
		? target
		: "/admin";
}

export const Route = createFileRoute("/admin/login")({
	validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: async ({ search }) => {
		if (await getAdminSession())
			throw redirect({ href: safeRedirect(search.redirect) });
	},
	loader: () => getAdminSetupStatus(),
	head: () => ({
		meta: [
			{ title: "Sign in · ORAIA Admin" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: LoginPage,
});

function LoginPage() {
	const search = Route.useSearch();
	const setup = Route.useLoaderData();
	const router = useRouter();
	const navigate = useNavigate();
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	// Enabled once the page is interactive, so sign-in always goes through JS.
	const [ready, setReady] = createSignal(false);
	onMount(() => setReady(true));

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		setBusy(true);
		setError(null);
		const { error: signInError } = await authClient.signIn.email({
			email: String(form.get("email") ?? "").trim(),
			password: String(form.get("password") ?? ""),
		});
		if (signInError) {
			setBusy(false);
			setError(
				signInError.status === 401
					? "That email and password don’t match."
					: "Couldn’t sign in right now. Please try again.",
			);
			return;
		}
		await router.invalidate();
		await navigate({ href: safeRedirect(search().redirect) });
	};

	return (
		<main class="flex min-h-screen items-center justify-center bg-cream px-4 py-12 text-petal-900">
			<div class="w-full max-w-sm">
				<div class="mb-8 flex flex-col items-center gap-3 text-center">
					<FlowerMark class="size-12" />
					<h1 class="font-display type-soft text-3xl font-semibold">
						ORAIA Admin
					</h1>
					<p class="text-sm text-petal-900/65">Sign in to manage the shop.</p>
				</div>
				<Show when={!setup().hasAccounts}>
					<div class="mb-4 rounded-2xl border border-warning-foreground/30 bg-warning px-4 py-3 text-sm text-warning-foreground">
						<p class="font-semibold">No admin accounts yet</p>
						<p class="mt-1">
							Add <code class="font-mono">ADMIN_EMAIL</code> and{" "}
							<code class="font-mono">ADMIN_PASSWORD</code> (10+ characters) to{" "}
							<code class="font-mono">.env.local</code>, then restart the
							server. That creates the owner account you can sign in with here.
						</p>
					</div>
				</Show>
				{/* POST so a submit before hydration can never put credentials in the URL. */}
				<form
					method="post"
					onSubmit={handleSubmit}
					class="flex flex-col gap-4 rounded-3xl border border-petal-100 bg-white p-6 shadow-sm"
				>
					<Field label="Email">
						<input
							name="email"
							type="email"
							required
							autocomplete="username"
							class={adminInput}
						/>
					</Field>
					<Field label="Password">
						<input
							name="password"
							type="password"
							required
							autocomplete="current-password"
							class={adminInput}
						/>
					</Field>
					<Show when={error()}>
						<p
							role="alert"
							class="rounded-xl bg-error px-3 py-2 text-sm text-error-foreground"
						>
							{error()}
						</p>
					</Show>
					<button
						type="submit"
						disabled={busy() || !ready()}
						class={`${adminButton.primary} w-full`}
					>
						{busy() ? "Signing in…" : "Sign in"}
					</button>
				</form>
				<p class="mt-6 text-center text-xs text-petal-900/50">
					Forgot your password? Ask the shop owner to reset it.
				</p>
			</div>
		</main>
	);
}
