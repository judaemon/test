import { Link } from "@tanstack/solid-router";

import { TAGLINE } from "~/lib/contact";
import { FlowerMark } from "./brand";

export function SiteFooter() {
	return (
		<footer class="border-t border-petal-100 bg-cream">
			<div class="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:px-6 lg:px-8">
				<Link
					to="/"
					class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					<FlowerMark class="size-6" />
					<span class="font-display type-soft text-lg font-semibold tracking-[0.25em] text-black">
						ORAIA
					</span>
				</Link>
				<p class="font-display text-base italic text-petal-900/80">{TAGLINE}</p>
				<Link
					to="/active-orders"
					class="py-2 text-sm font-medium text-petal-700 underline underline-offset-2"
				>
					Active orders
				</Link>
				<p class="text-sm text-petal-900/70">
					<span lang="el">ωραία</span> (oh-REH-ah) · Greek for “beautiful”
				</p>
				<p class="text-xs text-petal-900/50">
					© {new Date().getFullYear()} ORAIA Flowers. Made with love and a lot
					of ribbon.
				</p>
			</div>
		</footer>
	);
}
