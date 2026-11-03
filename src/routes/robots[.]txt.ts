import { createFileRoute } from "@tanstack/solid-router";

import { PRIVATE_PATHS, siteUrl } from "~/server/seo";

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const robots = [
					"User-agent: *",
					"Allow: /",
					...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
					"",
					`Sitemap: ${siteUrl(request)}/sitemap.xml`,
					"",
				].join("\n");

				return new Response(robots, {
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
