import { createFileRoute, Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import { FlowerMark, Sparkle, Wordmark } from "~/components/site/brand";
import { CONTACT, TAGLINE } from "~/lib/contact";
import { orderPromoLabel } from "~/lib/order-promo";
import { saleEndsText, saleLabel } from "~/lib/sale";
import { pageHead } from "~/lib/site";
import { useCustomSettings, useOrderPromos, useSales } from "~/lib/use-catalog";
import { getHelloNoteFn } from "~/server/hello";

/**
 * What the QR code on every dedication card opens: a note from ORAIA, what's
 * on sale, and every way to reach the shop. Made for a phone held in one hand.
 */
export const Route = createFileRoute("/hello")({
	loader: () => getHelloNoteFn(),
	head: () =>
		pageHead({
			title: "Hello from ORAIA",
			description:
				"ORAIA, a flower shop in Baguio City: our bouquets, promos running now, and how to reach us on Facebook, Instagram, Telegram and Signal.",
			path: CONTACT.helloPath,
		}),
	component: HelloPage,
});

const phoneHref = `tel:${CONTACT.phone.replace(/\s/g, "")}`;
const smsHref = `sms:${CONTACT.phone.replace(/\s/g, "")}`;

function HelloPage() {
	const note = Route.useLoaderData();
	const sales = useSales();
	const orderPromos = useOrderPromos();
	const custom = useCustomSettings();
	const promoCount = () => sales().length + orderPromos().length;

	return (
		<div class="min-h-screen bg-cream text-petal-900">
			<main class="mx-auto flex w-full max-w-md flex-col px-4 pb-12 pt-10">
				{/* ----- Who we are ----- */}
				<header class="flex flex-col items-center text-center">
					<FlowerMark class="size-16" />
					<Wordmark class="mt-4 text-2xl" />
					<p class="mt-1.5 font-display text-sm italic text-petal-700">
						{TAGLINE}
					</p>
				</header>

				{/* ----- The note ----- */}
				<section
					aria-labelledby="hello-heading"
					class="mt-8 rounded-3xl border border-petal-100 bg-white px-6 py-7 text-center shadow-[0_1px_2px_rgb(92_31_49/0.04)]"
				>
					<Sparkle class="mx-auto size-3.5 text-petal-500" />
					<h1
						id="hello-heading"
						class="mt-3 font-display type-soft text-2xl font-semibold leading-tight text-balance"
					>
						{note().heading}
					</h1>
					<p class="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-petal-900/75 text-pretty">
						{note().message}
					</p>
					<div class="mt-6 flex flex-col gap-2.5">
						<Link
							to="/shop"
							class="inline-flex h-12 items-center justify-center rounded-full bg-petal-700 px-6 font-medium text-white transition-colors outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2"
						>
							Shop bouquets
						</Link>
						<Show when={custom().enabled}>
							<Link
								to="/custom"
								class="inline-flex h-12 items-center justify-center rounded-full border border-petal-200 bg-white px-6 font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
							>
								Build your own bouquet
							</Link>
						</Show>
					</div>
				</section>

				{/* ----- On now ----- */}
				<Show when={promoCount()}>
					<section aria-labelledby="promos-heading" class="mt-8">
						<SectionTitle id="promos-heading">On now</SectionTitle>
						<div class="flex flex-col gap-2.5">
							<For each={sales()}>
								{(sale) => (
									<PromoRow
										name={sale.name}
										deal={`${saleLabel(sale)} each item`}
										note={saleEndsText(sale.endsOn)}
										tone="sale"
									/>
								)}
							</For>
							<For each={orderPromos()}>
								{(promo) => (
									<PromoRow
										name={promo.name}
										deal={orderPromoLabel(promo)}
										note="For cadets"
										tone="petal"
									/>
								)}
							</For>
						</div>
						<Link
							to="/promos"
							class="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-petal-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							How {promoCount() === 1 ? "it works" : "each one works"} →
						</Link>
					</section>
				</Show>

				{/* ----- Every way to reach us ----- */}
				<section aria-labelledby="links-heading" class="mt-8">
					<SectionTitle id="links-heading">Say hello</SectionTitle>
					<ul class="flex flex-col gap-2.5">
						<LinkRow
							href={CONTACT.facebookUrl}
							label="Facebook"
							detail="Follow us, or send a message"
							icon={<FacebookIcon />}
						/>
						<LinkRow
							href={CONTACT.instagramUrl}
							label="Instagram"
							detail={CONTACT.instagram}
							icon={<InstagramIcon />}
						/>
						<LinkRow
							href={CONTACT.telegramUrl}
							label="Telegram"
							detail="Message us on Telegram"
							icon={<TelegramIcon />}
						/>
						<LinkRow
							href={CONTACT.signalUrl}
							label="Signal"
							detail="Message us on Signal"
							icon={<SignalIcon />}
						/>
					</ul>
					<div class="mt-2.5 grid grid-cols-2 gap-2.5">
						<a
							href={phoneHref}
							class="flex h-12 items-center justify-center gap-2 rounded-2xl border border-petal-100 bg-white text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							<PhoneIcon />
							Call
						</a>
						<a
							href={smsHref}
							class="flex h-12 items-center justify-center gap-2 rounded-2xl border border-petal-100 bg-white text-sm font-medium transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							<TextIcon />
							Text
						</a>
					</div>
					<p class="mt-2 text-center text-sm tabular-nums text-petal-900/60">
						{CONTACT.phone}
					</p>
				</section>

				<footer class="mt-10 flex flex-col items-center gap-1 text-center text-xs text-petal-900/50">
					<span class="flex items-center gap-1.5">
						<PinIcon />
						{CONTACT.location}
					</span>
					<Link to="/" class="underline-offset-2 hover:underline">
						oraiashop.com
					</Link>
				</footer>
			</main>
		</div>
	);
}

function SectionTitle(props: { id: string; children: JSX.Element }) {
	return (
		<h2
			id={props.id}
			class="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-petal-900/55"
		>
			{props.children}
			<span aria-hidden="true" class="h-px flex-1 bg-petal-200/70" />
		</h2>
	);
}

function PromoRow(props: {
	name: string;
	deal: string;
	note: string;
	tone: "sale" | "petal";
}) {
	return (
		<Link
			to="/promos"
			class="flex items-center gap-3 overflow-hidden rounded-2xl border border-petal-100 bg-white p-3 pr-4 transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
		>
			<span
				class={
					props.tone === "sale"
						? "flex size-11 shrink-0 items-center justify-center rounded-xl bg-sale text-white"
						: "flex size-11 shrink-0 items-center justify-center rounded-xl bg-petal-700 text-white"
				}
				aria-hidden="true"
			>
				<TagIcon />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate font-semibold">{props.deal}</span>
				<span class="block truncate text-sm text-petal-900/60">
					{props.name} · {props.note}
				</span>
			</span>
			<Chevron />
		</Link>
	);
}

function LinkRow(props: {
	href: string;
	label: string;
	detail: string;
	icon: JSX.Element;
}) {
	return (
		<li>
			<a
				href={props.href}
				target="_blank"
				rel="noreferrer"
				class="flex items-center gap-3 rounded-2xl border border-petal-100 bg-white p-3 pr-4 transition-colors outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
			>
				<span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-petal-50">
					{props.icon}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block font-semibold">{props.label}</span>
					<span class="block truncate text-sm text-petal-900/60">
						{props.detail}
					</span>
				</span>
				<Chevron />
			</a>
		</li>
	);
}

// Brand marks in their own colors; the rest follow the text color.
const brand = {
	viewBox: "0 0 24 24",
	class: "size-6",
} as const;
const line = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "1.8",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

function FacebookIcon() {
	return (
		<svg aria-hidden="true" {...brand} fill="#1877f2">
			<path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
		</svg>
	);
}

function InstagramIcon() {
	return (
		<svg aria-hidden="true" {...brand}>
			<defs>
				<linearGradient id="ig-hello" x1="0" y1="1" x2="1" y2="0">
					<stop offset="0" stop-color="#feda75" />
					<stop offset="0.35" stop-color="#fa7e1e" />
					<stop offset="0.6" stop-color="#d62976" />
					<stop offset="1" stop-color="#4f5bd5" />
				</linearGradient>
			</defs>
			<rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-hello)" />
			<circle
				cx="12"
				cy="12"
				r="4.3"
				fill="none"
				stroke="#fff"
				stroke-width="1.9"
			/>
			<circle cx="17.4" cy="6.6" r="1.2" fill="#fff" />
		</svg>
	);
}

function TelegramIcon() {
	return (
		<svg aria-hidden="true" {...brand} fill="#229ed9">
			<path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.6 8.2-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9l11.3-4.4c.5-.2 1 .1.7 1Z" />
		</svg>
	);
}

function SignalIcon() {
	return (
		<svg aria-hidden="true" {...brand} fill="#3a76f0">
			<path d="M12 1.5C6.2 1.5 1.5 5.9 1.5 11.4c0 2.1.7 4 1.9 5.6L2.2 21.8l4.9-1.3c1.5.8 3.2 1.2 4.9 1.2 5.8 0 10.5-4.4 10.5-9.9S17.8 1.5 12 1.5Z" />
		</svg>
	);
}

function PhoneIcon() {
	return (
		<svg aria-hidden="true" {...line} class="size-4.5 text-petal-700">
			<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
		</svg>
	);
}

function TextIcon() {
	return (
		<svg aria-hidden="true" {...line} class="size-4.5 text-petal-700">
			<path d="M4 5h16v11H9l-5 4Z" />
			<path d="M8 9.5h8M8 12.5h5" />
		</svg>
	);
}

function TagIcon() {
	return (
		<svg aria-hidden="true" {...line} class="size-5">
			<path d="M3 12V4h8l10 10-8 8Z" />
			<circle cx="7.5" cy="8.5" r="1.3" />
		</svg>
	);
}

function PinIcon() {
	return (
		<svg aria-hidden="true" {...line} class="size-3.5">
			<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
			<circle cx="12" cy="9.5" r="2.3" />
		</svg>
	);
}

function Chevron() {
	return (
		<svg aria-hidden="true" {...line} class="size-4 shrink-0 text-petal-900/35">
			<path d="m9 6 6 6-6 6" />
		</svg>
	);
}
