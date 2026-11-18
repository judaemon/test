import { createSignal, type JSX, Show, splitProps } from "solid-js";

import { cn } from "~/lib/utils";

/**
 * A password box with the usual comforts: an eye button to see what's typed,
 * and a warning while Caps Lock is on. Takes every prop an `<input>` does.
 */
export function PasswordInput(
	props: Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type"> & {
		/** Classes for the box itself (the input). */
		class?: string;
	},
) {
	const [local, rest] = splitProps(props, ["class", "onKeyUp", "onBlur"]);
	const [shown, setShown] = createSignal(false);
	const [capsLock, setCapsLock] = createSignal(false);
	let input: HTMLInputElement | undefined;

	const checkCaps = (event: KeyboardEvent) =>
		setCapsLock(event.getModifierState?.("CapsLock") ?? false);

	return (
		<div class="w-full">
			<div class="relative">
				<input
					{...rest}
					ref={input}
					type={shown() ? "text" : "password"}
					// Shown, it's still a password: no spellcheck or capitalising.
					autocapitalize="off"
					spellcheck={false}
					onKeyUp={(event) => {
						checkCaps(event);
						if (typeof local.onKeyUp === "function") local.onKeyUp(event);
					}}
					onKeyDown={checkCaps}
					onBlur={(event) => {
						setCapsLock(false);
						if (typeof local.onBlur === "function") local.onBlur(event);
					}}
					class={cn(local.class, "pr-12")}
				/>
				<button
					type="button"
					// Keeps the caret in the box when the eye is clicked.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => {
						setShown(!shown());
						input?.focus();
					}}
					aria-label={shown() ? "Hide password" : "Show password"}
					aria-pressed={shown()}
					title={shown() ? "Hide password" : "Show password"}
					class="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-lg text-petal-900/55 transition-colors outline-none hover:bg-petal-50 hover:text-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-5"
					>
						<Show
							when={shown()}
							fallback={
								<>
									<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
									<circle cx="12" cy="12" r="3" />
								</>
							}
						>
							<path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
						</Show>
					</svg>
				</button>
			</div>
			<Show when={capsLock()}>
				<p
					aria-live="polite"
					class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warning-foreground"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-3.5"
					>
						<path d="M12 4 4 12h4v4h8v-4h4l-8-8ZM8 20h8" />
					</svg>
					Caps Lock is on
				</p>
			</Show>
		</div>
	);
}
