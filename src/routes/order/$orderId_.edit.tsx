import * as Dialog from "@kobalte/core/dialog";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/solid-router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { pillPrimary } from "~/components/cart/cart-sheet";
import {
	type BagBouquet,
	BouquetMessages,
	bagBouquets,
	messageInput,
} from "~/components/checkout/bouquet-messages";
import { ChoiceSelect } from "~/components/checkout/choice-select";
import { ColorSwatch } from "~/components/order/company-label";
import { OrderEmailCheck } from "~/components/order/order-email-check";
import { PreorderTag } from "~/components/product/preorder-tag";
import { LinePrice } from "~/components/shop/sale-price";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { showToast } from "~/components/ui/toast";
import {
	type BouquetMessage,
	type BouquetMessageErrors,
	EMPTY_MESSAGE,
	lineKey,
	parseBouquetMessage,
	unitKey,
} from "~/lib/bouquet-messages";
import {
	CIVILIAN,
	CLASS_LABELS,
	CLASS_OPTIONS,
	COMPANIES,
	companyColor,
} from "~/lib/cadets";
import {
	type CheckoutField,
	EMAIL_MAX,
	type FieldErrors,
	NAME_MAX,
	SERIAL_NUMBER_MAX,
	serialDigits,
} from "~/lib/checkout";
import {
	forgetOrderEmail,
	formatEditDeadline,
	ORDER_EDIT_LOCKED,
	ORDER_EDIT_RULE,
	orderEditState,
	recallOrderEmail,
	rememberOrderEmail,
} from "~/lib/order-edit";
import { type PricedLine, priceCart } from "~/lib/pricing";
import { formatPrice, lineName, MAX_PER_ORDER } from "~/lib/product";
import { useSales } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { getCatalog } from "~/server/catalog";
import { confirmOrderEmail, getOrder, updateMyOrder } from "~/server/orders";
import type { Product } from "~/types/product";

// The address has a private order id; keep it out of search engines.
export const Route = createFileRoute("/order/$orderId_/edit")({
	loader: async ({ params }) => {
		const [order, catalog] = await Promise.all([
			getOrder({ data: params.orderId }),
			getCatalog(),
		]);
		if (!order) throw notFound();
		return { order, products: catalog.products };
	},
	head: () => ({
		meta: [
			{ title: "Edit your order · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: EditOrderPage,
});

function EditOrderPage() {
	const data = Route.useLoaderData();
	const order = () => data().order;
	const state = () => orderEditState(order());
	/** The order's email once it's confirmed; signed-in owners don't need to. */
	const [confirmed, setConfirmed] = createSignal(
		order().ownedByViewer ? order().details.email : "",
	);
	// Still checking an email kept from earlier in this tab.
	const [checking, setChecking] = createSignal(!order().ownedByViewer);
	onMount(async () => {
		const remembered = recallOrderEmail(order().id);
		if (order().ownedByViewer || !remembered || !state().editable) {
			setChecking(false);
			return;
		}
		try {
			const result = await confirmOrderEmail({
				data: { id: order().id, email: remembered },
			});
			if (result.ok) setConfirmed(result.email);
			else forgetOrderEmail(order().id);
		} finally {
			setChecking(false);
		}
	});
	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
				<Link
					to="/order/$orderId"
					params={{ orderId: order().id }}
					class="text-sm font-medium text-petal-700 underline underline-offset-2"
				>
					← Back to your order
				</Link>
				<h1 class="mt-3 font-display type-soft text-4xl font-semibold tracking-tight">
					Edit order #{order().number}
				</h1>
				<Show
					when={state().editable}
					fallback={
						<p class="mt-6 rounded-2xl bg-warning px-4 py-3 text-sm text-warning-foreground">
							{ORDER_EDIT_LOCKED[state().lock ?? "progress"]} Need a change?
							Message us with your order number.
						</p>
					}
				>
					<p class="mt-4 rounded-2xl bg-petal-50 px-4 py-3 text-sm">
						{ORDER_EDIT_RULE} You have until{" "}
						<strong class="font-semibold">
							{formatEditDeadline(state().until)}
						</strong>
						.
					</p>
					<Show
						when={confirmed()}
						fallback={
							<Show when={!checking()} fallback={<CheckingEmail />}>
								<div class="mt-6 rounded-3xl border border-petal-100 bg-white p-6">
									<OrderEmailCheck
										id={order().id}
										onConfirmed={(_, email) => setConfirmed(email)}
									/>
								</div>
							</Show>
						}
					>
						{(email) => (
							<EditForm
								order={order()}
								products={data().products}
								confirmedEmail={email()}
							/>
						)}
					</Show>
				</Show>
			</main>
			<SiteFooter />
		</div>
	);
}

function CheckingEmail() {
	return (
		<output class="mt-6 block text-sm text-petal-900/65">Checking…</output>
	);
}

function EditForm(props: {
	order: NonNullable<Awaited<ReturnType<typeof getOrder>>>;
	products: Product[];
	confirmedEmail: string;
}) {
	const navigate = useNavigate();
	const start = props.order.details;
	const [className, setClassName] = createSignal(start.className);
	const [company, setCompany] = createSignal(start.company);
	const [serialNumber, setSerialNumber] = createSignal(start.serialNumber);
	const [lastName, setLastName] = createSignal(start.lastName);
	const [firstName, setFirstName] = createSignal(start.firstName);
	const [email, setEmail] = createSignal(props.confirmedEmail);
	/** One row per bouquet on the order; quantity 0 means removed. */
	const [items, setItems] = createStore<
		{ line: PricedLine; quantity: number }[]
	>(props.order.lines.map((line) => ({ line, quantity: line.quantity })));
	/** The row choosing a different bouquet, if any. */
	const [swapping, setSwapping] = createSignal<number | null>(null);
	const [search, setSearch] = createSignal("");
	const [messages, setMessages] = createStore<Record<string, BouquetMessage>>(
		Object.fromEntries(
			props.order.lines.flatMap((line) =>
				(line.messages ?? []).map((message, unit) => [
					unitKey(line, unit),
					message,
				]),
			),
		),
	);
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [bouquetErrors, setBouquetErrors] = createSignal<
		Record<string, BouquetMessageErrors>
	>({});
	const [formError, setFormError] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	let formRef!: HTMLFormElement;

	/** The bouquets as edited, without removed ones. */
	const lines = createMemo(() =>
		items
			.filter((item) => item.quantity > 0)
			.map((item) => ({ ...item.line, quantity: item.quantity })),
	);
	const bouquets = createMemo(() => bagBouquets(lines()));
	const total = () =>
		props.order.deliveryFee +
		lines().reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
	const totalCount = () => lines().reduce((sum, l) => sum + l.quantity, 0);
	const original = (key: string) =>
		props.order.lines.find((line) => lineKey(line) === key);

	const sales = useSales();
	/** What can be swapped to: orderable styles not already on another row. */
	const options = createMemo(() => {
		const taken = new Set(items.map((item) => lineKey(item.line)));
		const words = search().trim().toLowerCase();
		return props.products.flatMap((product) =>
			product.variants.flatMap((variant) => {
				const key = lineKey({ productId: product.id, variantId: variant.id });
				if (!variant.inStock || taken.has(key)) return [];
				const [line] = priceCart(
					[{ productId: product.id, variantId: variant.id, quantity: 1 }],
					props.products,
					undefined,
					sales(),
				).lines;
				if (!line) return [];
				return lineName(line).toLowerCase().includes(words) ? [line] : [];
			}),
		);
	});

	const swap = (row: number, picked: PricedLine) => {
		const item = items[row];
		if (!item) return;
		const from = lineKey(item.line);
		const to = lineKey(picked);
		// Back to a bouquet from the order: it keeps the price it was ordered at.
		const line = original(to) ?? picked;
		// Cards and notes stay with the bouquet they were written on.
		for (let unit = 0; unit < MAX_PER_ORDER; unit++) {
			const message = messages[`${from}#${unit}`];
			if (!message) continue;
			setMessages(`${to}#${unit}`, { ...message });
			setMessages(`${from}#${unit}`, undefined as never);
		}
		setItems(row, {
			line,
			quantity: Math.min(
				Math.max(item.quantity, 1),
				original(to) ? MAX_PER_ORDER : line.maxQuantity,
			),
		});
		setBouquetErrors({});
		setFormError("");
		setSwapping(null);
		setSearch("");
	};

	/** Takes one bouquet off, with its card and note; later ones move up. */
	const removeBouquet = (bouquet: BagBouquet) => {
		const key = lineKey(bouquet.line);
		const row = items.findIndex((item) => lineKey(item.line) === key);
		if (row < 0) return;
		for (let unit = bouquet.unit; unit < bouquet.of; unit++) {
			const next = messages[unitKey(bouquet.line, unit + 1)];
			setMessages(
				unitKey(bouquet.line, unit),
				reconcile(next ? { ...next } : { ...EMPTY_MESSAGE }),
			);
		}
		setItems(row, "quantity", bouquet.of - 1);
		setBouquetErrors({});
	};

	const clearError = (field: CheckoutField) =>
		setErrors(({ [field]: _, ...rest }) => rest);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (saving()) return;
		setSaving(true);
		setFormError("");
		try {
			const payloadMessages: Record<string, BouquetMessage[]> = {};
			for (const line of lines()) {
				payloadMessages[lineKey(line)] = Array.from(
					{ length: line.quantity },
					(_, unit) =>
						parseBouquetMessage(messages[unitKey(line, unit)] ?? EMPTY_MESSAGE),
				);
			}
			const result = await updateMyOrder({
				data: {
					id: props.order.id,
					confirmedEmail: props.confirmedEmail,
					details: {
						className: className(),
						company: company(),
						serialNumber: serialNumber(),
						lastName: lastName(),
						firstName: firstName(),
						email: email(),
					},
					items: lines().map((line) => ({
						productId: line.productId,
						variantId: line.variantId,
						quantity: line.quantity,
					})),
					messages: payloadMessages,
				},
			});
			if (!result.ok) {
				setFormError(result.message);
				setErrors(result.fieldErrors ?? {});
				setBouquetErrors(result.bouquetErrors ?? {});
				requestAnimationFrame(() =>
					formRef.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
				);
				return;
			}
			// They may have just changed the email it's checked against.
			rememberOrderEmail(props.order.id, email().trim());
			showToast({ title: "Your order was updated." });
			await navigate({
				to: "/order/$orderId",
				params: { orderId: props.order.id },
			});
		} catch {
			setFormError(
				"We couldn’t save your changes. Check your connection and try again.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<form
			ref={formRef}
			noValidate
			onSubmit={submit}
			class="mt-6 flex flex-col gap-6"
		>
			<section class="rounded-3xl border border-petal-100 bg-white p-6">
				<h2 class="mb-4 font-display type-soft text-xl font-semibold">
					Your bouquets
				</h2>
				<ul class="flex flex-col gap-5">
					<For each={items}>
						{(item, row) => {
							const name = () => lineName(item.line);
							// An order keeps at least one bouquet.
							const isLast = () => totalCount() - item.quantity === 0;
							const limit = () =>
								original(lineKey(item.line))
									? MAX_PER_ORDER
									: item.line.maxQuantity;
							return (
								<li class="flex flex-wrap items-center gap-3">
									<img
										src={item.line.image}
										alt=""
										width={56}
										height={56}
										class={cn(
											"size-14 shrink-0 rounded-xl bg-petal-50 object-cover",
											item.quantity === 0 && "opacity-40",
										)}
									/>
									<div class="min-w-0 flex-1 text-sm">
										<p class="font-medium">{name()}</p>
										<p class="text-petal-900/60">
											{item.quantity === 0
												? "Removed"
												: formatPrice(
														item.line.unitPrice * item.quantity,
														props.order.currency,
													)}
										</p>
									</div>
									<div class="flex items-center gap-1">
										<button
											type="button"
											aria-label={`Fewer ${name()}`}
											disabled={
												item.quantity === 0 || (item.quantity === 1 && isLast())
											}
											onClick={() =>
												setItems(row(), "quantity", item.quantity - 1)
											}
											class="size-10 rounded-full border border-petal-200 bg-white text-lg outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500 disabled:opacity-40"
										>
											−
										</button>
										<span
											aria-live="polite"
											class="w-8 text-center text-sm font-medium tabular-nums"
										>
											{item.quantity}
										</span>
										<button
											type="button"
											aria-label={`More ${name()}`}
											disabled={item.quantity >= limit()}
											onClick={() =>
												setItems(row(), "quantity", item.quantity + 1)
											}
											class="size-10 rounded-full border border-petal-200 bg-white text-lg outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500 disabled:opacity-40"
										>
											+
										</button>
									</div>
									<div class="flex w-full flex-wrap gap-2 sm:pl-[4.25rem]">
										<button
											type="button"
											aria-label={`Change bouquet: ${name()}`}
											onClick={() => setSwapping(row())}
											class="rounded-full border border-petal-200 bg-white px-4 py-2 text-sm font-medium text-petal-700 outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
										>
											Change bouquet
										</button>
										<Show
											when={item.quantity > 0}
											fallback={
												<button
													type="button"
													aria-label={`Undo removing ${name()}`}
													onClick={() =>
														setItems(
															row(),
															"quantity",
															Math.max(item.line.quantity, 1),
														)
													}
													class="rounded-full px-4 py-2 text-sm font-medium text-petal-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
												>
													Undo
												</button>
											}
										>
											<Show when={!isLast()}>
												<button
													type="button"
													aria-label={`Remove ${name()}`}
													onClick={() => setItems(row(), "quantity", 0)}
													class="rounded-full px-4 py-2 text-sm font-medium text-destructive underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
												>
													{item.quantity > 1
														? `Remove all ${item.quantity}`
														: "Remove"}
												</button>
											</Show>
										</Show>
									</div>
								</li>
							);
						}}
					</For>
				</ul>
				<Show when={totalCount() === 1}>
					<p class="mt-4 rounded-xl bg-petal-50 px-3 py-2 text-sm">
						This is the only bouquet on your order, so it can’t be removed. You
						can change it to a different one.
					</p>
				</Show>
				<p class="mt-4 flex justify-between border-t border-petal-100 pt-4 font-semibold">
					<span>New total</span>
					<span class="tabular-nums">
						{formatPrice(total(), props.order.currency)}
					</span>
				</p>
				<Show when={total() !== props.order.total}>
					<p class="mt-1 text-right text-sm text-petal-900/60">
						Was {formatPrice(props.order.total, props.order.currency)}. Pay the
						new total when you send your payment.
					</p>
				</Show>
			</section>

			<Dialog.Root
				open={swapping() !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSwapping(null);
						setSearch("");
					}
				}}
			>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/40" />
					<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
						<Dialog.Content class="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white text-petal-900 shadow-xl sm:rounded-3xl">
							<div class="border-b border-petal-100 p-5">
								<Dialog.Title class="font-display type-soft text-xl font-semibold">
									Choose a different bouquet
								</Dialog.Title>
								<Dialog.Description class="mt-1 text-sm text-petal-900/65">
									Your card and note stay with it. It’s charged at the price
									shown here.
								</Dialog.Description>
								<input
									type="search"
									value={search()}
									onInput={(e) => setSearch(e.currentTarget.value)}
									placeholder="Search bouquets"
									aria-label="Search bouquets"
									class={cn(messageInput, "mt-3 h-11")}
								/>
							</div>
							<ul class="min-h-0 flex-1 overflow-y-auto p-3">
								<For
									each={options()}
									fallback={
										<li class="p-4 text-center text-sm text-petal-900/60">
											No other bouquets match.
										</li>
									}
								>
									{(line) => (
										<li>
											<button
												type="button"
												onClick={() => {
													const row = swapping();
													if (row !== null) swap(row, line);
												}}
												class="flex w-full items-center gap-3 rounded-2xl p-2 text-left outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
											>
												<img
													src={line.image}
													alt=""
													width={56}
													height={56}
													loading="lazy"
													class="size-14 shrink-0 rounded-xl bg-petal-50 object-cover"
												/>
												<span class="min-w-0 flex-1 text-sm">
													<span class="block font-medium">
														{lineName(line)}
													</span>
													<Show when={line.preorder}>
														<PreorderTag readyBy={line.readyBy} class="mt-1" />
													</Show>
												</span>
												<span class="text-sm font-medium tabular-nums">
													<LinePrice
														line={line}
														currency={props.order.currency}
													/>
												</span>
											</button>
										</li>
									)}
								</For>
							</ul>
							<div class="border-t border-petal-100 p-3">
								<Dialog.CloseButton class="h-11 w-full rounded-full border border-petal-200 bg-white text-sm font-medium outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500">
									Keep this bouquet
								</Dialog.CloseButton>
							</div>
						</Dialog.Content>
					</div>
				</Dialog.Portal>
			</Dialog.Root>

			<section class="flex flex-col gap-4 rounded-3xl border border-petal-100 bg-white p-6">
				<h2 class="font-display type-soft text-xl font-semibold">
					Your details
				</h2>
				<ChoiceSelect
					name="className"
					label="Class"
					placeholder="Choose your class"
					options={CLASS_OPTIONS}
					optionLabel={(value) =>
						CLASS_LABELS[value as keyof typeof CLASS_LABELS] ?? value
					}
					value={className()}
					onChange={(value) => {
						setClassName(value);
						if (value === CIVILIAN) {
							setCompany("");
							setSerialNumber("");
						}
						clearError("className");
						clearError("company");
						clearError("serialNumber");
					}}
					error={errors().className}
				/>
				<ChoiceSelect
					name="company"
					label="Company"
					placeholder={
						className() === CIVILIAN
							? "Not needed for civilians"
							: "Choose your company"
					}
					options={COMPANIES.map((option) => option.name)}
					optionPrefix={(value) => <ColorSwatch color={companyColor(value)} />}
					value={company()}
					onChange={(value) => {
						setCompany(value);
						clearError("company");
					}}
					disabled={className() === CIVILIAN}
					error={errors().company}
				/>
				<TextInput
					label="Serial number (digits after C-)"
					value={serialNumber()}
					maxLength={SERIAL_NUMBER_MAX}
					disabled={className() === CIVILIAN}
					inputMode="numeric"
					error={errors().serialNumber}
					onInput={(value) => {
						setSerialNumber(serialDigits(value));
						clearError("serialNumber");
					}}
				/>
				<TextInput
					label="Last name"
					value={lastName()}
					maxLength={NAME_MAX}
					error={errors().lastName}
					onInput={(value) => {
						setLastName(value);
						clearError("lastName");
					}}
				/>
				<TextInput
					label="First name"
					value={firstName()}
					maxLength={NAME_MAX}
					error={errors().firstName}
					onInput={(value) => {
						setFirstName(value);
						clearError("firstName");
					}}
				/>
				<TextInput
					label="Email"
					type="email"
					value={email()}
					maxLength={EMAIL_MAX}
					error={errors().email}
					onInput={(value) => {
						setEmail(value);
						clearError("email");
					}}
				/>
			</section>

			<section class="rounded-3xl border border-petal-100 bg-white p-6">
				<h2 class="mb-4 font-display type-soft text-xl font-semibold">
					{bouquets().length > 1 ? "Cards & notes" : "Card & note"}
				</h2>
				<BouquetMessages
					bouquets={bouquets()}
					messages={messages}
					onChange={(key, patch) =>
						setMessages(key, (current) => ({
							...(current ?? EMPTY_MESSAGE),
							...patch,
						}))
					}
					onRemove={removeBouquet}
					errors={bouquetErrors()}
					clearError={(key, field) =>
						setBouquetErrors(({ [key]: current, ...rest }) => {
							const { [field]: _, ...left } = current ?? {};
							return Object.keys(left).length ? { ...rest, [key]: left } : rest;
						})
					}
				/>
			</section>

			<Show when={formError()}>
				<p
					role="alert"
					class="rounded-2xl bg-error px-4 py-3 text-sm text-error-foreground"
				>
					{formError()}
				</p>
			</Show>

			<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
				<Link
					to="/order/$orderId"
					params={{ orderId: props.order.id }}
					class="inline-flex h-12 items-center justify-center rounded-full border border-petal-200 bg-white px-8 text-base font-medium outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					Keep it as it is
				</Link>
				<button
					type="submit"
					disabled={saving()}
					class={cn(pillPrimary, "w-auto px-8")}
				>
					{saving() ? "Saving…" : "Save changes"}
				</button>
			</div>
		</form>
	);
}

function TextInput(props: {
	label: string;
	value: string;
	type?: "text" | "email";
	maxLength: number;
	disabled?: boolean;
	inputMode?: "numeric";
	error?: string;
	onInput: (value: string) => void;
}) {
	return (
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium">{props.label}</span>
			<input
				type={props.type ?? "text"}
				value={props.value}
				maxLength={props.maxLength}
				disabled={props.disabled}
				inputMode={props.inputMode}
				aria-invalid={props.error ? "true" : undefined}
				onInput={(e) => props.onInput(e.currentTarget.value)}
				class={cn(messageInput, "h-11 disabled:opacity-50")}
			/>
			<Show when={props.error}>
				<span class="text-xs text-destructive">{props.error}</span>
			</Show>
		</label>
	);
}
