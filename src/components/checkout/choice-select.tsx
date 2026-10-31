import * as SelectPrimitive from "@kobalte/core/select";
import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { cn } from "~/lib/utils";

/**
 * A dropdown for a fixed list of choices. The value is posted through a hidden
 * input named `name`, so it reads like any other checkout field.
 */
export function ChoiceSelect(props: {
	name: string;
	label: string;
	placeholder: string;
	options: readonly string[];
	value: string;
	onChange: (value: string) => void;
	/** Visible text for an option; defaults to the value itself. */
	optionLabel?: (value: string) => string;
	/** Shown before an option's label, e.g. a color swatch. */
	optionPrefix?: (value: string) => JSX.Element;
	error?: string;
	disabled?: boolean;
}) {
	const labelOf = (value: string) => props.optionLabel?.(value) ?? value;

	return (
		<SelectPrimitive.Root<string>
			options={[...props.options]}
			value={props.value || null}
			onChange={(value) => props.onChange(value ?? "")}
			placeholder={props.placeholder}
			validationState={props.error ? "invalid" : "valid"}
			disabled={props.disabled}
			itemComponent={(item) => (
				<SelectPrimitive.Item
					item={item.item}
					class="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-petal-50 data-[selected]:font-medium"
				>
					{props.optionPrefix?.(item.item.rawValue)}
					<SelectPrimitive.ItemLabel class="flex-1">
						{labelOf(item.item.rawValue)}
					</SelectPrimitive.ItemLabel>
					<SelectPrimitive.ItemIndicator class="text-petal-700">
						✓
					</SelectPrimitive.ItemIndicator>
				</SelectPrimitive.Item>
			)}
			class="flex flex-col gap-2"
		>
			<input type="hidden" name={props.name} value={props.value} />
			<SelectPrimitive.Label class="text-sm font-medium text-petal-900">
				{props.label}
			</SelectPrimitive.Label>
			<SelectPrimitive.Trigger
				aria-invalid={props.error ? "true" : undefined}
				class={cn(
					"flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-petal-500 data-[disabled]:cursor-not-allowed data-[disabled]:bg-petal-50 data-[disabled]:opacity-60 sm:text-sm",
					props.error ? "border-destructive" : "border-petal-200",
				)}
			>
				{/* Kobalte shows the placeholder here until something is picked. */}
				<SelectPrimitive.Value<string> class="flex min-w-0 flex-1 items-center gap-2.5 truncate data-[placeholder-shown]:text-petal-900/40">
					{(state) => (
						<>
							<Show when={state.selectedOption()}>
								{(value) => props.optionPrefix?.(value())}
							</Show>
							{labelOf(state.selectedOption())}
						</>
					)}
				</SelectPrimitive.Value>
				<SelectPrimitive.Icon class="text-petal-900/50" aria-hidden="true">
					▾
				</SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.ErrorMessage class="text-xs text-destructive">
				{props.error}
			</SelectPrimitive.ErrorMessage>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Content class="z-50 overflow-hidden rounded-xl border border-petal-100 bg-white p-1 shadow-lg">
					<SelectPrimitive.Listbox class="max-h-72 overflow-y-auto outline-none" />
				</SelectPrimitive.Content>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	);
}
