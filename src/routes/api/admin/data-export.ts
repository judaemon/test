import { createFileRoute } from "@tanstack/solid-router";
import { can } from "~/lib/permissions";
import { shopNow } from "~/lib/time";
import { getStaffUser } from "~/server/admin-auth";
import { hasExportToken, streamDataExport } from "~/server/data-export";

/**
 * The whole shop (database without login sessions, plus every upload) as a
 * zip, to load into a local copy with `bun run data:import`. For staff with
 * "Download the shop’s data", or `bun run data:pull` with `DATA_EXPORT_TOKEN`.
 */
export const Route = createFileRoute("/api/admin/data-export")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!hasExportToken(request)) {
					const user = await getStaffUser();
					if (!can(user, "data.export"))
						return new Response(
							"You don’t have permission to download the shop’s data.",
							{
								status: 403,
							},
						);
				}
				// Shop time, e.g. oraia-data-2026-11-05-1338.zip.
				const { date, minutes } = shopNow();
				const pad = (n: number) => String(n).padStart(2, "0");
				const stamp = `${date}-${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}`;
				return new Response(await streamDataExport(), {
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": `attachment; filename="oraia-data-${stamp}.zip"`,
						"Cache-Control": "private, no-store",
					},
				});
			},
		},
	},
});
