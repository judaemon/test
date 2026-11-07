import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { adminButton } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

const PROOF_MAX_BYTES = 20 * 1024 * 1024;
const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * An optional photo staff attach as proof, previewed before it's sent. Images
 * the server would refuse are turned away here with `onError`.
 */
export function ProofPicker(props: {
	file: File | undefined;
	onChange: (file: File | undefined) => void;
	onError: (message: string | undefined) => void;
	disabled?: boolean;
	/** Says whether it's optional; defaults to "(optional)". */
	hint?: string;
}) {
	const [previewUrl, setPreviewUrl] = createSignal<string>();
	createEffect(() => {
		const file = props.file;
		if (!file) return setPreviewUrl(undefined);
		const url = URL.createObjectURL(file);
		setPreviewUrl(url);
		onCleanup(() => URL.revokeObjectURL(url));
	});

	const choose = (file: File | undefined) => {
		if (!file) return;
		props.onError(undefined);
		if (!PROOF_TYPES.includes(file.type))
			return props.onError("Use a PNG, JPG or WEBP image.");
		if (file.size > PROOF_MAX_BYTES)
			return props.onError("Keep images under 20 MB.");
		props.onChange(file);
	};

	return (
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium">
				Proof{" "}
				<span class="font-normal text-petal-900/50">
					{props.hint ?? "(optional)"}
				</span>
			</span>
			<Show when={previewUrl()}>
				{(url) => (
					<img
						src={url()}
						alt="Chosen proof"
						class="max-h-48 w-full rounded-xl border border-petal-100 bg-petal-50 object-contain"
					/>
				)}
			</Show>
			<div class="flex flex-wrap items-center gap-2">
				<label
					class={cn(
						adminButton.secondary,
						"cursor-pointer focus-within:ring-2 focus-within:ring-petal-500",
						props.disabled && "pointer-events-none opacity-60",
					)}
				>
					{props.file ? "Choose another" : "Add a photo"}
					<input
						type="file"
						accept={PROOF_TYPES.join(",")}
						class="sr-only"
						disabled={props.disabled}
						onChange={(e) => {
							choose(e.currentTarget.files?.[0]);
							e.currentTarget.value = "";
						}}
					/>
				</label>
				<Show when={props.file}>
					<button
						type="button"
						class={adminButton.ghost}
						disabled={props.disabled}
						onClick={() => props.onChange(undefined)}
					>
						Remove
					</button>
				</Show>
			</div>
		</div>
	);
}
