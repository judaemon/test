import { MinusIcon, PlusIcon } from "~/components/product/icons";
import { cn } from "~/lib/utils";

interface QuantityStepperProps {
	value: number;
	max: number;
	/** Names the item in button labels, e.g. "Red Velvet". */
	itemLabel: string;
	onChange: (value: number) => void;
	class?: string;
}

const stepButton =
	"flex size-8 items-center justify-center rounded-full text-petal-900/70 transition-colors hover:bg-petal-100 hover:text-petal-900 disabled:pointer-events-none disabled:opacity-35 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

/** Compact −/+ control for bag lines. Going below 1 is left to "Remove". */
export function QuantityStepper(props: QuantityStepperProps) {
	let decrementRef: HTMLButtonElement | undefined;
	let incrementRef: HTMLButtonElement | undefined;

	// A button that disables itself drops focus to <body>, which strands
	// keyboard users outside the dialog; hand focus to the other button instead.
	const step = (delta: number) => {
		const next = props.value + delta;
		props.onChange(next);
		if (delta < 0 && next <= 1) incrementRef?.focus();
		if (delta > 0 && next >= props.max) decrementRef?.focus();
	};

	return (
		<fieldset
			class={cn(
				"inline-flex items-center gap-1 rounded-full border border-petal-200 bg-white p-0.5",
				props.class,
			)}
		>
			<legend class="sr-only">Quantity of {props.itemLabel}</legend>
			<button
				type="button"
				class={stepButton}
				aria-label={`Decrease quantity of ${props.itemLabel}`}
				ref={decrementRef}
				disabled={props.value <= 1}
				onClick={() => step(-1)}
			>
				<MinusIcon class="size-3.5" />
			</button>
			<output
				aria-live="polite"
				class="min-w-6 text-center text-sm font-medium tabular-nums"
			>
				{props.value}
			</output>
			<button
				type="button"
				class={stepButton}
				aria-label={`Increase quantity of ${props.itemLabel}`}
				ref={incrementRef}
				disabled={props.value >= props.max}
				onClick={() => step(1)}
			>
				<PlusIcon class="size-3.5" />
			</button>
		</fieldset>
	);
}
