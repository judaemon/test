import { cn } from "~/lib/utils";
import {
	ORDER_STATUS_LABELS,
	type OrderStatus,
	type PaymentStatus,
} from "~/types/order";

const STATUS: Record<PaymentStatus, { label: string; class: string }> = {
	paid: { label: "Paid", class: "bg-success text-success-foreground" },
	verified: {
		label: "Payment verified",
		class: "bg-success text-success-foreground",
	},
	pending: {
		label: "Verifying payment",
		class: "bg-warning text-warning-foreground",
	},
	rejected: {
		label: "Needs payment check",
		class: "bg-error text-error-foreground",
	},
	on_hold: { label: "On hold", class: "bg-error text-error-foreground" },
};

export function paymentStatusLabel(status: PaymentStatus) {
	return STATUS[status].label;
}

const PILL =
	"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";

export function PaymentStatusPill(props: {
	status: PaymentStatus;
	class?: string;
}) {
	return (
		<span class={cn(PILL, STATUS[props.status].class, props.class)}>
			{STATUS[props.status].label}
		</span>
	);
}

const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
	on_hold: "bg-error text-error-foreground",
	verifying: "bg-warning text-warning-foreground",
	payment_check: "bg-error text-error-foreground",
	being_made: "bg-petal-100 text-petal-700",
	done: "bg-success text-success-foreground",
	cancelled: "bg-petal-50 text-petal-900/60",
};

export function OrderStatusPill(props: {
	status: OrderStatus;
	class?: string;
}) {
	return (
		<span class={cn(PILL, ORDER_STATUS_CLASS[props.status], props.class)}>
			{ORDER_STATUS_LABELS[props.status]}
		</span>
	);
}
