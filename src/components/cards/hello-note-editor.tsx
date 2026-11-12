import { createResource, createSignal, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	TextArea,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { CONTACT } from "~/lib/contact";
import {
	DEFAULT_HELLO_NOTE,
	HELLO_HEADING_MAX,
	HELLO_MESSAGE_MAX,
} from "~/lib/hello-page";
import { absoluteUrl } from "~/lib/site";
import { cn } from "~/lib/utils";
import { getHelloNoteFn, saveHelloNoteFn } from "~/server/hello";

/**
 * Says where the QR code on the cards leads, and lets staff change the note
 * at the top of that page. The QR code itself never changes, so cards already
 * printed show the new note too.
 */
export function HelloNoteEditor() {
	const [saved, { mutate }] = createResource(() => getHelloNoteFn());
	const [open, setOpen] = createSignal(false);
	const [heading, setHeading] = createSignal("");
	const [message, setMessage] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	const startEditing = () => {
		const note = saved();
		setHeading(note?.heading ?? DEFAULT_HELLO_NOTE.heading);
		setMessage(note?.message ?? DEFAULT_HELLO_NOTE.message);
		setOpen(true);
	};
	const changed = () =>
		heading().trim() !== saved()?.heading ||
		message().trim() !== saved()?.message;

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			const note = await saveHelloNoteFn({
				data: { heading: heading(), message: message() },
			});
			mutate(note);
			setOpen(false);
			toastSuccess("The QR code page shows your new note.");
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	const address = absoluteUrl(CONTACT.helloPath).replace(/^https?:\/\//, "");

	return (
		<div class={cn(adminCard, "p-4")}>
			<div class="flex items-start gap-3">
				<span class="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-petal-100 bg-white p-1.5">
					<img src={CONTACT.helloQr} alt="" class="size-full" />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium">The QR code on every card</p>
					<p class="text-sm text-petal-900/60">
						Opens{" "}
						<a
							href={CONTACT.helloPath}
							target="_blank"
							rel="noreferrer"
							class="font-medium text-petal-700 underline underline-offset-2"
						>
							{address}
						</a>
						: your note, promos running now, and every way to reach you.
					</p>
				</div>
			</div>

			<Show
				when={open()}
				fallback={
					<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
						<button
							type="button"
							class={adminButton.secondary}
							onClick={startEditing}
							disabled={saved.loading}
						>
							Edit the note
						</button>
						<Show when={saved()}>
							{(note) => (
								<p class="min-w-0 flex-1 truncate text-sm italic text-petal-900/55">
									“{note().heading}”
								</p>
							)}
						</Show>
					</div>
				}
			>
				<form class="mt-4 flex flex-col gap-3" onSubmit={save}>
					<label class="flex flex-col gap-1.5 text-sm font-medium">
						Heading
						<input
							class={adminInput}
							value={heading()}
							maxLength={HELLO_HEADING_MAX}
							onInput={(e) => setHeading(e.currentTarget.value)}
							required
						/>
					</label>
					<div class="flex flex-col gap-1.5 text-sm font-medium">
						<span class="flex items-baseline justify-between gap-2">
							<label for="hello-message">Message</label>
							<span class="text-xs font-normal tabular-nums text-petal-900/50">
								{message().length} / {HELLO_MESSAGE_MAX}
							</span>
						</span>
						<TextArea
							id="hello-message"
							class={cn(adminInput, "h-auto min-h-32 py-2.5 leading-relaxed")}
							value={message()}
							maxLength={HELLO_MESSAGE_MAX}
							onInput={(e) => setMessage(e.currentTarget.value)}
							required
						/>
					</div>
					<p class="text-xs text-petal-900/55">
						Shows right away, on cards already printed too: the QR code stays
						the same.
					</p>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="submit"
							class={adminButton.primary}
							disabled={saving() || !changed()}
						>
							{saving() ? "Saving…" : "Save note"}
						</button>
						<button
							type="button"
							class={adminButton.secondary}
							onClick={() => setOpen(false)}
						>
							Cancel
						</button>
						<button
							type="button"
							class={cn(adminButton.ghost, "ms-auto")}
							onClick={() => {
								setHeading(DEFAULT_HELLO_NOTE.heading);
								setMessage(DEFAULT_HELLO_NOTE.message);
							}}
						>
							Use the original
						</button>
					</div>
				</form>
			</Show>
		</div>
	);
}
