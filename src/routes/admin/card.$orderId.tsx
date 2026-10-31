import {
	createFileRoute,
	notFound,
	redirect,
	useNavigate,
} from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { createEffect, For, on, Show } from "solid-js";

import { CONTACT } from "~/lib/contact";
import { cn } from "~/lib/utils";
import { getAdminOrder } from "~/server/admin/orders";
import { getAdminSession } from "~/server/admin/settings";

/** Largest and smallest message size, in points; the message shrinks to fit. */
const MAX_FONT_PT = 22;
const MIN_FONT_PT = 9;

/**
 * Paper sizes, given in millimetres (not every browser knows "A5"/"A6").
 * A5 puts the message on the top half and ORAIA's contact details below;
 * A6 is the message alone.
 */
const SIZES = {
	a5: { label: "A5 · message + contact", width: 148, height: 210 },
	a6: { label: "A6 · message only", width: 105, height: 148 },
} as const;
type CardSize = keyof typeof SIZES;

interface CardSearch {
	/** Set when opened by a Print button: print as soon as it's laid out. */
	autoprint?: boolean;
	/** Defaults to A5. */
	size?: CardSize;
}

/**
 * An order's dedication, ready to print. Opened in a hidden frame from the
 * orders pages, or directly to preview it and pick the paper size.
 */
export const Route = createFileRoute("/admin/card/$orderId")({
	validateSearch: (search: Record<string, unknown>): CardSearch => ({
		// The router parses "?autoprint=1" into the number 1.
		autoprint: [true, 1, "1"].includes(search.autoprint as never),
		size: search.size === "a6" ? "a6" : undefined,
	}),
	beforeLoad: async ({ location }) => {
		const user = await getAdminSession();
		if (!user)
			throw redirect({
				to: "/admin/login",
				search: { redirect: location.href },
			});
	},
	loader: async ({ params }) => {
		const order = await getAdminOrder({ data: params.orderId });
		if (!order) throw notFound();
		return order;
	},
	head: () => ({
		meta: [
			{ title: "Dedication card · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: DedicationCard,
});

function DedicationCard() {
	const order = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const size = (): CardSize => search().size ?? "a5";
	const paper = () => SIZES[size()];
	let box!: HTMLDivElement;
	let message!: HTMLQuoteElement;
	let printed = false;

	/** Biggest message size that still fits its area, never below the minimum. */
	const fit = () => {
		let pt = MAX_FONT_PT;
		message.style.fontSize = `${pt}pt`;
		while (pt > MIN_FONT_PT && box.scrollHeight > box.clientHeight) {
			pt -= 0.5;
			message.style.fontSize = `${pt}pt`;
		}
	};

	createEffect(
		on(size, async () => {
			await document.fonts.ready;
			fit();
			if (search().autoprint && !printed) {
				printed = true;
				// The QR code is an image; wait for it so it isn't missing on paper.
				await Promise.all(
					[...document.images].map((img) => img.decode().catch(() => {})),
				);
				window.print();
				// Lets the page that opened this frame clean it up.
				window.parent.postMessage(
					{ type: "oraia:card-printed" },
					location.origin,
				);
			}
		}),
	);

	return (
		<>
			<style>{`
				@page { size: ${paper().width}mm ${paper().height}mm; margin: 0; }
				html, body { margin: 0; background: #f3f0ea; }
				@media print {
					html, body { background: transparent; }
					.no-print { display: none !important; }
					/* Nothing behind the ink, so any paper color works. */
					.card { background: transparent !important; box-shadow: none !important; margin: 0 !important; }
				}
			`}</style>
			<div class="no-print flex flex-wrap items-center justify-center gap-3 py-4 text-sm text-petal-900/70">
				<span>Order #{order().number}</span>
				<fieldset class="flex rounded-full border border-petal-200 bg-white p-1">
					<legend class="sr-only">Paper size</legend>
					<For each={Object.keys(SIZES) as CardSize[]}>
						{(key) => (
							<button
								type="button"
								aria-pressed={size() === key}
								onClick={() =>
									navigate({
										search: (prev) => ({
											...prev,
											size: key === "a5" ? undefined : key,
										}),
										replace: true,
									})
								}
								class={cn(
									"rounded-full px-3 py-1",
									size() === key
										? "bg-petal-700 font-medium text-white"
										: "hover:bg-petal-50",
								)}
							>
								{SIZES[key].label}
							</button>
						)}
					</For>
				</fieldset>
				<button
					type="button"
					onClick={() => window.print()}
					class="rounded-full bg-petal-700 px-4 py-1.5 font-medium text-white"
				>
					Print
				</button>
			</div>
			<article
				class="card mx-auto box-border flex flex-col bg-white text-[#111]"
				style={{
					width: `${paper().width}mm`,
					height: `${paper().height}mm`,
					"box-shadow": "0 2px 12px rgb(0 0 0 / 0.12)",
				}}
			>
				{/* The message: the whole A6 card, or the top half of A5. */}
				<div
					class="box-border flex min-h-0 flex-col"
					style={{
						height: size() === "a5" ? "50%" : "100%",
						padding: size() === "a5" ? "12mm 14mm" : "14mm 12mm",
					}}
				>
					<div
						ref={box}
						class="flex min-h-0 flex-1 flex-col justify-center overflow-hidden"
					>
						<Show when={order().details.dedicationFor}>
							<p class="mb-4 font-sans text-[11pt] font-semibold tracking-wide">
								To: {order().details.dedicationFor}
							</p>
						</Show>
						<blockquote
							ref={message}
							class="m-0 whitespace-pre-line break-words font-display italic leading-snug"
						>
							{order().details.dedicationMessage}
						</blockquote>
					</div>
				</div>
				<Show when={size() === "a5"}>
					<ContactBlock />
				</Show>
			</article>
		</>
	);
}

/** Bottom half of the A5 card: Facebook QR code and how to reach ORAIA. */
function ContactBlock() {
	return (
		<div
			class="box-border flex items-center justify-center gap-[7mm] font-sans"
			style={{ height: "50%", padding: "0 12mm" }}
		>
			<img
				src={CONTACT.facebookQr}
				alt="QR code to ORAIA on Facebook"
				style={{ width: "48mm", height: "48mm" }}
			/>
			<div class="flex flex-col gap-[3.2mm] text-[11.5pt] leading-tight">
				<p class="mb-[1mm] text-[12.5pt] font-medium uppercase tracking-wide">
					We love to hear
					<br />
					from you;
				</p>
				<ContactLine icon={<PhoneIcon />}>{CONTACT.phone}</ContactLine>
				<ContactLine icon={<InstagramIcon />}>{CONTACT.instagram}</ContactLine>
				<ContactLine icon={<MessengerIcon />}>
					<span class="tracking-[0.2em]">{CONTACT.messenger}</span>
				</ContactLine>
				<ContactLine icon={<PinIcon />}>{CONTACT.location}</ContactLine>
			</div>
		</div>
	);
}

function ContactLine(props: { icon: JSX.Element; children: JSX.Element }) {
	return (
		<p class="flex items-center gap-[2.5mm]">
			<span class="flex size-[6mm] shrink-0 items-center justify-center">
				{props.icon}
			</span>
			<span>{props.children}</span>
		</p>
	);
}

// Solid black icons with no fills behind them, so they print on any paper.
const icon = {
	viewBox: "0 0 24 24",
	class: "size-full",
} as const;

function PhoneIcon() {
	return (
		<svg aria-hidden="true" {...icon} fill="#111">
			<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
		</svg>
	);
}

function InstagramIcon() {
	return (
		<svg
			aria-hidden="true"
			{...icon}
			fill="none"
			stroke="#111"
			stroke-width="2"
		>
			<rect x="3" y="3" width="18" height="18" rx="5" />
			<circle cx="12" cy="12" r="4.2" />
			<circle cx="17.4" cy="6.6" r="1" fill="#111" stroke="none" />
		</svg>
	);
}

function MessengerIcon() {
	return (
		<svg aria-hidden="true" {...icon}>
			<path
				fill="#111"
				d="M12 2C6.4 2 2 6.1 2 11.6c0 2.9 1.2 5.4 3.1 7.1v3.3l3-1.7c1.2.3 2.5.5 3.9.5 5.6 0 10-4.1 10-9.6S17.6 2 12 2z"
			/>
			<path
				fill="none"
				stroke="#fff"
				stroke-width="1.6"
				stroke-linejoin="round"
				d="m6.5 14.2 3.6-3.9 2.5 2.1 3.9-3.9-3.6 3.9-2.5-2.1z"
			/>
		</svg>
	);
}

function PinIcon() {
	return (
		<svg aria-hidden="true" {...icon} fill="#111">
			<path
				fill-rule="evenodd"
				d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"
			/>
		</svg>
	);
}
