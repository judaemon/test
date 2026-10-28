import { cn } from "~/lib/utils";
import type { PaymentStatus } from "~/types/order";

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
	rejected: { label: "Payment issue", class: "bg-error text-error-foreground" },
};

export function paymentStatusLabel(status: PaymentStatus) {
	return STATUS[status].label;
}

export function PaymentStatusPill(props: {
	status: PaymentStatus;
	class?: string;
}) {
	return (
		<span
			class={cn(
				"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
				STATUS[props.status].class,
				props.class,
			)}
		>
			{STATUS[props.status].label}
		</span>
	);
}
