import { createResource, createSignal, For, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { formatLogTime } from "~/lib/order-log";
import { cn } from "~/lib/utils";
import {
	addOrderNoteFn,
	deleteOrderNoteFn,
	editOrderNoteFn,
	listOrderNotesFn,
	type OrderNotesResult,
} from "~/server/admin/orders";
import type { OrderNote } from "~/server/order-notes-repo";

/** Matches ORDER_NOTE_MAX on the server. */
const NOTE_MAX = 2000;

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("") || "?";

const fullTime = (at: string) =>
	new Date(at).toLocaleString("en-PH", {
		timeZone: "Asia/Manila",
		dateStyle: "full",
		timeStyle: "short",
	});

/** Saves on Ctrl/⌘ + Enter; cancels on Escape. */
function keys(
	event: KeyboardEvent,
	actions: { save: () => void; cancel?: () => void },
) {
	if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		actions.save();
	} else if (event.key === "Escape" && actions.cancel) {
		event.preventDefault();
		actions.cancel();
	}
}

/** Grows the box with what's typed, up to a point. */
const grow = (box: HTMLTextAreaElement) => {
	box.style.height = "auto";
	box.style.height = `${Math.min(box.scrollHeight, 320)}px`;
};

/**
 * Staff's notes on an order, like a short thread: who wrote what, and when.
 * Customers never see them. Staff edit and delete their own notes; the owner
 * can delete anyone's.
 */
export function OrderNotes(props: {
	orderId: string;
	user: { id: string; role: "owner" | "staff" };
	/** Replaces the card look, e.g. inside the orders list's notes panel. */
	class?: string;
	/** Told how many notes there are after each add or delete. */
	onCountChange?: (count: number) => void;
}) {
	const [loaded] = createResource(
		() => props.orderId,
		(orderId) => listOrderNotesFn({ data: { orderId } }),
	);
	const [notes, setNotes] = createSignal<OrderNote[]>();
	const shown = () => notes() ?? loaded.latest ?? [];
	const [draft, setDraft] = createSignal("");
	const [adding, setAdding] = createSignal(false);
	let box: HTMLTextAreaElement | undefined;

	/** Takes the server's list after a change, or shows why it failed. */
	const apply = (result: OrderNotesResult, success: string) => {
		if (!result.ok) {
			toastError(new Error(result.message));
			return false;
		}
		setNotes(result.notes);
		props.onCountChange?.(result.notes.length);
		toastSuccess(success);
		return true;
	};

	const add = async () => {
		const body = draft().trim();
		if (!body || adding()) return;
		setAdding(true);
		try {
			const result = await addOrderNoteFn({
				data: { orderId: props.orderId, body },
			});
			if (apply(result, "Note added.")) {
				setDraft("");
				if (box) grow(box);
			}
		} catch (error) {
			toastError(error);
		} finally {
			setAdding(false);
			box?.focus();
		}
	};

	return (
		<section
			class={props.class ?? cn(adminCard, "p-5")}
			aria-labelledby="notes-heading"
		>
			<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="notes-heading" class="font-semibold">
					Staff notes
					<Show when={shown().length}>
						<span class="ml-2 rounded-full bg-petal-100 px-2 py-0.5 text-xs font-medium tabular-nums">
							{shown().length}
						</span>
					</Show>
				</h2>
				<span class="flex items-center gap-1 text-xs text-petal-900/55">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-3.5"
					>
						<rect x="5" y="11" width="14" height="10" rx="2" />
						<path d="M8 11V8a4 4 0 0 1 8 0v3" />
					</svg>
					Only staff see these
				</span>
			</div>

			<Show
				when={shown().length}
				fallback={
					<p class="mb-3 text-sm text-petal-900/55">
						<Show when={!loaded.loading} fallback="Loading…">
							No notes yet. Add one to keep the team in the loop.
						</Show>
					</p>
				}
			>
				<ol class="mb-4 mt-3 flex flex-col gap-3">
					<For each={shown()}>
						{(note) => (
							<NoteItem
								note={note}
								user={props.user}
								onSaved={(result) => apply(result, "Note saved.")}
								onDeleted={(result) => apply(result, "Note deleted.")}
							/>
						)}
					</For>
				</ol>
			</Show>

			<form
				onSubmit={(event) => {
					event.preventDefault();
					void add();
				}}
				class="flex flex-col gap-2"
			>
				<label for="new-note" class="sr-only">
					New note
				</label>
				<textarea
					id="new-note"
					ref={box}
					value={draft()}
					onInput={(event) => {
						setDraft(event.currentTarget.value);
						grow(event.currentTarget);
					}}
					onKeyDown={(event) => keys(event, { save: () => void add() })}
					rows={2}
					maxLength={NOTE_MAX}
					placeholder="Add a note for the team, e.g. “Customer asked for a pink ribbon.”"
					class={cn(adminInput, "h-auto resize-none py-2")}
				/>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<span class="text-xs text-petal-900/50">
						<Show
							when={draft().length > NOTE_MAX - 200}
							fallback="Ctrl or ⌘ + Enter to add"
						>
							<span class="tabular-nums">
								{draft().length}/{NOTE_MAX}
							</span>
						</Show>
					</span>
					<button
						type="submit"
						class={adminButton.primary}
						disabled={!draft().trim() || adding()}
					>
						{adding() ? "Adding…" : "Add note"}
					</button>
				</div>
			</form>
		</section>
	);
}

function NoteItem(props: {
	note: OrderNote;
	user: { id: string; role: "owner" | "staff" };
	onSaved: (result: OrderNotesResult) => boolean;
	onDeleted: (result: OrderNotesResult) => boolean;
}) {
	const mine = () => props.note.authorId === props.user.id;
	const canDelete = () => mine() || props.user.role === "owner";
	const [editing, setEditing] = createSignal(false);
	const [text, setText] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	const startEditing = () => {
		setText(props.note.body);
		setEditing(true);
	};
	const save = async () => {
		const body = text().trim();
		if (!body || saving()) return;
		if (body === props.note.body) return setEditing(false);
		setSaving(true);
		try {
			const result = await editOrderNoteFn({
				data: { id: props.note.id, body },
			});
			if (props.onSaved(result)) setEditing(false);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<li class="flex gap-3">
			<span
				aria-hidden="true"
				class={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
					mine() ? "bg-petal-700 text-white" : "bg-petal-100 text-petal-800",
				)}
			>
				{initials(props.note.authorName)}
			</span>
			<div class="min-w-0 flex-1">
				<p class="flex flex-wrap items-baseline gap-x-2 text-sm">
					<span class="font-medium">
						{props.note.authorName}
						<Show when={mine()}>
							<span class="font-normal text-petal-900/55"> (you)</span>
						</Show>
					</span>
					<time
						datetime={props.note.createdAt}
						title={fullTime(props.note.createdAt)}
						class="text-xs text-petal-900/55"
					>
						{formatLogTime(props.note.createdAt)}
					</time>
					<Show when={props.note.editedAt}>
						{(at) => (
							<span
								class="text-xs text-petal-900/45"
								title={`Edited ${fullTime(at())}`}
							>
								(edited)
							</span>
						)}
					</Show>
				</p>
				<Show
					when={editing()}
					fallback={
						<p class="mt-1 whitespace-pre-line rounded-xl rounded-tl-sm bg-petal-50 px-3 py-2 text-sm wrap-anywhere">
							{props.note.body}
						</p>
					}
				>
					<div class="mt-1 flex flex-col gap-2">
						<label for={`edit-${props.note.id}`} class="sr-only">
							Edit note
						</label>
						<textarea
							id={`edit-${props.note.id}`}
							ref={(el) =>
								requestAnimationFrame(() => {
									grow(el);
									el.focus();
									el.setSelectionRange(el.value.length, el.value.length);
								})
							}
							value={text()}
							onInput={(event) => {
								setText(event.currentTarget.value);
								grow(event.currentTarget);
							}}
							onKeyDown={(event) =>
								keys(event, {
									save: () => void save(),
									cancel: () => setEditing(false),
								})
							}
							maxLength={NOTE_MAX}
							rows={2}
							class={cn(adminInput, "h-auto resize-none py-2")}
						/>
						<div class="flex flex-wrap items-center gap-2">
							<button
								type="button"
								class={adminButton.primary}
								disabled={!text().trim() || saving()}
								onClick={() => void save()}
							>
								{saving() ? "Saving…" : "Save"}
							</button>
							<button
								type="button"
								class={adminButton.ghost}
								disabled={saving()}
								onClick={() => setEditing(false)}
							>
								Cancel
							</button>
							<span class="text-xs text-petal-900/50">
								Ctrl or ⌘ + Enter to save, Esc to cancel
							</span>
						</div>
					</div>
				</Show>
				<Show when={!editing() && (mine() || canDelete())}>
					<div class="mt-1 flex gap-3 text-xs">
						<Show when={mine()}>
							<button
								type="button"
								onClick={startEditing}
								class="font-medium text-petal-700 underline-offset-2 hover:underline"
							>
								Edit
							</button>
						</Show>
						<Show when={canDelete()}>
							<ConfirmButton
								class="font-medium text-destructive underline-offset-2 hover:underline"
								title="Delete this note?"
								description="It’s gone for everyone, and can’t be undone."
								confirmLabel="Delete note"
								onConfirm={async () => {
									try {
										props.onDeleted(
											await deleteOrderNoteFn({ data: { id: props.note.id } }),
										);
									} catch (error) {
										toastError(error);
									}
								}}
							>
								Delete
							</ConfirmButton>
						</Show>
					</div>
				</Show>
			</div>
		</li>
	);
}
