import { createServerFn } from "@tanstack/solid-start";

import {
	CADET_CLASSES,
	CIVILIAN,
	CIVILIAN_COLOR,
	COMPANIES,
} from "~/lib/cadets";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "~/lib/payment";
import { savings } from "~/lib/sale";
import {
	isPaymentSettled,
	ORDER_STATUS_LABELS,
	type Order,
	type OrderStatus,
	orderStatus,
	type PaymentStatus,
} from "~/types/order";
import { requireStaff } from "../admin-auth";
import { listOrders } from "../orders-repo";
import { listPaymentAccounts } from "../payments-repo";

/** A group of orders: every number on the page opens its orders. */
export interface OrderGroup {
	orders: number;
	orderIds: string[];
}

export interface CountRow extends OrderGroup {
	label: string;
	/** Company color, for the company breakdown. */
	color?: string;
}

export interface PaymentCell extends OrderGroup {
	amount: number;
}

export interface PaymentRow {
	method: PaymentMethod;
	label: string;
	onHold: PaymentCell;
	pending: PaymentCell;
	paid: PaymentCell;
	rejected: PaymentCell;
	/** Every active order on this method, whatever its payment status. */
	total: PaymentCell;
}

export interface BouquetRow extends OrderGroup {
	code: string;
	name: string;
	image?: string;
	/** Bouquets of it, counting quantities. */
	quantity: number;
	sales: number;
}

/** Just enough of an order to list it when a number is clicked. */
export interface ReportOrder {
	id: string;
	number: string;
	/** "Surname, First name". */
	name: string;
	company: string;
	className: string;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	paymentMethod: PaymentMethod;
	paymentLabel: string;
	/** A cadet's serial number, digits only. */
	serialNumber: string;
	/** Money in hand for it: the total once paid, or a down payment. */
	received: number;
	/** What the shopper typed when they paid. */
	referenceNumber?: string;
	total: number;
	createdAt: string;
	bouquets: { code: string; title: string; quantity: number }[];
	cancelReason?: string;
}

/** The money side of all orders, each figure with the orders behind it. */
export interface MoneySummary {
	/** What active orders come to. */
	ordered: PaymentCell;
	/** Money in hand: paid orders, plus down payments. */
	received: PaymentCell;
	/** Still owed on active orders, whatever stage the payment is at. */
	toCollect: PaymentCell;
	/** Sent, waiting for staff to check the reference number. */
	verifying: PaymentCell;
	/** Ordered, payment not sent yet (cash included). */
	onHold: PaymentCell;
	/** The payment didn't match. */
	rejected: PaymentCell;
	/** Taken off by sales, as customers saw it. */
	saleDiscounts: PaymentCell;
	/** Taken off by order promos, e.g. the 10th order's ₱500. */
	promoDiscounts: PaymentCell;
	/** What cancelled orders came to. */
	cancelled: PaymentCell;
	averageOrder: number;
}

export interface StatusRow extends OrderGroup {
	status: OrderStatus;
	label: string;
	amount: number;
}

export interface Report {
	money: MoneySummary;
	/** Active orders by where they're at: on hold, verifying, being made… */
	byStatus: StatusRow[];
	active: OrderGroup;
	cancelled: OrderGroup;
	bouquets: number;
	sales: number;
	byClass: CountRow[];
	byCompany: CountRow[];
	payments: PaymentRow[];
	byBouquet: BouquetRow[];
	/** Every order the groups point at, active and cancelled. */
	orders: ReportOrder[];
	currency: string;
}

const group = (orders: Order[]): OrderGroup => ({
	orders: orders.length,
	orderIds: orders.map((o) => o.id),
});

/** Totals for the reports page. "Active" means every order that isn't cancelled. */
export const getReport = createServerFn({ method: "GET" }).handler(
	async (): Promise<Report> => {
		await requireStaff();
		// Test orders don't count towards anything.
		const all = listOrders({ limit: 100_000, test: "exclude" });
		const active = all.filter((order) => order.stage !== "cancelled");
		const cancelled = all.filter((order) => order.stage === "cancelled");

		const classLabels: string[] = [...CADET_CLASSES, CIVILIAN];
		const byClass: CountRow[] = classLabels.map((label) => ({
			label,
			...group(active.filter((o) => o.details.className === label)),
		}));
		const unknownClass = active.filter(
			(o) => !classLabels.includes(o.details.className),
		);
		if (unknownClass.length)
			byClass.push({ label: "Not given", ...group(unknownClass) });

		const byCompany: CountRow[] = COMPANIES.map((company) => ({
			label: company.name,
			color: company.color,
			...group(active.filter((o) => o.details.company === company.name)),
		}));
		const noCompany = active.filter((o) => !o.details.company);
		if (noCompany.length)
			byCompany.push({
				label: CIVILIAN,
				color: CIVILIAN_COLOR,
				...group(noCompany),
			});

		// Every method that's offered or has orders: today that's Maribank and GCash.
		const accounts = listPaymentAccounts();
		const methodLabel = (method: PaymentMethod) => {
			const account = accounts.find((a) => a.method === method);
			return method === "bank" && account?.bankName
				? `Bank transfer (${account.bankName})`
				: PAYMENT_METHOD_LABELS[method];
		};
		const methods = new Set<PaymentMethod>([
			...accounts.filter((a) => a.enabled).map((a) => a.method),
			...active.map((o) => o.payment.method),
		]);
		// Money in hand: paid orders, and down payments on orders added from a
		// chat that still owe the rest. Unpaid columns show what's still owed.
		const received = (o: Order) =>
			isPaymentSettled(o.payment.status)
				? o.total
				: Math.min(o.total, o.payment.amountPaid ?? 0);
		const owing = (o: Order) => o.total - received(o);
		const payments: PaymentRow[] = [...methods].map((method) => {
			const orders = active.filter((o) => o.payment.method === method);
			const cell = (
				list: Order[],
				amountOf: (o: Order) => number = (o) => o.total,
			): PaymentCell => ({
				...group(list),
				amount: list.reduce((total, o) => total + amountOf(o), 0),
			});
			const withStatus = (status: Order["payment"]["status"]) =>
				orders.filter((o) => o.payment.status === status);
			return {
				method,
				label: methodLabel(method),
				onHold: cell(withStatus("on_hold"), owing),
				pending: cell(withStatus("pending"), owing),
				paid: cell(
					orders.filter((o) => received(o) > 0),
					received,
				),
				rejected: cell(withStatus("rejected"), owing),
				total: cell(orders),
			};
		});

		const sum = (list: Order[], amountOf: (o: Order) => number) => ({
			...group(list.filter((o) => amountOf(o) > 0)),
			amount:
				Math.round(list.reduce((total, o) => total + amountOf(o), 0) * 100) /
				100,
		});
		const unpaidWith = (status: PaymentStatus) => (o: Order) =>
			o.payment.status === status ? owing(o) : 0;
		const ordered = sum(active, (o) => o.total);
		const money: MoneySummary = {
			ordered,
			received: sum(active, received),
			toCollect: sum(active, owing),
			verifying: sum(active, unpaidWith("pending")),
			onHold: sum(active, unpaidWith("on_hold")),
			rejected: sum(active, unpaidWith("rejected")),
			saleDiscounts: sum(active, (o) => savings(o.lines)),
			promoDiscounts: sum(active, (o) => o.promo?.amount ?? 0),
			cancelled: sum(cancelled, (o) => o.total),
			averageOrder: active.length
				? Math.round((ordered.amount / active.length) * 100) / 100
				: 0,
		};
		const STATUS_ORDER: OrderStatus[] = [
			"on_hold",
			"verifying",
			"payment_check",
			"being_made",
			"done",
		];
		const byStatus: StatusRow[] = STATUS_ORDER.map((status) => {
			const list = active.filter(
				(o) => orderStatus(o.stage, o.payment.status) === status,
			);
			return {
				status,
				label: ORDER_STATUS_LABELS[status],
				...group(list),
				amount: list.reduce((total, o) => total + o.total, 0),
			};
		});

		const bouquets = new Map<string, BouquetRow>();
		for (const order of active) {
			for (const line of order.lines) {
				// Built bouquets differ every time, so they're grouped together.
				const key =
					line.sku === "Custom" ? line.title : `${line.sku}::${line.title}`;
				const row = bouquets.get(key) ?? {
					code: line.sku,
					name: line.title,
					image: line.image,
					orders: 0,
					orderIds: [],
					quantity: 0,
					sales: 0,
				};
				if (!row.orderIds.includes(order.id)) {
					row.orderIds.push(order.id);
					row.orders += 1;
				}
				row.quantity += line.quantity;
				row.sales += line.lineTotal;
				bouquets.set(key, row);
			}
		}

		const orders: ReportOrder[] = all.map((order) => ({
			id: order.id,
			number: order.number,
			name: order.details.lastName
				? `${order.details.lastName}, ${order.details.firstName}`
				: order.details.fullName,
			company: order.details.company,
			className: order.details.className,
			status: orderStatus(order.stage, order.payment.status),
			paymentStatus: order.payment.status,
			paymentMethod: order.payment.method,
			paymentLabel: methodLabel(order.payment.method),
			serialNumber: order.details.serialNumber,
			received: received(order),
			referenceNumber: order.payment.referenceNumber,
			total: order.total,
			createdAt: order.createdAt,
			bouquets: order.lines.map((line) => ({
				code: line.sku,
				title: line.title,
				quantity: line.quantity,
			})),
			cancelReason: order.cancelReason,
		}));

		return {
			money,
			byStatus,
			active: group(active),
			cancelled: group(cancelled),
			bouquets: active.reduce((sum, o) => sum + o.itemCount, 0),
			sales: active.reduce((sum, o) => sum + o.total, 0),
			byClass,
			byCompany,
			payments,
			byBouquet: [...bouquets.values()].sort(
				(a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code),
			),
			orders,
			currency: active[0]?.currency ?? "PHP",
		};
	},
);
