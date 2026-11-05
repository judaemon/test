import { createSignal, For, Show } from "solid-js";

import { PreorderTag } from "~/components/product/preorder-tag";
import {
	type BouquetMessage,
	type BouquetMessageErrors,
	EMPTY_MESSAGE,
	hasCard,
	unitKey,
} from "~/lib/bouquet-messages";
import { DEDICATION_MESSAGE_MAX, NAME_MAX, NOTES_MAX } from "~/lib/checkout";
import type { PricedLine } from "~/lib/pricing";
import { styleLabel } from "~/lib/product";
import { cn } from "~/lib/utils";

/** One bouquet in the bag: a line's `unit`-th of `of`. */
export interface BagBouquet {
	key: string;
	line: PricedLine;
	unit: number;
	of: number;
}

/** Every bouquet in the bag, one per unit of each line's quantity. */
export function bagBouquets(lines: PricedLine[]): BagBouquet[] {
	return lines.flatMap((line) =>
		Array.from({ length: line.quantity }, (_, unit) => ({
			key: unitKey(line, unit),
			line,
			unit,
			of: line.quantity,
		})),
	);
}

/** The panel for a bouquet, so the review can send the shopper back to it. */
export const bouquetPanelId = (key: string) =>
	`bouquet-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export const messageInput =
	"w-full rounded-xl border border-petal-200 bg-white px-3 text-base placeholder:text-petal-900/35 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 aria-[invalid=true]:border-destructive sm:text-sm";

const addButton =
	"inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-petal-300 bg-white px-4 py-2 text-sm font-medium text-petal-700 transition-colors hover:border-petal-500 hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

const removeButton =
	"rounded-full px-2 py-1 text-xs font-medium text-petal-900/60 underline-offset-2 hover:text-petal-900 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500";

/**
 * Checkout's "Cards & notes": each bouquet gets its own optional dedication
 * card and note for the florist, opened only when the shopper wants one.
 */
export function BouquetMessages(props: {
	bouquets: BagBouquet[];
	messages: Record<string, BouquetMessage>;
	onChange: (key: string, patch: Partial<BouquetMessage>) => void;
	errors: Record<string, BouquetMessageErrors>;
	clearError: (key: string, field: keyof BouquetMessage) => void;
}) {
	const many = () => props.bouquets.length > 1;
	return (
		<div class="flex flex-col gap-4">
			<p class="text-sm text-petal-900/60">
				{many()
					? "Each bouquet can have its own dedication card and a note for the florist. Add only the ones you want — cards are printed and tucked into their bouquet, free."
					: "Add a dedication card, printed and tucked into the bouquet for free, or a note for the florist."}
			</p>
			<For each={props.bouquets}>
				{(bouquet, index) => (
					<BouquetPanel
						bouquet={bouquet}
						number={index() + 1}
						showNumber={many()}
						message={props.messages[bouquet.key] ?? EMPTY_MESSAGE}
						previous={(() => {
							const before = props.bouquets[index() - 1];
							return before ? props.messages[before.key] : undefined;
						})()}
						onChange={(patch) => props.onChange(bouquet.key, patch)}
						errors={props.errors[bouquet.key] ?? {}}
						clearError={(field) => props.clearError(bouquet.key, field)}
					/>
				)}
			</For>
		</div>
	);
}

function BouquetPanel(props: {
	bouquet: BagBouquet;
	/** Its place in the bag, from 1. */
	number: number;
	showNumber: boolean;
	message: BouquetMessage;
	/** The bouquet listed just above, to copy its card from. */
	previous?: BouquetMessage;
	onChange: (patch: Partial<BouquetMessage>) => void;
	errors: BouquetMessageErrors;
	clearError: (field: keyof BouquetMessage) => void;
}) {
	// Open when asked for, and whenever there's something written (or wrong).
	const [cardAsked, setCardAsked] = createSignal(false);
	const [noteAsked, setNoteAsked] = createSignal(false);
	const cardOpen = () =>
		cardAsked() ||
		!!props.message.to ||
		!!props.message.message ||
		!!props.errors.to ||
		!!props.errors.message;
	const noteOpen = () =>
		noteAsked() || !!props.message.note || !!props.errors.note;
	const canCopy = () =>
		!cardOpen() && hasCard(props.previous) && props.number > 1;
	let toInput: HTMLInputElement | undefined;
	let messageInputRef: HTMLTextAreaElement | undefined;
	let noteInput: HTMLTextAreaElement | undefined;
	const line = () => props.bouquet.line;
	const id = () => bouquetPanelId(props.bouquet.key);

	const openCard = () => {
		setCardAsked(true);
		queueMicrotask(() => toInput?.focus());
	};
	const copyCard = () => {
		const previous = props.previous;
		if (!previous) return;
		props.onChange({ to: previous.to, message: previous.message });
		setCardAsked(true);
		queueMicrotask(() => messageInputRef?.focus());
	};
	const removeCard = () => {
		props.onChange({ to: "", message: "" });
		props.clearError("to");
		props.clearError("message");
		setCardAsked(false);
	};
	const openNote = () => {
		setNoteAsked(true);
		queueMicrotask(() => noteInput?.focus());
	};
	const removeNote = () => {
		props.onChange({ note: "" });
		props.clearError("note");
		setNoteAsked(false);
	};

	return (
		<article
			id={id()}
			aria-labelledby={`${id()}-name`}
			class="scroll-mt-28 rounded-2xl border border-petal-100 p-4"
		>
			<header class="flex items-center gap-3">
				<img
					src={line().image}
					alt=""
					width={48}
					height={48}
					class="size-12 shrink-0 rounded-xl bg-petal-50 object-cover"
				/>
				<div class="min-w-0 flex-1">
					<p id={`${id()}-name`} class="truncate text-sm font-semibold">
						<Show when={props.showNumber}>
							<span class="sr-only">Bouquet {props.number}: </span>
						</Show>
						{line().title}
					</p>
					<p class="truncate text-sm text-petal-900/60">
						{line().sku === line().title
							? line().colorName
							: styleLabel(line())}
						<Show when={props.bouquet.of > 1}>
							{" "}
							· {props.bouquet.unit + 1} of {props.bouquet.of}
						</Show>
					</p>
					<Show when={line().preorder}>
						<PreorderTag readyBy={line().readyBy} class="mt-1" />
					</Show>
				</div>
				<Show when={props.showNumber}>
					<span
						aria-hidden="true"
						class="flex size-7 shrink-0 items-center justify-center rounded-full bg-petal-50 text-xs font-semibold text-petal-700"
					>
						{props.number}
					</span>
				</Show>
			</header>

			<Show when={cardOpen()}>
				<fieldset class="mt-3 flex min-w-0 flex-col gap-3 rounded-xl bg-petal-50 p-3 sm:p-4">
					<legend class="float-left flex w-full items-center justify-between gap-2">
						<span class="text-sm font-semibold">
							<span aria-hidden="true">💌 </span>Dedication card
							<span class="font-normal text-sage-600"> · free</span>
						</span>
						<button type="button" onClick={removeCard} class={removeButton}>
							Remove card
						</button>
					</legend>
					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-medium">
							To <span class="font-normal text-petal-900/50">(optional)</span>
						</span>
						<input
							ref={toInput}
							value={props.message.to}
							onInput={(e) => {
								props.onChange({ to: e.currentTarget.value });
								props.clearError("to");
								props.clearError("message");
							}}
							maxLength={NAME_MAX}
							autocomplete="off"
							placeholder="Who this card is for"
							aria-invalid={props.errors.to ? "true" : undefined}
							class={cn(messageInput, "h-11")}
						/>
						<Show when={props.errors.to}>
							<span class="text-xs text-destructive">{props.errors.to}</span>
						</Show>
					</label>
					<label class="flex flex-col gap-1.5">
						<span class="flex justify-between gap-2 text-sm font-medium">
							Message
							<span
								class="text-xs font-normal tabular-nums text-petal-900/50"
								aria-hidden="true"
							>
								{props.message.message.length}/{DEDICATION_MESSAGE_MAX}
							</span>
						</span>
						<textarea
							ref={messageInputRef}
							value={props.message.message}
							onInput={(e) => {
								props.onChange({ message: e.currentTarget.value });
								props.clearError("message");
							}}
							maxLength={DEDICATION_MESSAGE_MAX}
							rows={4}
							placeholder="Happy birthday, sunshine! 🌷"
							aria-invalid={props.errors.message ? "true" : undefined}
							class={cn(messageInput, "py-2 font-display text-base italic")}
						/>
						<Show when={props.errors.message}>
							<span class="text-xs text-destructive">
								{props.errors.message}
							</span>
						</Show>
					</label>
				</fieldset>
			</Show>

			<Show when={noteOpen()}>
				<div class="mt-3 flex flex-col gap-1.5">
					<div class="flex items-center justify-between gap-2">
						<label for={`${id()}-note`} class="text-sm font-semibold">
							<span aria-hidden="true">✎ </span>Note for the florist
						</label>
						<button type="button" onClick={removeNote} class={removeButton}>
							Remove note
						</button>
					</div>
					<textarea
						id={`${id()}-note`}
						ref={noteInput}
						value={props.message.note}
						onInput={(e) => {
							props.onChange({ note: e.currentTarget.value });
							props.clearError("note");
						}}
						maxLength={NOTES_MAX}
						rows={2}
						placeholder="Anything we should know about this bouquet"
						aria-invalid={props.errors.note ? "true" : undefined}
						class={cn(messageInput, "py-2")}
					/>
					<Show when={props.errors.note}>
						<span class="text-xs text-destructive">{props.errors.note}</span>
					</Show>
				</div>
			</Show>

			<Show when={!cardOpen() || !noteOpen()}>
				<div class="mt-3 flex flex-wrap gap-2">
					<Show when={canCopy()}>
						<button
							type="button"
							onClick={copyCard}
							class={cn(addButton, "border-solid bg-petal-50")}
						>
							<span aria-hidden="true">💌</span>
							Same card as bouquet {props.number - 1}
						</button>
					</Show>
					<Show when={!cardOpen()}>
						<button type="button" onClick={openCard} class={addButton}>
							<span aria-hidden="true">+</span>
							{canCopy() ? "New card" : "Add a dedication card"}
							<span class="font-normal text-sage-600">· free</span>
						</button>
					</Show>
					<Show when={!noteOpen()}>
						<button type="button" onClick={openNote} class={addButton}>
							<span aria-hidden="true">+</span>
							Add a note for the florist
						</button>
					</Show>
				</div>
			</Show>
		</article>
	);
}
