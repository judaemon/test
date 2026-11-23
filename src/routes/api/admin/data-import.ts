import { createFileRoute } from "@tanstack/solid-router";

import { can } from "~/lib/permissions";
import { getStaffUser } from "~/server/admin-auth";
import {
	DataImportError,
	dataImportAllowed,
	loadDataExport,
} from "~/server/data-import";
import { closeDb } from "~/server/db";

/**
 * Replaces this computer's shop with a zip from Download all data, for the
 * owner on a local copy. Refused on the live server. The body is the zip.
 */
export const Route = createFileRoute("/api/admin/data-import")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				if (!dataImportAllowed())
					return Response.json(
						{
							ok: false,
							message: "Importing only works on your own computer.",
						},
						{ status: 403 },
					);
				const user = await getStaffUser();
				if (!can(user, "data.import"))
					return Response.json(
						{
							ok: false,
							message: "You don’t have permission to replace the shop’s data.",
						},
						{ status: 403 },
					);
				try {
					const zip = new Uint8Array(await request.arrayBuffer());
					const summary = await loadDataExport(zip, closeDb);
					return Response.json({ ok: true, summary });
				} catch (error) {
					if (error instanceof DataImportError)
						return Response.json(
							{ ok: false, message: error.message },
							{ status: 400 },
						);
					throw error;
				}
			},
		},
	},
});
