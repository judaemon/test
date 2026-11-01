import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { PaymentSection } from "~/components/checkout/payment-section";
import { OrderStatusPill } from "~/components/order/payment-status";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import type { FieldErrors } from "~/lib/checkout";
import type { CardInput, PaymentMethod } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import {
	getPayableOrder,
	type PayableOrder,
	submitOrderPayment,
} from "~/server/orders";

interface PaySearch {
	/** Just sent a payment: show the confirmation. */
	submitted?: boolean;
}

const EMPTY_CARD: CardInput = { number: "", name: "", expiry: "", cvc: "" };

export const Route = createFileRoute("/pay/$orderNumber")({
	validateSearch: (search: Record<string, unknown>): PaySearch => ({
		submitted: search.submitted === true ? true : undefined,
	}),
	// Fetched again on submitting: the payment is no longer due.
	loaderDeps: ({ search }) => ({ submitted: search.submitted }),
	loader: async ({ params }) => {
		const order = await getPayableOrder({ data: params.orderNumber });
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

	return (
		<Switch>
			<Match when={search().submitted && !order().due}>
				<Submitted number={order().number} />
			</Match>
			<Match when={true}>
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
					<Show
						when={order().due}
						fallback={
							<>
								<p class="mt-5 text-petal-900/70">
									This order doesn’t need a payment right now.
								</p>
								<BackToOrders />
							</>
						}
					>
						<PayForm order={order()} />
					</Show>
				</Shell>
			</Match>
		</Switch>
	);
}

/** After a payment is sent: what happens next. */
function Submitted(props: { number: string }) {
	return (
		<Shell title="Payment submitted">
			<section class="flex flex-col items-center gap-3 rounded-3xl border border-petal-100 bg-white px-6 py-10 text-center">
				<FlowerMark class="size-14" />
				<h2 class="font-display type-soft text-2xl font-semibold">
					Thank you! We got your payment details
				</h2>
				<p class="max-w-md text-petal-900/70">
					Our florist will check your payment for order #{props.number} and
					update your order once it’s verified.
				</p>
				<Link to="/active-orders" class={`${pillPrimary} mt-3 w-auto px-8`}>
					Check your order
				</Link>
			</section>
		</Shell>
	);
}

function PayForm(props: { order: PayableOrder }) {
	const navigate = useNavigate();
	const [method, setMethod] = createSignal<PaymentMethod | null>(
		props.order.paymentAccounts.some((a) => a.method === props.order.method)
			? props.order.method
			: null,
	);
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [formError, setFormError] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [proof, setProof] = createSignal<{ file: File; url: string } | null>(
		null,
	);
	const clearProof = () => {
		const current = proof();
		if (current) URL.revokeObjectURL(current.url);
		setProof(null);
		setFormError("");
	};
	onCleanup(clearProof);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy()) return;
		const reference = new FormData(event.currentTarget as HTMLFormElement).get(
			"referenceNumber",
		);
		const body = new FormData();
		body.set("number", props.order.number);
		body.set("method", method() ?? "");
		body.set("referenceNumber", typeof reference === "string" ? reference : "");
		const screenshot = proof()?.file;
		if (screenshot) body.set("proof", screenshot);
		setBusy(true);
		setFormError("");
		try {
			const result = await submitOrderPayment({ data: body });
			if (!result.ok) {
				setErrors(result.fieldErrors ?? {});
				if (!result.fieldErrors) setFormError(result.message);
				return;
			}
			await navigate({
				to: "/pay/$orderNumber",
				params: { orderNumber: props.order.number },
				search: { submitted: true },
				replace: true,
			});
		} catch {
			setFormError(
				"We couldn’t send your payment. Check your connection and try again.",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
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
			<Show when={method()}>
				<div class="mt-4">
					<p class="text-sm font-medium">
						Screenshot of your payment{" "}
						<span class="font-normal text-petal-900/50">(optional)</span>
					</p>
					<Show
						when={proof()}
						fallback={
							<label class="mt-2 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-petal-200 text-sm text-petal-900/65 transition-colors focus-within:ring-2 focus-within:ring-petal-500 hover:border-petal-300 hover:bg-petal-50">
								<span aria-hidden="true" class="text-xl leading-none">
									+
								</span>
								Add a screenshot
								<input
									type="file"
									accept="image/png,image/jpeg,image/webp"
									class="sr-only"
									onChange={(e) => {
										const file = e.currentTarget.files?.[0];
										if (file)
											setProof({ file, url: URL.createObjectURL(file) });
										e.currentTarget.value = "";
									}}
								/>
							</label>
						}
					>
						{(chosen) => (
							<div class="mt-2 flex items-center gap-3 rounded-2xl border border-petal-100 p-2">
								<img
									src={chosen().url}
									alt="Your payment screenshot"
									class="size-16 rounded-lg object-cover"
								/>
								<span class="min-w-0 flex-1 truncate text-sm">
									{chosen().file.name}
								</span>
								<button
									type="button"
									onClick={clearProof}
									class="rounded-full px-3 py-2 text-sm font-medium text-error-foreground hover:bg-error"
								>
									Remove
								</button>
							</div>
						)}
					</Show>
				</div>
			</Show>
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
				{busy() ? "Sending…" : "Submit payment"}
			</button>
		</form>
	);
}

function BackToOrders() {
	return (
		<Link
			to="/active-orders"
			class="mt-4 inline-block py-2 font-medium text-petal-700 underline underline-offset-2"
		>
			Back to Check your order
		</Link>
	);
}

function Shell(props: { title?: string; children: JSX.Element }) {
	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
				<h1 class="mb-5 font-display type-soft text-3xl font-semibold tracking-tight">
					{props.title ?? "Pay for your order"}
				</h1>
				{props.children}
			</main>
			<SiteFooter />
		</div>
	);
}
