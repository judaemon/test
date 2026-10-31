import { createServerFn } from "@tanstack/solid-start";

import {
	CADET_CLASSES,
	CIVILIAN,
	CIVILIAN_COLOR,
	COMPANIES,
} from "~/lib/cadets";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "~/lib/payment";
import {
	isPaymentSettled,
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
	paymentLabel: string;
	/** What the shopper typed when they paid. */
	referenceNumber?: string;
	total: number;
	createdAt: string;
	bouquets: { code: string; title: string; quantity: number }[];
	cancelReason?: string;
}

export interface Report {
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
		const all = listOrders({ limit: 100_000 });
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
		const payments: PaymentRow[] = [...methods].map((method) => {
			const orders = active.filter((o) => o.payment.method === method);
			const cell = (list: Order[]): PaymentCell => ({
				...group(list),
				amount: list.reduce((total, o) => total + o.total, 0),
			});
			return {
				method,
				label: methodLabel(method),
				onHold: cell(orders.filter((o) => o.payment.status === "on_hold")),
				pending: cell(orders.filter((o) => o.payment.status === "pending")),
				paid: cell(orders.filter((o) => isPaymentSettled(o.payment.status))),
				rejected: cell(orders.filter((o) => o.payment.status === "rejected")),
				total: cell(orders),
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
					name:
						line.sku === "Custom"
							? line.title
							: `${line.title} · ${line.colorName}`,
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
			paymentLabel: methodLabel(order.payment.method),
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
