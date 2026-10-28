import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";

import { adminInput, Field } from "~/components/admin/ui";
import { pillPrimary } from "~/components/cart/cart-sheet";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

type Mode = "sign-in" | "sign-up";

interface SignInSearch {
	mode?: Mode;
	redirect?: string;
}

/**
 * Same-site shop paths only: never another origin ("//evil.com") and never
 * the admin (staff sign in at /admin/login).
 */
function safeRedirect(target: unknown) {
	return typeof target === "string" &&
		target.startsWith("/") &&
		!target.startsWith("//") &&
		!target.startsWith("/admin") &&
		!target.startsWith("/sign-in")
		? target
		: "/account";
}

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): SignInSearch => ({
		mode: search.mode === "sign-up" ? "sign-up" : undefined,
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: ({ context, search }) => {
		if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
	},
	head: () => ({
		meta: [
			{ title: "Sign in · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: SignInPage,
});

const ERRORS: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: "That email and password don’t match.",
	USER_ALREADY_EXISTS:
		"There’s already an account with that email. Sign in instead.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"There’s already an account with that email. Sign in instead.",
	PASSWORD_TOO_SHORT: "Use a password with at least 10 characters.",
	PASSWORD_TOO_LONG: "That password is too long.",
	INVALID_EMAIL: "That email doesn’t look quite right.",
};

function SignInPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const mode = (): Mode => search().mode ?? "sign-in";
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	// Enabled once the page is interactive, so credentials always go through JS.
	const [ready, setReady] = createSignal(false);
	onMount(() => setReady(true));

	const switchMode = (next: Mode) => {
		setError(null);
		navigate({
			search: (prev) => ({
				...prev,
				mode: next === "sign-up" ? next : undefined,
			}),
			replace: true,
		});
	};

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		setBusy(true);
		setError(null);
		const { error: authError } =
			mode() === "sign-up"
				? await authClient.signUp.email({
						name: String(form.get("name") ?? "").trim(),
						email,
						password,
					})
				: await authClient.signIn.email({ email, password });
		if (authError) {
			setBusy(false);
			setError(
				(authError.code && ERRORS[authError.code]) ||
					(authError.status === 429
						? "Too many attempts. Please wait a minute and try again."
						: "Couldn’t sign you in right now. Please try again."),
			);
			return;
		}
		// Navigating re-runs the root route's beforeLoad, so the header and
		// account pages pick up the new session.
		await navigate({ href: safeRedirect(search().redirect) });
	};

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="flex flex-1 items-start justify-center px-4 py-12">
				<div class="w-full max-w-sm">
					<div class="mb-6 flex flex-col items-center gap-2 text-center">
						<FlowerMark class="size-10" />
						<h1 class="font-display type-soft text-3xl font-semibold">
							{mode() === "sign-up" ? "Create your account" : "Welcome back"}
						</h1>
						<p class="text-sm text-petal-900/65">
							Track deliveries, save addresses and never forget a birthday.
						</p>
					</div>

					<fieldset class="mb-4 grid grid-cols-2 rounded-full border border-petal-200 bg-white p-1">
						<legend class="sr-only">Sign in or create an account</legend>
						<For
							each={
								[
									["sign-in", "Sign in"],
									["sign-up", "Create account"],
								] as const
							}
						>
							{([value, label]) => (
								<button
									type="button"
									aria-pressed={mode() === value}
									onClick={() => switchMode(value)}
									class={cn(
										"rounded-full py-2 text-sm transition-colors",
										mode() === value
											? "bg-petal-700 font-medium text-white"
											: "text-petal-900/70 hover:bg-petal-50",
									)}
								>
									{label}
								</button>
							)}
						</For>
					</fieldset>

					{/* POST so a submit before hydration never puts credentials in the URL. */}
					<form
						method="post"
						onSubmit={handleSubmit}
						class="flex flex-col gap-4 rounded-3xl border border-petal-100 bg-white p-6 shadow-sm"
					>
						<Show when={mode() === "sign-up"}>
							<Field label="Your name">
								<input
									name="name"
									required
									maxLength={80}
									autocomplete="name"
									class={adminInput}
								/>
							</Field>
						</Show>
						<Field label="Email">
							<input
								name="email"
								type="email"
								required
								autocomplete="email"
								class={adminInput}
							/>
						</Field>
						<Field
							label="Password"
							hint={
								mode() === "sign-up" ? "At least 10 characters." : undefined
							}
						>
							<input
								name="password"
								type="password"
								required
								minLength={mode() === "sign-up" ? 10 : undefined}
								autocomplete={
									mode() === "sign-up" ? "new-password" : "current-password"
								}
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
							class={pillPrimary}
						>
							{busy()
								? "One moment…"
								: mode() === "sign-up"
									? "Create account"
									: "Sign in"}
						</button>
					</form>
					<p class="mt-6 text-center text-xs text-petal-900/55">
						Just browsing?{" "}
						<Link
							to="/shop"
							class="text-petal-700 underline underline-offset-2"
						>
							Keep shopping
						</Link>{" "}
						— you can check out as a guest too.
					</p>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
