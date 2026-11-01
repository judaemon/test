import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

/**
 * An input with text attached, after shadcn's Input Group: the group carries
 * the border and focus ring, so the two read as one field. Put the input
 * first and the addon after it; the addon places itself in front.
 */
export function InputGroup(props: ComponentProps<"div">) {
	const [local, others] = splitProps(props, ["class"]);
	return (
		<div
			data-slot="input-group"
			class={cn(
				"flex h-11 w-full items-center rounded-xl border border-petal-200 bg-white ring-offset-background transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petal-500 has-[:focus-visible]:ring-offset-2 has-[[data-invalid]]:border-error-foreground has-[:disabled]:opacity-50",
				local.class,
			)}
			{...others}
		/>
	);
}

/** Text in front of the input, e.g. a prefix. */
export function InputGroupAddon(props: ComponentProps<"span">) {
	const [local, others] = splitProps(props, ["class"]);
	return (
		<span
			data-slot="input-group-addon"
			class={cn(
				"order-first flex shrink-0 select-none items-center pl-3 text-base text-petal-900/60 sm:text-sm",
				local.class,
			)}
			{...others}
		/>
	);
}

/** Classes for the input inside a group: the group draws its frame. */
export const inputGroupControl =
	"h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-100 placeholder:text-petal-900/35";
