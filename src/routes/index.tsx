import { createFileRoute, Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import {
	ChevronRightIcon,
	LeafIcon,
	TruckIcon,
} from "~/components/product/icons";
import { FlowerMark, Petal, Sparkle } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { showToast } from "~/components/ui/toast";
import { products } from "~/data/products";
import { formatPrice, getVariantPrice } from "~/lib/product";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "ORAIA · Little blooms for big feelings" },
			{
				name: "description",
				content:
					"Sweet, hand-tied bouquets in four dreamy colors, delivered same day by ORAIA.",
			},
		],
	}),
	component: Home,
});

const featured = products[0];

const moods: Record<string, string> = {
	"red-velvet": "For grand, swoony romance",
	"pastel-pink": "For sweet hellos & birthdays",
	"cream-white": "For quiet thank-yous",
	"sunset-coral": "For sunny, just-because days",
};

const primaryCta =
	"inline-flex h-12 items-center justify-center gap-2 rounded-full bg-petal-700 px-7 text-base font-medium text-white shadow-[0_6px_20px_-6px] shadow-petal-700/60 transition-all hover:-translate-y-0.5 hover:bg-petal-900 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream";
const secondaryCta =
	"inline-flex h-12 items-center justify-center rounded-full border border-petal-200 bg-white/70 px-7 text-base font-medium text-petal-900 transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream";

function Home() {
	return (
		<div class="min-h-screen bg-cream text-petal-900">
			<SiteHeader />
			<main>
				<Hero />
				<ColorPicker />
				<About />
				<PetalClub />
			</main>
			<SiteFooter />
		</div>
	);
}

function Hero() {
	return (
		<section class="relative overflow-hidden">
			<Petal class="pointer-events-none absolute -left-4 top-24 w-10 rotate-[-30deg] text-petal-200 motion-safe:animate-float-slow" />
			<Petal class="pointer-events-none absolute left-[46%] top-10 hidden w-6 rotate-[25deg] text-petal-300/70 motion-safe:animate-float md:block" />
			<Sparkle class="pointer-events-none absolute right-6 top-8 w-5 text-butter motion-safe:animate-float" />

			<div class="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-2 md:pb-24 md:pt-16 lg:px-8">
				<div class="relative z-10 text-center md:text-left">
					<p class="inline-flex items-center gap-2 rounded-full bg-petal-100 px-4 py-1.5 text-sm font-medium text-petal-700">
						<FlowerMark class="size-4" />
						Hand-tied fresh every morning
					</p>
					<h1 class="mt-6 font-display font-soft text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
						Little blooms for{" "}
						<em class="relative whitespace-nowrap italic text-petal-700">
							big
							<svg
								aria-hidden="true"
								viewBox="0 0 120 12"
								preserveAspectRatio="none"
								class="absolute -bottom-1 left-0 h-2.5 w-full text-petal-300"
							>
								<path
									d="M2 8c20-6 40-6 58-2s38 4 58-3"
									fill="none"
									stroke="currentColor"
									stroke-width="4"
									stroke-linecap="round"
								/>
							</svg>
						</em>{" "}
						feelings.
					</h1>
					<p class="mx-auto mt-6 max-w-md text-lg leading-relaxed text-petal-900/70 md:mx-0">
						Sweet, hand-tied bouquets in four dreamy colors — delivered same day
						and finished with a bow.
					</p>
					<div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start">
						<Show when={featured}>
							{(product) => (
								<Link
									to="/products/$productId"
									params={{ productId: product().id }}
									class={primaryCta}
								>
									Shop bouquets
									<ChevronRightIcon class="size-4" />
								</Link>
							)}
						</Show>
						<Link to="/" hash="colors" class={secondaryCta}>
							Find your color
						</Link>
					</div>
					<Show when={featured}>
						{(product) => (
							<p class="mt-5 text-sm text-petal-900/60">
								From {formatPrice(product().basePrice, product().currency)} ·
								Free same-day delivery before 2pm
							</p>
						)}
					</Show>
				</div>

				<div class="relative mx-auto w-full max-w-md md:max-w-none">
					<div class="absolute inset-4 -z-0 translate-x-3 translate-y-3 rounded-[58%_42%_52%_48%/46%_56%_44%_54%] bg-sage-100" />
					<div class="relative aspect-square overflow-hidden rounded-[58%_42%_52%_48%/46%_56%_44%_54%] bg-petal-100 shadow-[0_30px_60px_-30px] shadow-petal-700/40">
						<img
							src="/images/bouquets/pastel-pink-front.svg"
							alt="A pastel pink rose bouquet wrapped in cream paper with a pink bow"
							width={800}
							height={800}
							class="size-full object-cover"
						/>
					</div>
					<div class="absolute -left-1 bottom-6 flex size-24 rotate-[-10deg] flex-col items-center justify-center rounded-full bg-butter text-center shadow-md sm:size-28 motion-safe:animate-float-slow">
						<span class="font-display font-soft text-xl font-semibold leading-none sm:text-2xl">
							fresh
						</span>
						<span class="text-xs font-medium sm:text-sm">today!</span>
					</div>
					<Sparkle class="pointer-events-none absolute -right-1 top-6 w-7 text-petal-300 motion-safe:animate-float" />
					<Petal class="pointer-events-none absolute -top-3 left-10 w-8 rotate-[40deg] text-petal-300 motion-safe:animate-float-slow" />
				</div>
			</div>
		</section>
	);
}

function ColorPicker() {
	return (
		<section id="colors" class="scroll-mt-20 bg-white/60 py-16 md:py-24">
			<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Shop by color"
					title="Pick your mood"
					subtitle="Same lovely bouquet, four sweet personalities."
				/>
				<Show when={featured}>
					{(product) => (
						<ul class="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
							<For each={product().variants}>
								{(variant) => (
									<li>
										<Link
											to="/products/$productId"
											params={{ productId: product().id }}
											search={{ variant: variant.id }}
											class="group flex flex-col items-center rounded-3xl p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
										>
											<span class="relative block w-full max-w-52">
												<img
													src={variant.images[1] ?? variant.images[0]}
													alt=""
													width={400}
													height={400}
													loading="lazy"
													class={cn(
														"aspect-square w-full rounded-full object-cover ring-4 ring-white shadow-[0_18px_40px_-20px] shadow-petal-900/40 transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-6",
														!variant.inStock && "opacity-60 grayscale-[35%]",
													)}
												/>
												<span
													aria-hidden="true"
													class="absolute bottom-1 right-1 size-7 rounded-full border-4 border-white"
													style={{ "background-color": variant.colorHex }}
												/>
											</span>
											<span class="mt-5 font-display font-soft text-xl font-semibold">
												{variant.colorName}
											</span>
											<span class="mt-1 text-sm text-petal-900/65">
												{moods[variant.id]}
											</span>
											<Show
												when={variant.inStock}
												fallback={
													<span class="mt-3 rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-600">
														Back soon
													</span>
												}
											>
												<span class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-petal-700">
													{formatPrice(
														getVariantPrice(product(), variant),
														product().currency,
													)}
													<ChevronRightIcon class="size-3.5 transition-transform group-hover:translate-x-0.5" />
												</span>
											</Show>
										</Link>
									</li>
								)}
							</For>
						</ul>
					)}
				</Show>
			</div>
		</section>
	);
}

const promises: Array<{
	title: string;
	body: string;
	icon: () => JSX.Element;
}> = [
	{
		title: "Hand-tied daily",
		body: "Our florists wrap every bouquet the morning it leaves the studio.",
		icon: () => <FlowerMark class="size-7" />,
	},
	{
		title: "Same-day delivery",
		body: "Order before 2pm and it’s on their doorstep by evening.",
		icon: () => <TruckIcon class="size-6 text-petal-700" />,
	},
	{
		title: "7-day freshness",
		body: "Every stem travels in a hydration pack, so the smiles last all week.",
		icon: () => <LeafIcon class="size-6 text-sage-600" />,
	},
];

function About() {
	return (
		<section id="about" class="scroll-mt-20 py-16 md:py-24">
			<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Our little story"
					title="Small shop, big heart"
					subtitle={
						<>
							ORAIA comes from <span lang="el">ωραία</span>, the Greek word for
							“beautiful”. We started with one simple wish: make sending flowers
							feel as lovely as receiving them.
						</>
					}
				/>
				<ul class="mt-12 grid gap-5 sm:grid-cols-3">
					<For each={promises}>
						{(promise) => (
							<li class="flex flex-col items-center rounded-3xl border border-petal-100 bg-white/70 px-6 py-8 text-center">
								<span class="flex size-14 items-center justify-center rounded-full bg-petal-50">
									{promise.icon()}
								</span>
								<h3 class="mt-4 font-display font-soft text-lg font-semibold">
									{promise.title}
								</h3>
								<p class="mt-2 text-sm leading-relaxed text-petal-900/65">
									{promise.body}
								</p>
							</li>
						)}
					</For>
				</ul>
			</div>
		</section>
	);
}

function PetalClub() {
	const handleSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		form.reset();
		showToast({
			variant: "success",
			title: "You’re in the petal club!",
			description: "Look out for a little something sweet in your inbox.",
			duration: 4000,
		});
	};

	return (
		<section class="px-4 pb-16 sm:px-6 md:pb-24 lg:px-8">
			<div class="relative mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] bg-petal-100 px-6 py-12 text-center sm:px-12">
				<Petal class="pointer-events-none absolute -left-2 top-6 w-10 rotate-[-20deg] text-petal-200" />
				<Petal class="pointer-events-none absolute -right-1 bottom-4 w-12 rotate-[150deg] text-petal-200" />
				<Sparkle class="pointer-events-none absolute right-10 top-8 w-5 text-white" />
				<h2 class="font-display font-soft text-3xl font-semibold sm:text-4xl">
					Join the petal club
				</h2>
				<p class="mx-auto mt-3 max-w-md text-petal-900/70">
					Seasonal colors, first dibs on limited bouquets, and 10% off your
					first order.
				</p>
				<form
					onSubmit={handleSubmit}
					class="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
				>
					<label for="petal-club-email" class="sr-only">
						Email address
					</label>
					<input
						id="petal-club-email"
						name="email"
						type="email"
						required
						autocomplete="email"
						placeholder="you@example.com"
						class="h-12 flex-1 rounded-full border border-petal-200 bg-white px-5 text-base text-petal-900 placeholder:text-petal-900/40 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
					/>
					<button type="submit" class={primaryCta}>
						Sign me up
					</button>
				</form>
			</div>
		</section>
	);
}

function SectionHeading(props: {
	eyebrow: string;
	title: string;
	subtitle: JSX.Element;
}) {
	return (
		<div class="mx-auto max-w-2xl text-center">
			<p class="text-sm font-medium uppercase tracking-[0.2em] text-petal-700">
				{props.eyebrow}
			</p>
			<h2 class="mt-3 font-display font-soft text-4xl font-semibold tracking-tight sm:text-5xl">
				{props.title}
			</h2>
			<p class="mt-4 text-lg leading-relaxed text-petal-900/70">
				{props.subtitle}
			</p>
		</div>
	);
}
