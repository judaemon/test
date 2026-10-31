import * as SelectPrimitive from "@kobalte/core/select";
import { Show } from "solid-js";

import { adminInput } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

interface FlowerChoice {
	name: string;
	hint?: string;
}

interface FlowerGroup {
	label: string;
	kinds: FlowerChoice[];
}

/** A flower picker that shows each flower's photo; a native select can't. */
export function FlowerSelect(props: {
	/** Read aloud in place of a visible label. */
	label: string;
	groups: FlowerGroup[];
	value: string;
	onChange: (flower: string) => void;
	photo: (flower: string) => string | undefined;
}) {
	const selected = () =>
		props.groups
			.flatMap((group) => group.kinds)
			.find((kind) => kind.name === props.value) ?? null;
	const labelOf = (kind: FlowerChoice) =>
		kind.hint ? `${kind.name} (${kind.hint})` : kind.name;

	return (
		<SelectPrimitive.Root<FlowerChoice, FlowerGroup>
			options={props.groups}
			optionValue="name"
			optionTextValue="name"
			optionGroupChildren="kinds"
			value={selected()}
			onChange={(kind) => kind && props.onChange(kind.name)}
			// Keeps an old entry visible until it's replaced.
			placeholder={
				props.value ? `${props.value} (not in list)` : "Choose a flower"
			}
			sectionComponent={(section) => (
				<SelectPrimitive.Section class="px-3 pb-1 pt-2 text-xs font-medium text-petal-900/55">
					{section.section.rawValue.label}
				</SelectPrimitive.Section>
			)}
			itemComponent={(item) => (
				<SelectPrimitive.Item
					item={item.item}
					class="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-petal-50 data-[selected]:font-medium"
				>
					<Show
						when={props.photo(item.item.rawValue.name)}
						fallback={
							<span class="size-9 shrink-0 rounded-md border-2 border-dashed border-petal-200" />
						}
					>
						{(src) => (
							<img
								src={src()}
								alt=""
								loading="lazy"
								class="size-9 shrink-0 rounded-md border border-black/10 object-cover"
							/>
						)}
					</Show>
					<SelectPrimitive.ItemLabel class="flex-1">
						{labelOf(item.item.rawValue)}
					</SelectPrimitive.ItemLabel>
					<SelectPrimitive.ItemIndicator class="text-petal-700">
						✓
					</SelectPrimitive.ItemIndicator>
				</SelectPrimitive.Item>
			)}
			class="min-w-0 flex-[1_1_calc(100%-3rem)] sm:flex-1"
		>
			<SelectPrimitive.Trigger
				aria-label={props.label}
				class={cn(adminInput, "flex items-center gap-2 text-left")}
			>
				<SelectPrimitive.Value<FlowerChoice> class="min-w-0 flex-1 truncate data-[placeholder-shown]:text-petal-900/40">
					{(state) => {
						const kind = state.selectedOption();
						return kind ? labelOf(kind) : "";
					}}
				</SelectPrimitive.Value>
				<SelectPrimitive.Icon class="text-petal-900/50" aria-hidden="true">
					▾
				</SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Content class="z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-petal-100 bg-white p-1 shadow-lg">
					<SelectPrimitive.Listbox class="max-h-80 overflow-y-auto outline-none" />
				</SelectPrimitive.Content>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	);
}
