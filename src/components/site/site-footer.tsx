import { Link } from "@tanstack/solid-router";

import { TAGLINE } from "~/lib/contact";
import { FlowerMark } from "./brand";

export function SiteFooter() {
	return (
		<footer class="border-t border-petal-100 bg-cream">
			<div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
				{/* The brand stays centered; everything else sits in a split bar below. */}
				<div class="flex flex-col items-center gap-3 text-center">
					<Link
						to="/"
						class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						<FlowerMark class="size-6" />
						<span class="font-display type-soft text-lg font-semibold tracking-[0.25em] text-black">
							ORAIA
						</span>
					</Link>
					<p class="font-display text-base italic text-petal-900/80">
						{TAGLINE}
					</p>
				</div>
				<div class="mt-8 flex flex-col-reverse items-center gap-3 border-t border-petal-100 pt-6 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
					<p class="text-xs text-petal-900/50">
						© {new Date().getFullYear()} ORAIA Flowers. Made with love and a lot
						of ribbon.
					</p>
					<div class="flex flex-col items-center gap-1 sm:items-end sm:text-right">
						<p class="text-sm text-petal-900/70">
							<span lang="el">ωραία</span> (oh-REH-ah) · Greek for “beautiful”
						</p>
						<Link
							to="/active-orders"
							class="py-2 text-sm font-medium text-petal-700 underline underline-offset-2"
						>
							Check your order
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
