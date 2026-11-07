import { For, Show } from "solid-js";

import { formatPrice } from "~/lib/product";
import { bestSale, type LineSale, type PublicSale, savings } from "~/lib/sale";
import { useSales } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";

type SaleItem = { productId: string; arrangement?: string };

/** The best live sale for an item at a price, from the shop's sales. */
export function useItemSale(item: () => SaleItem, price: () => number) {
	const sales = useSales();
	return () => bestSale(price(), item(), sales());
}

/** "−5%" or "−₱100": how a sale's tag reads. */
export function saleTag(sale: Pick<PublicSale, "kind" | "value">) {
	return sale.kind === "percent"
		? `−${sale.value}%`
		: `−${formatPrice(sale.value, "PHP")}`;
}

/**
 * A price, lowered by the best live sale that covers the item: the sale price,
 * then the old one struck through and the sale's tag. Just the price when no
 * sale covers it.
 */
export function SalePrice(props: {
	price: number;
	currency: string;
	item: SaleItem;
	/** Classes for the price itself. */
	class?: string;
	/** Smaller struck-through price and tag, for cards. */
	compact?: boolean;
}) {
	const best = useItemSale(
		() => props.item,
		() => props.price,
	);
	return (
		<Show
			when={best()}
			fallback={
				<span class={props.class}>
					{formatPrice(props.price, props.currency)}
				</span>
			}
		>
			{(sale) => (
				<span class="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
					<span class={cn(props.class, "text-sale")}>
						<span class="sr-only">Sale price </span>
						{formatPrice(sale().price, props.currency)}
					</span>
					<s
						class={cn(
							"font-normal text-petal-900/45",
							props.compact ? "text-[0.8em]" : "text-[0.55em]",
						)}
					>
						<span class="sr-only">was </span>
						{formatPrice(sale().original, props.currency)}
					</s>
					<SaleTag sale={sale().sale} compact={props.compact} />
				</span>
			)}
		</Show>
	);
}

export function SaleTag(props: {
	sale: Pick<PublicSale, "kind" | "value">;
	compact?: boolean;
}) {
	return (
		<span
			class={cn(
				"self-center whitespace-nowrap rounded-full bg-sale px-1.5 py-px font-semibold text-white",
				props.compact ? "text-[10px] sm:text-[11px]" : "text-xs",
			)}
		>
			{saleTag(props.sale)}
		</span>
	);
}

/** What a bag's or order's bouquets cost before any sale. */
export function subtotalBeforeSale(cart: {
	subtotal: number;
	lines: readonly {
		originalUnitPrice?: number;
		unitPrice: number;
		quantity: number;
	}[];
}) {
	return Math.round((cart.subtotal + savings(cart.lines)) * 100) / 100;
}

/**
 * The rows of a totals list that show what sales took off, one per sale, for
 * a `<dl>` laid out in two columns. Nothing when no bouquet was on sale.
 */
export function SaleRows(props: {
	lines: readonly {
		originalUnitPrice?: number;
		unitPrice: number;
		quantity: number;
		sale?: LineSale;
	}[];
	currency: string;
}) {
	const bySale = () => {
		const totals = new Map<string, { sale: LineSale; amount: number }>();
		for (const line of props.lines) {
			if (!line.sale) continue;
			const entry = totals.get(line.sale.id) ?? { sale: line.sale, amount: 0 };
			entry.amount += savings([line]);
			totals.set(line.sale.id, entry);
		}
		return [...totals.values()];
	};
	return (
		<For each={bySale()}>
			{(entry) => (
				<>
					<dt class="text-sale">
						{entry.sale.name} <span class="text-xs">({entry.sale.label})</span>
					</dt>
					<dd class="text-right font-medium tabular-nums text-sale">
						−{formatPrice(Math.round(entry.amount * 100) / 100, props.currency)}
					</dd>
				</>
			)}
		</For>
	);
}

/** A bouquet line's total, with what it cost before the sale struck through. */
export function LinePrice(props: {
	line: {
		lineTotal: number;
		quantity: number;
		originalUnitPrice?: number;
		sale?: LineSale;
	};
	currency: string;
	class?: string;
}) {
	return (
		<span class="inline-flex flex-col items-end">
			<span class={cn(props.class, props.line.sale && "text-sale")}>
				{formatPrice(props.line.lineTotal, props.currency)}
			</span>
			<Show when={props.line.sale && props.line.originalUnitPrice}>
				{(original) => (
					<s class="text-xs font-normal text-petal-900/45">
						<span class="sr-only">was </span>
						{formatPrice(
							Math.round(original() * props.line.quantity * 100) / 100,
							props.currency,
						)}
					</s>
				)}
			</Show>
		</span>
	);
}
