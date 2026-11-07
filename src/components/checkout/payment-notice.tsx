import { cn } from "~/lib/utils";

/**
 * A payment method's warning, set by staff in Admin → Payments, e.g. "You are
 * paying in cash. Please pay before November 10." Hard to miss on purpose.
 */
export function PaymentNotice(props: { text: string; class?: string }) {
	return (
		<p
			role="note"
			class={cn(
				"flex items-start gap-2.5 rounded-2xl border-2 border-warning-foreground/40 bg-warning px-4 py-3 text-sm font-semibold whitespace-pre-line text-warning-foreground",
				props.class,
			)}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="mt-px size-5 shrink-0"
			>
				<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
				<path d="M12 9v4M12 17h.01" />
			</svg>
			<span class="min-w-0 wrap-anywhere">{props.text}</span>
		</p>
	);
}
