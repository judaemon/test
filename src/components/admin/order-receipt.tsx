import { For, Show } from "solid-js";

import { orderMessages } from "~/lib/bouquet-messages";
import { shortDeliveryDate } from "~/lib/delivery-dates";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice, lineName } from "~/lib/product";
import { ORDER_STATUS_LABELS, type Order, orderStatus } from "~/types/order";

/** "Nov 16, 3:42 PM", Manila time. */
const placedAt = (iso: string) =>
	new Date(iso).toLocaleString("en-US", {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

function Rule() {
	return <div class="my-[1.5mm] border-t border-dashed border-black" />;
}

/**
 * One order as a slip for a small receipt (thermal) printer: black only,
 * no photos, as wide as the paper roll.
 */
export function OrderReceipt(props: { order: Order; width: number }) {
	const order = () => props.order;
	const details = () => order().details;
	const messages = () => orderMessages(order());
	const forLine = (index: number) =>
		messages().filter((message) => message.lineIndex === index);
	const orderWide = () =>
		messages().filter((message) => message.lineIndex === undefined);
	const money = (amount: number) => formatPrice(amount, order().currency);
	const cadet = () =>
		[
			details().company,
			details().className,
			details().serialNumber && `C-${details().serialNumber}`,
		]
			.filter(Boolean)
			.join(" · ");

	return (
		<article
			class="receipt break-inside-avoid font-mono text-black"
			style={{
				width: `${props.width}mm`,
				padding: "2mm 2.5mm 6mm",
				"font-size": props.width < 70 ? "9pt" : "10.5pt",
				"line-height": 1.3,
			}}
		>
			<p class="text-center text-[1.1em] font-bold tracking-widest">ORAIA</p>
			<p class="text-center text-[1.5em] font-bold">Order #{order().number}</p>
			<p class="text-center">{placedAt(order().createdAt)}</p>
			<Show when={order().isTest}>
				<p class="text-center font-bold">** TEST ORDER **</p>
			</Show>
			<Rule />
			<p class="font-bold">{details().fullName}</p>
			<Show when={cadet()}>
				<p>{cadet()}</p>
			</Show>
			<p>
				Deliver:{" "}
				<b>
					{details().deliveryDate
						? shortDeliveryDate(details().deliveryDate as string)
						: "No date yet"}
				</b>
			</p>
			<Rule />
			<For each={order().lines}>
				{(line, index) => (
					<div class="mb-[1.5mm]">
						<div class="flex justify-between gap-2">
							<span class="font-bold">
								{line.quantity}× {lineName(line)}
							</span>
							<span class="shrink-0">{money(line.lineTotal)}</span>
						</div>
						<Show when={line.sizeName}>
							<p>Size: {line.sizeName}</p>
						</Show>
						<Show when={line.wrapperColor}>
							<p>Wrapper: {line.wrapperColor}</p>
						</Show>
						<Show when={line.preorder}>
							<p>
								Pre-order
								{line.readyBy
									? `, ready ${shortDeliveryDate(line.readyBy)}`
									: ""}
							</p>
						</Show>
						<For each={forLine(index())}>
							{(message) => <Message message={message} />}
						</For>
					</div>
				)}
			</For>
			<For each={orderWide()}>{(message) => <Message message={message} />}</For>
			<Rule />
			<Show when={order().promo}>
				{(promo) => (
					<div class="flex justify-between">
						<span>Promo</span>
						<span>−{money(promo().amount)}</span>
					</div>
				)}
			</Show>
			<div class="flex justify-between text-[1.15em] font-bold">
				<span>Total</span>
				<span>{money(order().total)}</span>
			</div>
			<p>
				{PAYMENT_METHOD_LABELS[order().payment.method]} ·{" "}
				{
					ORDER_STATUS_LABELS[
						orderStatus(order().stage, order().payment.status)
					]
				}
			</p>
		</article>
	);
}

function Message(props: {
	message: {
		to: string;
		message: string;
		note: string;
		of?: number;
		unit?: number;
	};
}) {
	return (
		<div class="mt-[1mm] border-l-2 border-black pl-[1.5mm]">
			<Show when={(props.message.of ?? 1) > 1}>
				<p class="font-bold">
					Bouquet {(props.message.unit ?? 0) + 1} of {props.message.of}
				</p>
			</Show>
			<Show when={props.message.to}>
				<p>To: {props.message.to}</p>
			</Show>
			<Show when={props.message.message}>
				<p class="whitespace-pre-wrap">Card: “{props.message.message}”</p>
			</Show>
			<Show when={props.message.note}>
				<p class="whitespace-pre-wrap">Note: {props.message.note}</p>
			</Show>
		</div>
	);
}
