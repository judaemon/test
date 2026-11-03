import * as SelectPrimitive from "@kobalte/core/select";
import { For, Show } from "solid-js";

import { adminInput } from "~/components/admin/ui";
import { type CustomWrapper, wrapperColors } from "~/lib/custom-bouquet";
import { cn } from "~/lib/utils";

/** The "No wrapper" choice, so it can sit in the list with the rest. */
const NONE = { id: "", name: "No wrapper", colorHex: "" } as const;

type WrapperChoice = Pick<
	CustomWrapper,
	"id" | "name" | "colorHex" | "extraColors" | "image"
>;

/** A wrapper's photo, or its colors when it has none. */
function WrapperThumb(props: { wrapper: WrapperChoice }) {
	return (
		<Show
			when={props.wrapper.image}
			fallback={
				<Show
					when={props.wrapper.id}
					fallback={
						<span class="size-9 shrink-0 rounded-md border-2 border-dashed border-petal-200" />
					}
				>
					<span class="flex size-9 shrink-0 overflow-hidden rounded-md border border-black/10">
						<For each={wrapperColors(props.wrapper)}>
							{(hex) => <span class="flex-1" style={{ background: hex }} />}
						</For>
					</span>
				</Show>
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
	);
}

/** A wrapper picker that shows each wrapper's photo; a native select can't. */
export function WrapperSelect(props: {
	/** Read aloud in place of a visible label. */
	label: string;
	wrappers: WrapperChoice[];
	value: string;
	onChange: (wrapperId: string) => void;
}) {
	const options = () => [NONE, ...props.wrappers];
	const selected = () => options().find((w) => w.id === props.value) ?? null;

	return (
		<SelectPrimitive.Root<WrapperChoice>
			options={options()}
			optionValue="id"
			optionTextValue="name"
			value={selected()}
			onChange={(wrapper) => wrapper && props.onChange(wrapper.id)}
			// Keeps an old entry visible until it's replaced.
			placeholder="Wrapper (not in list)"
			itemComponent={(item) => (
				<SelectPrimitive.Item
					item={item.item}
					class="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-petal-50 data-[selected]:font-medium"
				>
					<WrapperThumb wrapper={item.item.rawValue} />
					<SelectPrimitive.ItemLabel class="flex-1">
						{item.item.rawValue.name}
					</SelectPrimitive.ItemLabel>
					<SelectPrimitive.ItemIndicator class="text-petal-700">
						✓
					</SelectPrimitive.ItemIndicator>
				</SelectPrimitive.Item>
			)}
		>
			<SelectPrimitive.Trigger
				aria-label={props.label}
				class={cn(adminInput, "flex items-center gap-2 py-1.5 text-left")}
			>
				<SelectPrimitive.Value<WrapperChoice> class="flex min-w-0 flex-1 items-center gap-2.5 data-[placeholder-shown]:text-petal-900/40">
					{(state) => {
						const wrapper = state.selectedOption();
						return (
							<>
								<WrapperThumb wrapper={wrapper} />
								<span class="truncate">{wrapper.name}</span>
							</>
						);
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
