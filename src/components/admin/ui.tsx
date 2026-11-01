import type { ComponentProps, JSX } from "solid-js";
import {
	children,
	createEffect,
	createSignal,
	createUniqueId,
	onMount,
	Show,
	splitProps,
	untrack,
} from "solid-js";

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
	Switch,
	SwitchControl,
	SwitchLabel,
	SwitchThumb,
} from "~/components/ui/switch";
import { showToast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

export const adminInput =
	"h-11 w-full rounded-xl border border-petal-200 bg-white px-3 text-base text-petal-900 placeholder:text-petal-900/35 outline-none transition-colors focus-visible:border-petal-500 focus-visible:ring-2 focus-visible:ring-petal-500/30 disabled:opacity-50 sm:h-10 sm:text-sm";

export const adminButton = {
	primary:
		"inline-flex h-11 items-center justify-center gap-2 rounded-full bg-petal-700 px-5 text-sm font-medium text-white transition-colors hover:bg-petal-900 disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 sm:h-10",
	secondary:
		"inline-flex h-11 items-center justify-center gap-2 rounded-full border border-petal-200 bg-white px-4 text-sm font-medium text-petal-900 transition-colors hover:bg-petal-50 disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 sm:h-10",
	danger:
		"inline-flex h-11 items-center justify-center gap-2 rounded-full border border-error-foreground/30 bg-white px-4 text-sm font-medium text-error-foreground transition-colors hover:bg-error disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-error-foreground/40 sm:h-10",
	ghost:
		"inline-flex h-10 items-center justify-center gap-1 rounded-full px-2.5 text-sm text-petal-900/70 transition-colors hover:bg-petal-100 hover:text-petal-900 disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 sm:h-8",
};

export const adminCard = "rounded-2xl border border-petal-100 bg-white";

/**
 * A textarea that shows its value after server rendering. Solid renders
 * `value` as an attribute, which browsers ignore on <textarea>, so the initial
 * text goes in as content and an effect keeps the live value in sync.
 */
export function TextArea(
	props: Omit<ComponentProps<"textarea">, "value"> & { value: string },
) {
	const [local, rest] = splitProps(props, ["value"]);
	let element: HTMLTextAreaElement | undefined;
	createEffect(() => {
		if (element && element.value !== local.value) element.value = local.value;
	});
	return (
		<textarea ref={element} {...rest}>
			{untrack(() => local.value)}
		</textarea>
	);
}

export function PageHeader(props: {
	title: string;
	description?: JSX.Element;
	actions?: JSX.Element;
}) {
	// Resolve JSX props once: reading them in both `when` and the body would
	// create the elements twice and break hydration.
	const description = children(() => props.description);
	const actions = children(() => props.actions);
	return (
		<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 class="font-display type-soft text-3xl font-semibold tracking-tight">
					{props.title}
				</h1>
				<Show when={description()}>
					<p class="mt-1 text-sm text-petal-900/65">{description()}</p>
				</Show>
			</div>
			<Show when={actions()}>
				<div class="flex flex-wrap items-center gap-2">{actions()}</div>
			</Show>
		</div>
	);
}

export function Field(props: {
	label: string;
	hint?: string;
	class?: string;
	children: JSX.Element;
}) {
	const hintId = createUniqueId();
	let label: HTMLLabelElement | undefined;
	// The hint sits outside the <label> so it isn't read as part of the field's
	// name; link it to the control as a description instead.
	onMount(() => {
		if (!props.hint) return;
		label
			?.querySelector("input, select, textarea")
			?.setAttribute("aria-describedby", hintId);
	});
	return (
		<div class={cn("flex flex-col gap-1.5", props.class)}>
			{/* biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children. */}
			<label ref={label} class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{props.label}</span>
				{props.children}
			</label>
			<Show when={props.hint}>
				<span id={hintId} class="text-xs text-petal-900/55">
					{props.hint}
				</span>
			</Show>
		</div>
	);
}

export function Toggle(props: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	hideLabel?: boolean;
}) {
	return (
		<Switch
			checked={props.checked}
			onChange={props.onChange}
			disabled={props.disabled}
			class="inline-flex items-center gap-2"
		>
			<SwitchControl class="data-[checked]:bg-sage-600 bg-petal-200">
				<SwitchThumb class="bg-white" />
			</SwitchControl>
			<SwitchLabel class={cn("text-sm", props.hideLabel && "sr-only")}>
				{props.label}
			</SwitchLabel>
		</Switch>
	);
}

/** A button that asks "are you sure?" before doing something hard to undo. */
export function ConfirmButton(
	props: {
		title: string;
		description: JSX.Element;
		confirmLabel: string;
		onConfirm: () => void | Promise<void>;
		children: JSX.Element;
	} & Omit<ComponentProps<"button">, "onClick" | "children">,
) {
	const [local, buttonProps] = splitProps(props, [
		"title",
		"description",
		"confirmLabel",
		"onConfirm",
		"children",
	]);
	const [open, setOpen] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const confirm = async () => {
		setBusy(true);
		try {
			await local.onConfirm();
			setOpen(false);
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			<button type="button" {...buttonProps} onClick={() => setOpen(true)}>
				{local.children}
			</button>
			<AlertDialog open={open()} onOpenChange={setOpen}>
				<AlertDialogContent class="max-w-sm rounded-2xl bg-white text-petal-900">
					<AlertDialogTitle class="font-display type-soft text-xl">
						{local.title}
					</AlertDialogTitle>
					<AlertDialogDescription class="text-sm text-petal-900/70">
						{local.description}
					</AlertDialogDescription>
					<div class="mt-2 flex justify-end gap-2">
						<button
							type="button"
							class={adminButton.secondary}
							onClick={() => setOpen(false)}
						>
							Keep it
						</button>
						<button
							type="button"
							class={adminButton.primary}
							disabled={busy()}
							onClick={confirm}
						>
							{busy() ? "Working…" : local.confirmLabel}
						</button>
					</div>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/** Shows a server function failure to staff in plain words. */
export function toastError(error: unknown, fallback = "Something went wrong.") {
	const message =
		error instanceof Error && error.message ? error.message : fallback;
	showToast({ variant: "error", title: message, duration: 5000 });
}

export function toastSuccess(title: string) {
	showToast({ variant: "success", title, duration: 2500 });
}

const icon = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "1.8",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export const AdminIcons = {
	board: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<rect x="3" y="4" width="5" height="16" rx="1.5" />
			<rect x="10" y="4" width="5" height="11" rx="1.5" />
			<rect x="17" y="4" width="4" height="7" rx="1.5" />
		</svg>
	),
	orders: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M6 3h12l1 18H5L6 3Z" />
			<path d="M9 7a3 3 0 0 0 6 0" />
		</svg>
	),
	products: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<circle cx="12" cy="8" r="4" />
			<path d="M12 12v9M8 17c-2 0-4-1-4-3 2 0 4 1 4 3ZM16 17c2 0 4-1 4-3-2 0-4 1-4 3Z" />
		</svg>
	),
	flowers: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<circle cx="12" cy="9" r="2.5" />
			<path d="M12 6.5C12 4 13.5 3 15 3.5s1.5 2.8-.6 4.4M14.5 9c2.5 0 3.5 1.5 3 3s-2.8 1.5-4.4-.6M12 11.5c0 2.5-1.5 3.5-3 3s-1.5-2.8.6-4.4M9.5 9C7 9 6 7.5 6.5 6s2.8-1.5 4.4.6M12 11.5V21M12 18c-1.5-2-3.5-2.5-5-2" />
		</svg>
	),
	wrappers: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M4 4h16l-6 10v6l-4-2v-4L4 4Z" />
			<path d="M8 4l4 6 4-6" />
		</svg>
	),
	reports: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
		</svg>
	),
	custom: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M7 10 12 21l5-11" />
			<circle cx="9" cy="7" r="3" />
			<circle cx="15" cy="7" r="3" />
			<path d="M19 3v4M17 5h4" />
		</svg>
	),
	payments: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
		</svg>
	),
	staff: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<circle cx="9" cy="8" r="3.5" />
			<path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.7 2.6 2.4 3 5.2" />
		</svg>
	),
	shop: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5" />
		</svg>
	),
	logout: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
		</svg>
	),
};
