import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { CompanyLabel } from "~/components/order/company-label";
import { OrderStatusPill } from "~/components/order/payment-status";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { rememberedOrderId } from "~/lib/my-orders";
import { formatPrice } from "~/lib/product";
import { findOrdersFn } from "~/server/orders";
import { type ActiveOrder, ORDER_STATUS_LABELS } from "~/types/order";

/** Keeps statuses moving without a reload. */
const REFRESH_MS = 60_000;
/** Matches the server: shorter searches find nothing. */
const SEARCH_MIN = 3;

interface LookupSearch {
	/** What was searched, so Back and a refresh keep the results. */
	q?: string;
}

export const Route = createFileRoute("/active-orders")({
	validateSearch: (search: Record<string, unknown>): LookupSearch => ({
		q:
			typeof search.q === "string" && search.q.trim()
				? search.q.trim().slice(0, 120)
				: undefined,
	}),
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: ({ deps }) => (deps.q ? findOrdersFn({ data: deps.q }) : []),
	head: () => ({
		meta: [
			{ title: "Check your order · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: OrderLookupPage,
});

function OrderLookupPage() {
	const orders = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const router = useRouter();
	const [query, setQuery] = createSignal(search().q ?? "");
	const [tooShort, setTooShort] = createSignal(false);

	onMount(() => {
		const timer = setInterval(() => {
			if (search().q && document.visibilityState === "visible")
				router.invalidate();
		}, REFRESH_MS);
		onCleanup(() => clearInterval(timer));
	});

	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		const q = query().trim();
		setTooShort(q.length < SEARCH_MIN);
		if (q.length < SEARCH_MIN) return;
		void navigate({ search: { q } });
	};

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
				<header class="text-center">
					<h1 class="font-display type-soft text-4xl font-semibold tracking-tight sm:text-5xl">
						Check your order
					</h1>
					<p class="mt-3 text-petal-900/70">
						Enter your name, email or serial number to see your orders.
					</p>
				</header>

				<form onSubmit={submit} class="mt-8 flex flex-col gap-2 sm:flex-row">
					<label class="min-w-0 flex-1">
						<span class="sr-only">Name, email or serial number</span>
						<input
							type="search"
							value={query()}
							onInput={(e) => {
								setQuery(e.currentTarget.value);
								setTooShort(false);
							}}
							placeholder="Name, email or serial number"
							autocomplete="off"
							aria-invalid={tooShort() ? "true" : undefined}
							aria-describedby={tooShort() ? "lookup-error" : undefined}
							class="h-12 w-full rounded-full border border-petal-200 bg-white px-5 text-base outline-none transition-colors placeholder:text-petal-900/40 focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30"
						/>
					</label>
					<button
						type="submit"
						class="inline-flex h-12 items-center justify-center rounded-full bg-petal-700 px-7 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
					>
						Check order
					</button>
				</form>
				<Show when={tooShort()}>
					<p
						id="lookup-error"
						role="alert"
						class="mt-2 px-5 text-sm text-destructive"
					>
						Type at least {SEARCH_MIN} characters.
					</p>
				</Show>

				<Show when={search().q}>
					<section aria-live="polite" class="mt-8">
						<Show
							when={orders().length > 0}
							fallback={
								<div class="flex flex-col items-center gap-3 rounded-3xl border border-petal-100 bg-white px-6 py-12 text-center">
									<FlowerMark class="size-12" />
									<p class="font-display type-soft text-xl font-semibold">
										No orders found
									</p>
									<p class="max-w-sm text-sm text-petal-900/65">
										Check the spelling, or try your full email or serial number.
										Still can’t find it?{" "}
										<Link
											to="/shop"
											class="font-medium text-petal-700 underline underline-offset-2"
										>
											Message us
										</Link>{" "}
										from the shop page.
									</p>
								</div>
							}
						>
							<p class="mb-3 text-sm text-petal-900/60">
								{orders().length} {orders().length === 1 ? "order" : "orders"}{" "}
								found
							</p>
							<ul class="flex flex-col gap-3">
								<For each={orders()}>
									{(order) => <OrderCard order={order} />}
								</For>
							</ul>
						</Show>
					</section>
				</Show>
			</main>
			<SiteFooter />
		</div>
	);
}

function OrderCard(props: { order: ActiveOrder }) {
	const navigate = useNavigate();
	const order = () => props.order;
	const payable = () =>
		order().status === "on_hold" || order().status === "payment_check";

	return (
		<li class="rounded-2xl border border-petal-100 bg-white p-5">
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="text-xs font-medium uppercase tracking-wide text-petal-900/55">
						Order #{order().number}
					</p>
					<p class="mt-0.5 font-semibold">{order().fullName}</p>
				</div>
				<OrderStatusPill status={order().status} />
			</div>
			<div class="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-petal-900/65">
				<Show when={order().className}>
					<span>{order().className}</span>
				</Show>
				<Show when={order().company}>
					<span aria-hidden="true">·</span>
					<CompanyLabel
						company={order().company}
						className={order().className}
						companyOnly
					/>
				</Show>
			</div>
			<div class="mt-3 border-t border-petal-50 pt-3 text-sm">
				<For each={order().items}>{(item) => <p>{item}</p>}</For>
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
				<p class="font-semibold tabular-nums">
					{formatPrice(order().total, order().currency)}
				</p>
				<Show when={payable()}>
					<button
						type="button"
						onClick={() =>
							navigate({
								to: "/pay/$orderNumber",
								params: { orderNumber: order().number },
								search: { key: rememberedOrderId(order().number) },
							})
						}
						aria-label={`${ORDER_STATUS_LABELS[order().status]}: pay for order ${order().number}`}
						class="inline-flex h-10 items-center rounded-full bg-petal-700 px-5 text-sm font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
					>
						Pay now
					</button>
				</Show>
			</div>
		</li>
	);
}
