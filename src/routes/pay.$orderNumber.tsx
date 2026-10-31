import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { createSignal, For, Match, Show, Switch } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { PaymentSection } from "~/components/checkout/payment-section";
import { OrderStatusPill } from "~/components/order/payment-status";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import type { FieldErrors } from "~/lib/checkout";
import { CONTACT } from "~/lib/contact";
import type { CardInput, PaymentMethod } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { useSessionUser } from "~/lib/use-catalog";
import {
	getPayableOrder,
	type PayableOrder,
	submitOrderPayment,
} from "~/server/orders";

interface PaySearch {
	/** The private order id, proving this device placed the order. */
	key?: string;
}

const EMPTY_CARD: CardInput = { number: "", name: "", expiry: "", cvc: "" };

export const Route = createFileRoute("/pay/$orderNumber")({
	validateSearch: (search: Record<string, unknown>): PaySearch => ({
		key: typeof search.key === "string" ? search.key : undefined,
	}),
	loaderDeps: ({ search }) => ({ key: search.key }),
	loader: async ({ params, deps }) => {
		const order = await getPayableOrder({
			data: { number: params.orderNumber, key: deps.key },
		});
		if (!order) throw notFound();
		return order;
	},
	head: () => ({
		meta: [
			{ title: "Pay for your order · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: PayPage,
	notFoundComponent: () => (
		<Shell>
			<p class="text-petal-900/70">We couldn’t find that order.</p>
			<BackToOrders />
		</Shell>
	),
});

function PayPage() {
	const order = Route.useLoaderData();
	const search = Route.useSearch();
	const params = Route.useParams();
	const user = useSessionUser();
	const here = () => {
		const key = search().key;
		return `/pay/${params().orderNumber}${key ? `?key=${key}` : ""}`;
	};

	return (
		<Shell>
			<div class="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-petal-100 bg-white p-5">
				<div class="min-w-0">
					<p class="font-semibold">Order #{order().number}</p>
					<For each={order().items}>
						{(item) => <p class="text-sm text-petal-900/65">{item}</p>}
					</For>
					<p class="mt-1 font-semibold tabular-nums">
						{formatPrice(order().total, order().currency)}
					</p>
				</div>
				<OrderStatusPill status={order().status} />
			</div>

			<Switch>
				<Match when={!order().due}>
					<p class="mt-5 text-petal-900/70">
						This order doesn’t need a payment right now.
					</p>
					<BackToOrders />
				</Match>
				<Match when={order().access === "sign-in"}>
					<section class="mt-5 rounded-3xl border border-petal-100 bg-white p-6">
						<h2 class="font-display type-soft text-xl font-semibold">
							Sign in to pay for this order
						</h2>
						<p class="mt-2 text-sm text-petal-900/70">
							Use an account with the same surname as the order. If you ordered
							on this phone or computer, open this order from Active orders
							there and you won’t need to sign in.
						</p>
						<Link
							to="/sign-in"
							search={{ redirect: here() }}
							class={`${pillPrimary} mt-5`}
						>
							Sign in or create an account
						</Link>
					</section>
				</Match>
				<Match when={order().access === "not-yours"}>
					<section class="mt-5 rounded-3xl border border-petal-100 bg-white p-6">
						<h2 class="font-display type-soft text-xl font-semibold">
							This order isn’t linked to {user()?.name ?? "your account"}
						</h2>
						<p class="mt-2 text-sm text-petal-900/70">
							If it’s yours, message us on{" "}
							<a
								href={CONTACT.facebookUrl}
								target="_blank"
								rel="noreferrer"
								class="font-medium underline"
							>
								Facebook
							</a>{" "}
							or call {CONTACT.phone} with order number #{order().number}.
						</p>
					</section>
				</Match>
				<Match when={order().access === "allowed"}>
					<PayForm order={order()} orderKey={search().key} />
				</Match>
			</Switch>
		</Shell>
	);
}

function PayForm(props: { order: PayableOrder; orderKey?: string }) {
	const router = useRouter();
	const [method, setMethod] = createSignal<PaymentMethod | null>(
		props.order.paymentAccounts.some((a) => a.method === props.order.method)
			? props.order.method
			: null,
	);
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [formError, setFormError] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [sent, setSent] = createSignal(false);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy()) return;
		const reference = new FormData(event.currentTarget as HTMLFormElement).get(
			"referenceNumber",
		);
		setBusy(true);
		setFormError("");
		try {
			const result = await submitOrderPayment({
				data: {
					number: props.order.number,
					key: props.orderKey,
					method: method() ?? "",
					referenceNumber: typeof reference === "string" ? reference : "",
				},
			});
			if (!result.ok) {
				setErrors(result.fieldErrors ?? {});
				if (!result.fieldErrors) setFormError(result.message);
				return;
			}
			setSent(true);
			await router.invalidate();
		} catch {
			setFormError(
				"We couldn’t send your payment. Check your connection and try again.",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Show
			when={!sent()}
			fallback={
				<section class="mt-5 rounded-3xl bg-success p-6 text-success-foreground">
					<h2 class="font-display type-soft text-xl font-semibold">
						Thanks! We’re checking your payment
					</h2>
					<p class="mt-1 text-sm">
						Your order now shows as Verifying payment in Active orders.
					</p>
					<BackToOrders />
				</section>
			}
		>
			<form
				noValidate
				onSubmit={submit}
				class="mt-5 rounded-3xl border border-petal-100 bg-white p-6"
			>
				<h2 class="mb-4 font-display type-soft text-xl font-semibold">
					Send your payment
				</h2>
				<PaymentSection
					accounts={props.order.paymentAccounts}
					total={props.order.total}
					currency={props.order.currency}
					method={method()}
					onMethodChange={setMethod}
					card={EMPTY_CARD}
					onCardChange={() => {}}
					errors={errors()}
					clearError={(field) => setErrors(({ [field]: _, ...rest }) => rest)}
				/>
				<Show when={formError()}>
					<p
						role="alert"
						class="mt-4 rounded-xl bg-error px-3 py-2 text-sm text-error-foreground"
					>
						{formError()}
					</p>
				</Show>
				<button
					type="submit"
					disabled={busy()}
					aria-busy={busy()}
					class={`${pillPrimary} mt-5`}
				>
					{busy() ? "Sending…" : "Send payment"}
				</button>
			</form>
		</Show>
	);
}

function BackToOrders() {
	return (
		<Link
			to="/active-orders"
			class="mt-4 inline-block py-2 font-medium text-petal-700 underline underline-offset-2"
		>
			Back to Active orders
		</Link>
	);
}

function Shell(props: { children: JSX.Element }) {
	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
				<h1 class="mb-5 font-display type-soft text-3xl font-semibold tracking-tight">
					Pay for your order
				</h1>
				{props.children}
			</main>
			<SiteFooter />
		</div>
	);
}
