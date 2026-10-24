import { Link } from "@tanstack/solid-router";

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
					<span class="font-display type-soft text-lg font-semibold tracking-[0.25em] text-petal-700">
						ORAIA
					</span>
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
