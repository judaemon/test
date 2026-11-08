import * as SelectPrimitive from "@kobalte/core/select";
import { For, Show } from "solid-js";

import { adminInput } from "~/components/admin/ui";
import {
	createHoverPreview,
	ZoomableImage,
} from "~/components/zoom/zoomable-image";
import { type CustomWrapper, wrapperColors } from "~/lib/custom-bouquet";
import { cn } from "~/lib/utils";

type WrapperChoice = Pick<
	CustomWrapper,
	"id" | "name" | "colorHex" | "extraColors" | "image" | "price" | "enabled"
>;

/**
 * The "No wrapper" choice, so it can sit in the list with the rest. Its id
 * isn't empty because the select treats an empty key as nothing chosen.
 */
const NONE: WrapperChoice = {
	id: "none",
	name: "No wrapper",
	colorHex: "",
	price: 0,
	enabled: true,
};

/** A wrapper's photo, or its colors when it has none. */
function WrapperThumb(props: { wrapper: WrapperChoice; class: string }) {
	return (
		<Show
			when={props.wrapper.image}
			fallback={
				<Show
					when={props.wrapper !== NONE}
					fallback={
						<span
							class={cn("border-2 border-dashed border-petal-200", props.class)}
						/>
					}
				>
					<span
						class={cn(
							"flex overflow-hidden border border-black/10",
							props.class,
						)}
					>
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
					class={cn("border border-black/10 object-cover", props.class)}
				/>
			)}
		</Show>
	);
}

/**
 * A wrapper picker laid out like a recipe row: the chosen wrapper's photo
 * beside a list that shows every wrapper's photo, which a native select can't.
 */
export function WrapperSelect(props: {
	/** Read aloud in place of a visible label. */
	label: string;
	wrappers: WrapperChoice[];
	value: string;
	onChange: (wrapperId: string) => void;
}) {
	const options = () => [NONE, ...props.wrappers];
	const selected = () =>
		props.value
			? (props.wrappers.find((w) => w.id === props.value) ?? null)
			: NONE;
	// Pointing at a wrapper in the list shows its photo larger, beside the list.
	const preview = createHoverPreview();

	return (
		<div class="flex items-center gap-2">
			<Show
				when={selected()?.image}
				fallback={
					<WrapperThumb
						wrapper={selected() ?? NONE}
						class="size-10 shrink-0 rounded-lg"
					/>
				}
			>
				{(src) => (
					<ZoomableImage
						src={src()}
						alt={selected()?.name ?? ""}
						caption={selected()?.name}
						hoverPreview
						class="size-10 shrink-0 rounded-lg border border-black/10 object-cover"
					/>
				)}
			</Show>
			<SelectPrimitive.Root<WrapperChoice>
				options={options()}
				optionValue="id"
				optionTextValue="name"
				value={selected()}
				// A row that closes under the pointer never says it was left.
				onOpenChange={(open) => !open && preview.hide()}
				onChange={(wrapper) =>
					wrapper && props.onChange(wrapper === NONE ? "" : wrapper.id)
				}
				// Keeps an old entry visible until it's replaced.
				placeholder="Wrapper not in list"
				itemComponent={(item) => (
					<SelectPrimitive.Item
						item={item.item}
						{...(item.item.rawValue.image
							? preview.on(item.item.rawValue.image)
							: {})}
						class="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-petal-50 data-[selected]:font-medium"
					>
						<WrapperThumb
							wrapper={item.item.rawValue}
							class="size-9 shrink-0 rounded-md"
						/>
						<SelectPrimitive.ItemLabel class="min-w-0 flex-1">
							{item.item.rawValue.name}
							<Show when={!item.item.rawValue.enabled}>
								<span class="block text-xs font-normal text-petal-900/55">
									Hidden from shoppers
								</span>
							</Show>
						</SelectPrimitive.ItemLabel>
						<Show when={item.item.rawValue !== NONE}>
							<span class="shrink-0 text-xs text-petal-900/55">
								{item.item.rawValue.price
									? `₱${item.item.rawValue.price.toLocaleString("en-PH")}`
									: "Free"}
							</span>
						</Show>
						<SelectPrimitive.ItemIndicator class="text-petal-700">
							✓
						</SelectPrimitive.ItemIndicator>
					</SelectPrimitive.Item>
				)}
				class="min-w-0 flex-1"
			>
				<SelectPrimitive.Trigger
					aria-label={props.label}
					class={cn(adminInput, "flex items-center gap-2 text-left")}
				>
					<SelectPrimitive.Value<WrapperChoice> class="min-w-0 flex-1 truncate data-[placeholder-shown]:text-petal-900/40">
						{(state) => state.selectedOption().name}
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
			<preview.Preview />
		</div>
	);
}
