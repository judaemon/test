import { Show } from "solid-js";

import { orderColor } from "~/lib/cadets";
import { cn } from "~/lib/utils";

/** A company's color dot; white gets an outline so it shows on white. */
export function ColorSwatch(props: { color?: string; class?: string }) {
	return (
		<span
			aria-hidden="true"
			class={cn(
				"inline-block size-3.5 shrink-0 rounded-full border border-black/20",
				props.class,
			)}
			style={{ "background-color": props.color ?? "transparent" }}
		/>
	);
}

/** "● Alfa · 1CL", colored by company; gray with the class for civilians. */
export function CompanyLabel(props: {
	company: string;
	className: string;
	/** Leaves the class out, for tables that show it in its own column. */
	companyOnly?: boolean;
	class?: string;
}) {
	return (
		<span class={cn("inline-flex items-center gap-1.5", props.class)}>
			<Show when={orderColor(props.company, props.className)}>
				{(color) => <ColorSwatch color={color()} class="size-2.5" />}
			</Show>
			{props.companyOnly
				? props.company || "—"
				: [props.company, props.className].filter(Boolean).join(" · ")}
		</span>
	);
}
