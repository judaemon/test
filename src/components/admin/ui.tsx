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

/** "Maria Santos" → "MS"; one name gives one letter. */
function initials(name: string) {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	const first = words[0][0];
	const last = words.length > 1 ? words[words.length - 1][0] : "";
	return (first + last).toUpperCase();
}

/** A signed-in person's initials in a rose circle. Size it with a class. */
export function Avatar(props: { name: string; class?: string }) {
	return (
		<span
			aria-hidden="true"
			class={cn(
				"inline-flex shrink-0 select-none items-center justify-center rounded-full bg-petal-100 font-semibold text-petal-700",
				props.class,
			)}
		>
			{initials(props.name)}
		</span>
	);
}

/**
 * A titled block on a settings page: the heading and a line on what it's for,
 * then a white card of rows (SettingsRow) and an optional footer for actions.
 */
export function SettingsSection(props: {
	title: string;
	description?: string;
	footer?: JSX.Element;
	children: JSX.Element;
}) {
	const id = createUniqueId();
	// JSX props are resolved once: reading one in both `when` and the body
	// would build it twice and break hydration (see PageHeader).
	const footer = children(() => props.footer);
	return (
		<section aria-labelledby={id} class="scroll-mt-24">
			<h2 id={id} class="text-lg font-semibold">
				{props.title}
			</h2>
			<Show when={props.description}>
				<p class="mt-0.5 text-sm text-petal-900/65">{props.description}</p>
			</Show>
			<div class={cn(adminCard, "mt-4 overflow-hidden")}>
				<div class="divide-y divide-petal-100">{props.children}</div>
				<Show when={footer()}>
					<div class="flex flex-wrap items-center justify-end gap-3 border-t border-petal-100 bg-petal-50/60 px-5 py-3">
						{footer()}
					</div>
				</Show>
			</div>
		</section>
	);
}

/**
 * One setting: what it is on the left, its value or control on the right.
 * Stacks on phones. Pass `for` (the field's id) when the control is a field,
 * so the label names it; the description gets the id `<for>-hint`.
 */
export function SettingsRow(props: {
	label: JSX.Element;
	description?: JSX.Element;
	for?: string;
	/** Puts the control at the far right, for buttons and badges. */
	end?: boolean;
	/** Extra content under the label, such as a link. */
	extra?: JSX.Element;
	class?: string;
	children: JSX.Element;
}) {
	// Resolved once, so a description with markup isn't built twice.
	const label = children(() => props.label);
	const description = children(() => props.description);
	return (
		<div
			class={cn(
				"grid gap-3 px-5 py-4 sm:items-center sm:gap-8",
				props.end
					? "sm:grid-cols-[minmax(0,1fr)_auto]"
					: "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
				props.class,
			)}
		>
			<div class="min-w-0">
				<Show
					when={props.for}
					fallback={<div class="text-sm font-medium">{label()}</div>}
				>
					<label for={props.for} class="text-sm font-medium">
						{label()}
					</label>
				</Show>
				<Show when={description()}>
					<p
						id={props.for ? `${props.for}-hint` : undefined}
						class="mt-0.5 text-sm text-petal-900/60"
					>
						{description()}
					</p>
				</Show>
				{props.extra}
			</div>
			<div class={cn("min-w-0 text-sm", props.end && "sm:justify-self-end")}>
				{props.children}
			</div>
		</div>
	);
}

/** Owner in rose, staff in sage, wherever a role is shown. */
export function RoleBadge(props: { role: "owner" | "staff"; class?: string }) {
	return (
		<span
			class={cn(
				"inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
				props.role === "owner"
					? "bg-petal-100 text-petal-700"
					: "bg-sage-100 text-sage-600",
				props.class,
			)}
		>
			{props.role === "owner" ? "Owner" : "Staff"}
		</span>
	);
}

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
			{/* A long description wraps here rather than pushing the actions below it. */}
			<div class="min-w-0 flex-1 basis-80">
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
/** Shows an error's message, or a message passed as text. */
export function toastError(error: unknown, fallback = "Something went wrong.") {
	const message =
		typeof error === "string" && error
			? error
			: error instanceof Error && error.message
				? error.message
				: fallback;
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
	/** The same grip as the drag handles on the arrange page. */
	grip: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
		</svg>
	),
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
	/** A folded card with a heart: dedication cards. */
	cards: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<path d="M12 15.5s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8Z" />
		</svg>
	),
	printer: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
			<path d="M7 14h10v7H7z" />
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
	suppliers: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" />
			<circle cx="6" cy="17.5" r="1.8" />
			<circle cx="17" cy="17.5" r="1.8" />
		</svg>
	),
	/** Florist's shears. */
	florists: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<circle cx="6" cy="18" r="2.6" />
			<circle cx="18" cy="18" r="2.6" />
			<path d="M7.8 16.2 17 4M16.2 16.2 7 4" />
		</svg>
	),
	types: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<rect x="3" y="3" width="7" height="7" rx="1.5" />
			<rect x="14" y="3" width="7" height="7" rx="1.5" />
			<rect x="3" y="14" width="7" height="7" rx="1.5" />
			<rect x="14" y="14" width="7" height="7" rx="1.5" />
		</svg>
	),
	sizes: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M3 17 17 3l4 4L7 21l-4-4Z" />
			<path d="m7 13 2 2M10 10l2 2M13 7l2 2" />
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
	sale: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
			<circle cx="8" cy="8" r="1.5" />
		</svg>
	),
	calendar: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<rect x="3" y="5" width="18" height="16" rx="2" />
			<path d="M3 10h18M8 3v4M16 3v4" />
		</svg>
	),
	log: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</svg>
	),
	staff: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<circle cx="9" cy="8" r="3.5" />
			<path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.7 2.6 2.4 3 5.2" />
		</svg>
	),
	trash: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
		</svg>
	),
	shop: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5" />
		</svg>
	),
	events: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M4 8.5V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4.5a2.5 2.5 0 0 0 0-5Z" />
			<path d="M14.5 5v2M14.5 10.5v3M14.5 17v2" />
		</svg>
	),
	landing: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<rect x="3" y="4" width="18" height="16" rx="2.5" />
			<path d="M3 8.5h18M7 13h6M7 16.5h10" />
		</svg>
	),
	logout: (p: { class?: string }) => (
		<svg aria-hidden="true" {...icon} class={p.class}>
			<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
		</svg>
	),
};
