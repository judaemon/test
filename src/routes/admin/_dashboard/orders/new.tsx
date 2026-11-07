import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
	draftStems,
	type RecipeDraft,
	RecipeRows,
	toRecipeDraft,
} from "~/components/admin/recipe-rows";
import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { WrapperSelect } from "~/components/admin/wrapper-select";
import {
	CIVILIAN,
	CLASS_LABELS,
	CLASS_OPTIONS,
	COMPANIES,
	isCadetClass,
} from "~/lib/cadets";
import {
	CHAT_MESSAGE_MAX,
	CHAT_PHOTOS_MAX,
	CONTACT_PLATFORM_LABELS,
	CONTACT_PLATFORMS,
	type ContactPlatform,
} from "~/lib/chat-order";
import {
	type CheckoutField,
	DEDICATION_MESSAGE_MAX,
	EMAIL_MAX,
	type FieldErrors,
	NAME_MAX,
	SERIAL_NUMBER_MAX,
	serialDigits,
} from "~/lib/checkout";
import {
	PAYMENT_METHOD_LABELS,
	PAYMENT_METHODS,
	type PaymentMethod,
} from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { useCustomSettings } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import {
	createChatOrderFn,
	getChatOrderAdmin,
	updateChatOrderFn,
} from "~/server/admin/orders";

interface ChatOrderSearch {
	/** An order added from a chat: change it instead of adding one. */
	edit?: string;
}

export const Route = createFileRoute("/admin/_dashboard/orders/new")({
	validateSearch: (search: Record<string, unknown>): ChatOrderSearch => ({
		edit: typeof search.edit === "string" ? search.edit : undefined,
	}),
	loaderDeps: ({ search }) => ({ edit: search.edit }),
	loader: async ({ deps }) => {
		if (!deps.edit) return null;
		const order = await getChatOrderAdmin({ data: deps.edit });
		if (!order) throw notFound();
		return order;
	},
	component: NewChatOrder,
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * An order taken in a chat: the customer, their message, photos, wrapper,
 * total and deposit. With `?edit=<order id>`, changes that order instead.
 */
function NewChatOrder() {
	const navigate = useNavigate();
	const router = useRouter();
	// The order being edited, read once: the form keeps its own copy.
	const editing = Route.useLoaderData()();
	const details = editing?.details;
	const line = editing?.lines[0];
	const [message, setMessage] = createSignal(details?.notes ?? "");
	const [total, setTotal] = createSignal(editing ? String(editing.total) : "");
	const [paid, setPaid] = createSignal(
		editing?.payment.amountPaid ? String(editing.payment.amountPaid) : "",
	);
	const [method, setMethod] = createSignal<PaymentMethod>(
		editing?.payment.method ?? "gcash",
	);
	const [platform, setPlatform] = createSignal<ContactPlatform | "">(
		line?.contactPlatform ?? "",
	);
	// Photos already on the order (no file) and new ones (a file to upload).
	const [photos, setPhotos] = createSignal<{ file?: File; url: string }[]>(
		(line?.custom?.referenceImages ?? []).map((url) => ({ url })),
	);
	const [saving, setSaving] = createSignal(false);
	/**
	 * Server rendering leaves a textarea's text out and hydration doesn't add
	 * it, so a refreshed edit page would start empty; set it once loaded.
	 */
	const startingText = (text: () => string) => (el: HTMLTextAreaElement) =>
		onMount(() => {
			el.value = text();
		});
	// What checkout asks every customer for, plus the optional card.
	const [customer, setCustomer] = createStore({
		firstName: details?.firstName ?? "",
		lastName: details?.lastName ?? "",
		email: details?.email ?? "",
		className: details?.className ?? "",
		company: details?.company ?? "",
		serialNumber: details?.serialNumber ?? "",
		dedicationFor: details?.dedicationFor ?? "",
		dedicationMessage: details?.dedicationMessage ?? "",
	});
	type CustomerField = keyof typeof customer;
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const setField = (field: CustomerField, value: string) => {
		setCustomer(field, value);
		setErrors(({ [field as CheckoutField]: _cleared, ...rest }) => rest);
	};
	const cadet = () => isCadetClass(customer.className);
	const [wrapperId, setWrapperId] = createSignal(line?.custom?.wrapperId ?? "");
	const custom = useCustomSettings();
	const wrappers = () => custom().wrappers;
	// The flowers it's made of, like a signature bouquet's recipe.
	const [recipe, setRecipe] = createStore<{ rows: RecipeDraft[] }>({
		rows: toRecipeDraft(line?.recipe ?? []),
	});

	const addPhotos = (files: Iterable<File>) => {
		const room = CHAT_PHOTOS_MAX - photos().length;
		const chosen = [...files]
			.filter((file) => IMAGE_TYPES.includes(file.type))
			.slice(0, Math.max(0, room));
		if (!chosen.length) return;
		setPhotos((list) => [
			...list,
			...chosen.map((file) => ({ file, url: URL.createObjectURL(file) })),
		]);
	};
	const removePhoto = (url: string) => {
		if (url.startsWith("blob:")) URL.revokeObjectURL(url);
		setPhotos((list) => list.filter((p) => p.url !== url));
	};
	onCleanup(() => {
		for (const photo of photos())
			if (photo.file) URL.revokeObjectURL(photo.url);
	});

	const totalAmount = () => Number(total()) || 0;
	const paidAmount = () => Number(paid()) || 0;
	const balance = () => Math.max(0, totalAmount() - paidAmount());

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (saving()) return;
		const body = new FormData();
		body.set("message", message());
		body.set("total", total());
		body.set("paid", paid());
		body.set("method", method());
		body.set("contactPlatform", platform());
		body.set("wrapperId", wrapperId());
		body.set(
			"recipe",
			JSON.stringify(
				recipe.rows
					.filter((row) => row.flower)
					.map((row) => ({
						flower: row.flower,
						color: row.color,
						count: Number(row.count),
						filler: row.filler,
					})),
			),
		);
		for (const [field, value] of Object.entries(customer))
			body.set(field, value);
		for (const photo of photos())
			if (photo.file) body.append("photos", photo.file);
			else body.append("keptPhotos", photo.url);
		if (editing) body.set("id", editing.id);
		setSaving(true);
		try {
			const result = editing
				? await updateChatOrderFn({ data: body })
				: await createChatOrderFn({ data: body });
			if (!result.ok) {
				setErrors(result.fieldErrors ?? {});
				throw new Error(result.message);
			}
			if (editing) {
				toastSuccess(`Order #${result.number} updated.`);
				await leave(() =>
					navigate({
						to: "/admin/orders/$orderId",
						params: { orderId: result.id },
						replace: true,
					}),
				);
			} else {
				toastSuccess(`Order #${result.number} added.`);
				await leave(() => navigate({ to: "/admin/orders", replace: true }));
			}
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	/**
	 * Leaves the form by stepping back to the page that opened it, so Back
	 * afterwards doesn't land on the form again. Opened in a fresh tab, there
	 * is nothing to go back to and `fallback` replaces the form instead.
	 */
	const leave = async (fallback: () => Promise<void>) => {
		if (router.history.canGoBack()) router.history.back();
		else await fallback();
	};
	/** For the back and Cancel links: step back instead of adding a page. */
	const stepBack = (event: MouseEvent) => {
		if (!router.history.canGoBack()) return;
		event.preventDefault();
		router.history.back();
	};

	/** A text box for one customer field, with checkout's error under it. */
	const TextField = (props: {
		label: string;
		field: CustomerField;
		type?: string;
		maxLength: number;
		autocomplete?: string;
	}) => (
		<div class="grid gap-1">
			<Field label={props.label}>
				<input
					type={props.type ?? "text"}
					value={customer[props.field]}
					onInput={(e) => setField(props.field, e.currentTarget.value)}
					maxLength={props.maxLength}
					autocomplete={props.autocomplete}
					class={adminInput}
				/>
			</Field>
			<FieldError message={errors()[props.field as CheckoutField]} />
		</div>
	);

	return (
		<form
			onSubmit={save}
			// Photos copied from Messenger or Telegram can be pasted anywhere here.
			onPaste={(event) => {
				const files = [...(event.clipboardData?.files ?? [])];
				if (!files.some((file) => IMAGE_TYPES.includes(file.type))) return;
				event.preventDefault();
				addPhotos(files);
			}}
			class="mx-auto max-w-3xl pb-24"
		>
			<Show
				when={editing}
				fallback={
					<Link
						to="/admin/orders"
						replace
						onClick={stepBack}
						class={cn(adminButton.ghost, "-ml-2 mb-2")}
					>
						← Orders
					</Link>
				}
			>
				{(order) => (
					<Link
						to="/admin/orders/$orderId"
						params={{ orderId: order().id }}
						replace
						onClick={stepBack}
						class={cn(adminButton.ghost, "-ml-2 mb-2")}
					>
						← Order #{order().number}
					</Link>
				)}
			</Show>
			<PageHeader
				title={
					editing ? `Edit custom order #${editing.number}` : "Add custom order"
				}
				description={
					editing
						? "Change anything here, then save. A different wrapper puts the old one back in stock and takes the new one."
						: "For an order taken in a chat. Paste the customer’s message as it is: it becomes the order’s notes. Fill in the customer the way checkout would. The wrapper you pick comes out of stock; flowers don’t."
				}
			/>

			<section class={cn(adminCard, "mb-5 grid gap-4 p-5")}>
				<h2 class="font-semibold">Customer</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<TextField
						label="First name"
						field="firstName"
						maxLength={NAME_MAX}
						autocomplete="off"
					/>
					<TextField
						label="Last name"
						field="lastName"
						maxLength={NAME_MAX}
						autocomplete="off"
					/>
					<div class="grid gap-1">
						<Field label="Class">
							<select
								value={customer.className}
								onChange={(e) => {
									setField("className", e.currentTarget.value);
									// Civilians don't have a company or a serial number.
									if (!isCadetClass(e.currentTarget.value)) {
										setField("company", "");
										setField("serialNumber", "");
									}
								}}
								class={adminInput}
							>
								<option value="" disabled selected={!customer.className}>
									Choose a class
								</option>
								<For each={CLASS_OPTIONS}>
									{(value) => (
										<option
											value={value}
											selected={customer.className === value}
										>
											{CLASS_LABELS[value]}
										</option>
									)}
								</For>
							</select>
						</Field>
						<FieldError message={errors().className} />
					</div>
					<div class="grid gap-1">
						<Field label="Company">
							<select
								value={customer.company}
								onChange={(e) => setField("company", e.currentTarget.value)}
								disabled={!cadet()}
								class={adminInput}
							>
								<option value="" disabled selected={!customer.company}>
									{customer.className === CIVILIAN
										? "Not a cadet"
										: "Choose a company"}
								</option>
								<For each={COMPANIES}>
									{(company) => (
										<option
											value={company.name}
											selected={customer.company === company.name}
										>
											{company.name}
										</option>
									)}
								</For>
							</select>
						</Field>
						<FieldError message={errors().company} />
					</div>
					<Show when={cadet()}>
						<div class="grid gap-1">
							<Field
								label="Serial number"
								hint="Digits only, e.g. 12345 for C-12345."
							>
								<input
									value={customer.serialNumber}
									onInput={(e) =>
										setField(
											"serialNumber",
											serialDigits(e.currentTarget.value),
										)
									}
									inputMode="numeric"
									maxLength={SERIAL_NUMBER_MAX}
									class={cn(adminInput, "tabular-nums")}
								/>
							</Field>
							<FieldError message={errors().serialNumber} />
						</div>
					</Show>
					<TextField
						label="Email"
						field="email"
						type="email"
						maxLength={EMAIL_MAX}
						autocomplete="off"
					/>
				</div>
			</section>

			<section class={cn(adminCard, "grid gap-5 p-5")}>
				<Field label="Contacted via">
					<select
						value={platform()}
						onChange={(e) =>
							setPlatform(e.currentTarget.value as ContactPlatform)
						}
						required
						class={adminInput}
					>
						<option value="" disabled selected={!platform()}>
							Where did they message you?
						</option>
						<For each={CONTACT_PLATFORMS}>
							{(value) => (
								<option value={value} selected={platform() === value}>
									{CONTACT_PLATFORM_LABELS[value]}
								</option>
							)}
						</For>
					</select>
				</Field>
				<Field
					label="Chat message from the customer"
					hint="Name, class, company, flowers, payment details: whatever they sent."
				>
					<textarea
						ref={startingText(message)}
						value={message()}
						onInput={(e) => setMessage(e.currentTarget.value)}
						required
						rows={10}
						maxLength={CHAT_MESSAGE_MAX}
						placeholder={
							"e.g.\n60 stem red roses with gypsophilia bouquet\nBravo 1CL\nSarmiento MJ"
						}
						class={cn(adminInput, "h-auto py-2 leading-relaxed sm:h-auto")}
					/>
				</Field>

				<div>
					<p class="text-sm font-medium">
						Photos{" "}
						<span class="font-normal text-petal-900/55">
							(optional, up to {CHAT_PHOTOS_MAX})
						</span>
					</p>
					<ul class="mt-1.5 grid grid-cols-3 gap-3 sm:grid-cols-5">
						<For each={photos()}>
							{(photo, index) => (
								<li class="relative">
									<img
										src={photo.url}
										alt={`Chat attachment ${index() + 1}`}
										class="aspect-square w-full rounded-xl border border-black/10 object-cover"
									/>
									<button
										type="button"
										onClick={() => removePhoto(photo.url)}
										aria-label={`Remove photo ${index() + 1}`}
										class="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-white/90 text-lg leading-none shadow outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-petal-500"
									>
										×
									</button>
								</li>
							)}
						</For>
						<Show when={photos().length < CHAT_PHOTOS_MAX}>
							<li>
								<label class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-petal-200 px-2 text-center text-xs text-petal-900/65 transition-colors focus-within:ring-2 focus-within:ring-petal-500 hover:border-petal-300 hover:bg-petal-50">
									<span aria-hidden="true" class="text-xl leading-none">
										+
									</span>
									Add a photo
									<input
										type="file"
										accept={IMAGE_TYPES.join(",")}
										multiple
										class="sr-only"
										onChange={(e) => {
											addPhotos(e.currentTarget.files ?? []);
											e.currentTarget.value = "";
										}}
									/>
								</label>
							</li>
						</Show>
					</ul>
					<p class="mt-1.5 text-xs text-petal-900/55">
						You can also paste a copied photo here.
					</p>
				</div>

				<div class="grid gap-1.5">
					<p class="text-sm font-medium">
						Wrapper{" "}
						<span class="font-normal text-petal-900/55">
							(the one to make it with)
						</span>
					</p>
					<WrapperSelect
						label="Wrapper"
						wrappers={wrappers()}
						value={wrapperId()}
						onChange={setWrapperId}
					/>
				</div>

				<div class="grid gap-1.5">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="text-sm font-medium">
							Flowers{" "}
							<span class="font-normal text-petal-900/55">
								(what it’s made of, for Reports → Flowers to buy)
							</span>
						</p>
						<Show when={draftStems(recipe.rows)}>
							<span class="text-sm tabular-nums text-petal-900/70">
								{draftStems(recipe.rows)} flowers
							</span>
						</Show>
					</div>
					<RecipeRows
						rows={recipe.rows}
						onPatch={(row, patch) => setRecipe("rows", row, patch)}
						onChange={(rows) => setRecipe("rows", rows)}
						addLabel={recipe.rows.length ? "+ Add flower" : "+ Add the flowers"}
					/>
				</div>

				<div class="grid gap-4 sm:grid-cols-3">
					<Field label="Total (₱)">
						<input
							type="number"
							min="1"
							step="0.01"
							inputMode="decimal"
							value={total()}
							onInput={(e) => setTotal(e.currentTarget.value)}
							required
							placeholder="e.g. 5500"
							class={cn(adminInput, "tabular-nums")}
						/>
					</Field>
					<Field label="Paid so far (₱)" hint="0 or empty if nothing yet.">
						<input
							type="number"
							min="0"
							max={total() || undefined}
							step="0.01"
							inputMode="decimal"
							value={paid()}
							onInput={(e) => setPaid(e.currentTarget.value)}
							placeholder="e.g. 2500"
							class={cn(adminInput, "tabular-nums")}
						/>
					</Field>
					<Field label="Paid by">
						<select
							value={method()}
							onChange={(e) =>
								setMethod(e.currentTarget.value as PaymentMethod)
							}
							class={adminInput}
						>
							<For each={PAYMENT_METHODS}>
								{(value) => (
									<option value={value} selected={method() === value}>
										{PAYMENT_METHOD_LABELS[value]}
									</option>
								)}
							</For>
						</select>
					</Field>
				</div>
				<Show when={totalAmount() > 0}>
					<p class="text-sm text-petal-900/70">
						{balance() > 0
							? `${formatPrice(balance(), "PHP")} still to pay. The order waits as On hold until you mark the payment verified.`
							: "Paid in full: the payment is marked verified."}
					</p>
				</Show>
			</section>

			<section class={cn(adminCard, "mt-5 grid gap-4 p-5")}>
				<div>
					<h2 class="font-semibold">
						Dedication card{" "}
						<span class="text-sm font-normal text-petal-900/55">
							(optional)
						</span>
					</h2>
					<p class="text-xs text-petal-900/55">
						With a message, the order gets a card you can print from the orders
						list.
					</p>
				</div>
				<TextField
					label="To (optional)"
					field="dedicationFor"
					maxLength={NAME_MAX}
					autocomplete="off"
				/>
				<div class="grid gap-1">
					<Field label="Card message">
						<textarea
							ref={startingText(() => customer.dedicationMessage)}
							value={customer.dedicationMessage}
							onInput={(e) =>
								setField("dedicationMessage", e.currentTarget.value)
							}
							rows={4}
							maxLength={DEDICATION_MESSAGE_MAX}
							class={cn(adminInput, "h-auto py-2 leading-relaxed sm:h-auto")}
						/>
					</Field>
					<FieldError message={errors().dedicationMessage} />
				</div>
			</section>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Show
						when={editing}
						fallback={
							<Link
								to="/admin/orders"
								replace
								onClick={stepBack}
								class={adminButton.secondary}
							>
								Cancel
							</Link>
						}
					>
						{(order) => (
							<Link
								to="/admin/orders/$orderId"
								params={{ orderId: order().id }}
								replace
								onClick={stepBack}
								class={adminButton.secondary}
							>
								Cancel
							</Link>
						)}
					</Show>
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : editing ? "Save changes" : "Save order"}
					</button>
				</div>
			</div>
		</form>
	);
}

function FieldError(props: { message?: string }) {
	return (
		<Show when={props.message}>
			<span role="alert" class="text-xs text-error-foreground">
				{props.message}
			</span>
		</Show>
	);
}
