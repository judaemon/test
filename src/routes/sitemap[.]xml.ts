import { createFileRoute } from "@tanstack/solid-router";

import { listPublicProducts } from "~/server/catalog-repo";
import { isPrivatePath, siteUrl } from "~/server/seo";

interface RouteNode {
	options: { path?: string; component?: unknown };
	children?: RouteNode[];
}

/**
 * Pages that show another page and name it as their canonical address (/shop
 * is the home page). Listing them too tells Google two things at once.
 */
const DUPLICATE_PAGES = new Set(["/shop"]);

/**
 * Every public page with a fixed address, read from the route tree so a new
 * page file shows up without touching this list. Skips server-only routes
 * (no component), ones with params (`$`) and the private sections.
 */
async function listStaticPages() {
	// Imported lazily: the route tree imports this file.
	const { routeTree } = await import("~/routeTree.gen");
	const paths = new Set<string>();

	const walk = (node: RouteNode, parentPath: string) => {
		const { path, component } = node.options;
		// Pathless layouts (e.g. admin/_dashboard) have no path of their own.
		const fullPath =
			path === undefined
				? parentPath
				: `${parentPath}/${path}`.replace(/\/+/g, "/");
		const page = fullPath.replace(/(.)\/$/, "$1");
		if (
			component &&
			!page.includes("$") &&
			!isPrivatePath(page) &&
			!DUPLICATE_PAGES.has(page)
		) {
			paths.add(page);
		}
		for (const child of node.children ?? []) walk(child, fullPath);
	};
	for (const child of (routeTree as unknown as RouteNode).children ?? []) {
		walk(child, "/");
	}

	return [...paths].sort();
}

const escapeXml = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&apos;",
			})[char] ?? char,
	);

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const origin = siteUrl(request);
				const paths = [
					...(await listStaticPages()),
					// Visible bouquets only, so a hidden one drops out on the next fetch.
					...listPublicProducts().map(
						(product) => `/products/${encodeURIComponent(product.slug)}`,
					),
				];

				const urls = paths
					.map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`)
					.join("\n");
				const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

				return new Response(sitemap, {
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
