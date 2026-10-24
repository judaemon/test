import type { ComponentProps } from "solid-js";

type IconProps = ComponentProps<"svg">;

const base = {
	xmlns: "http://www.w3.org/2000/svg",
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export function ChevronLeftIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M15 6l-6 6l6 6" />
		</svg>
	);
}

export function ChevronRightIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M9 6l6 6l-6 6" />
		</svg>
	);
}

export function MinusIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M5 12h14" />
		</svg>
	);
}

export function PlusIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}

export function BagIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z" />
			<path d="M9 11v-5a3 3 0 0 1 6 0v5" />
		</svg>
	);
}

export function TruckIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
			<path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
			<path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
		</svg>
	);
}

export function LeafIcon(props: IconProps) {
	return (
		<svg aria-hidden="true" {...base} {...props}>
			<path d="M5 21c.5 -4.5 2.5 -8 7 -10" />
			<path d="M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3z" />
		</svg>
	);
}
