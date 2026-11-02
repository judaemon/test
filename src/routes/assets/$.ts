import { createFileRoute } from "@tanstack/solid-router";

// Only reached when no built file matches. During a deploy the old and new
// containers can both take traffic, so a file that exists may briefly 404.
// Without no-store, Cloudflare gives that 404 a 4-hour browser cache lifetime.
export const Route = createFileRoute("/assets/$")({
	server: {
		handlers: {
			GET: () =>
				new Response("Not found", {
					status: 404,
					headers: { "Cache-Control": "no-store" },
				}),
		},
	},
});
