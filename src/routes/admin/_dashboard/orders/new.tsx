import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createSignal, For, onCleanup, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { CHAT_MESSAGE_MAX, CHAT_PHOTOS_MAX } from "~/lib/chat-order";
import {
	PAYMENT_METHOD_LABELS,
	PAYMENT_METHODS,
	type PaymentMethod,
} from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { cn } from "~/lib/utils";
import { createChatOrderFn } from "~/server/admin/orders";

export const Route = createFileRoute("/admin/_dashboard/orders/new")({
	component: NewChatOrder,
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** An order taken in a chat: the customer's message, photos, total and deposit. */
function NewChatOrder() {
	const navigate = useNavigate();
	const [message, setMessage] = createSignal("");
	const [total, setTotal] = createSignal("");
	const [paid, setPaid] = createSignal("");
	const [method, setMethod] = createSignal<PaymentMethod>("gcash");
	const [photos, setPhotos] = createSignal<{ file: File; url: string }[]>([]);
	const [saving, setSaving] = createSignal(false);

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
		URL.revokeObjectURL(url);
		setPhotos((list) => list.filter((p) => p.url !== url));
	};
	onCleanup(() => {
		for (const photo of photos()) URL.revokeObjectURL(photo.url);
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
		for (const photo of photos()) body.append("photos", photo.file);
		setSaving(true);
		try {
			const result = await createChatOrderFn({ data: body });
			if (!result.ok) throw new Error(result.message);
			toastSuccess(`Order #${result.number} added.`);
			await navigate({ to: "/admin/orders" });
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

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
			<Link to="/admin/orders" class={cn(adminButton.ghost, "-ml-2 mb-2")}>
				← Orders
			</Link>
			<PageHeader
				title="Add custom order"
				description="For an order taken in a chat. Paste the customer’s message as it is: it becomes the order’s notes. It doesn’t take flowers or wrappers from stock."
			/>

			<section class={cn(adminCard, "grid gap-5 p-5")}>
				<Field
					label="Chat message from the customer"
					hint="Name, class, company, flowers, payment details: whatever they sent."
				>
					<textarea
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
									<option value={value}>{PAYMENT_METHOD_LABELS[value]}</option>
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

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
				<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
					<Link to="/admin/orders" class={adminButton.secondary}>
						Cancel
					</Link>
					<button type="submit" class={adminButton.primary} disabled={saving()}>
						{saving() ? "Saving…" : "Save order"}
					</button>
				</div>
			</div>
		</form>
	);
}
