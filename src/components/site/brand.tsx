import type { ComponentProps } from "solid-js";

import { cn } from "~/lib/utils";

type SvgProps = ComponentProps<"svg">;

/**
 * The ORAIA logo mark: traced from the brand logo into a sharp, transparent
 * vector (public/images/brand/logo.svg), used here as a mask so it takes the
 * site's colors: a deep rose gradient, darkest at the base like a petal's
 * shadow. Decorative wherever it sits next to the name, so it's hidden from
 * screen readers.
 */
export function FlowerMark(props: { class?: string }) {
	return (
		<span
			aria-hidden="true"
			class={cn(
				"inline-block shrink-0 bg-linear-to-b from-petal-500 via-petal-700 to-petal-900",
				props.class,
			)}
			style={{
				"mask-image": "url(/images/brand/logo.svg)",
				"mask-size": "contain",
				"mask-repeat": "no-repeat",
				"mask-position": "center",
				"-webkit-mask-image": "url(/images/brand/logo.svg)",
				"-webkit-mask-size": "contain",
				"-webkit-mask-repeat": "no-repeat",
				"-webkit-mask-position": "center",
			}}
		/>
	);
}

/**
 * The name, set in the display serif with wide, airy spacing in deep rose.
 * Letter spacing also follows the last letter; the negative margin takes it
 * back so the name sits centered. Size it with a text class.
 */
export function Wordmark(props: { class?: string }) {
	return (
		<span
			class={cn(
				"font-display type-soft font-medium uppercase tracking-[0.32em] -me-[0.32em] text-petal-900",
				props.class,
			)}
		>
			ORAIA
		</span>
	);
}

/** A single soft petal, for scattering decoratively around a layout. */
export function Petal(props: SvgProps) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 32" {...props}>
			<path
				d="M12 31C4 25 1 17 3 9 4.5 3.5 9 1 12 1s7.5 2.5 9 8c2 8-1 16-9 22Z"
				fill="currentColor"
			/>
			<path
				d="M12 28C10 20 10 12 12 5"
				fill="none"
				stroke="white"
				stroke-opacity="0.45"
				stroke-width="1.2"
				stroke-linecap="round"
			/>
		</svg>
	);
}

/** Four-point twinkle. */
export function Sparkle(props: SvgProps) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
			<path
				d="M12 1c.8 5.6 4.4 9.2 11 11-6.6 1.8-10.2 5.4-11 11-.8-5.6-4.4-9.2-11-11 6.6-1.8 10.2-5.4 11-11Z"
				fill="currentColor"
			/>
		</svg>
	);
}
