import { createFileRoute } from "@tanstack/solid-router";

import { getAuth } from "~/server/auth";

const handle = async ({ request }: { request: Request }) => {
	const auth = await getAuth();
	return auth.handler(request);
};

export const Route = createFileRoute("/api/auth/$")({
	server: { handlers: { GET: handle, POST: handle } },
});
