import { createFileRoute } from "@tanstack/solid-router";

import { getSessionUser } from "~/server/customer-auth";
import { getOrderById } from "~/server/orders-repo";
import { readUpload } from "~/server/uploads";

// Proof-of-delivery photos show someone's doorstep: only the customer who
// placed the order (or staff) may see them.
export const Route = createFileRoute("/api/orders/$orderId/delivery-photo")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const user = await getSessionUser();
				if (!user) return new Response("Unauthorized", { status: 401 });
				const order = getOrderById(params.orderId);
				const allowed = order && (user.isStaff || order.customerId === user.id);
				// 404 either way, so other customers can't probe which orders exist.
				if (!allowed || !order.delivery.photoFile)
					return new Response("Not found", { status: 404 });
				const file = await readUpload("delivery", order.delivery.photoFile);
				if (!file) return new Response("Not found", { status: 404 });
				return new Response(file.bytes, {
					headers: {
						"Content-Type": file.contentType,
						"Cache-Control": "private, no-store",
						"X-Content-Type-Options": "nosniff",
					},
				});
			},
		},
	},
});
