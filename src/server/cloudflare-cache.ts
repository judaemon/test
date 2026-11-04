import { SITE_URL } from "~/lib/site";

/**
 * Drops files from Cloudflare's cache, so a changed or withdrawn file stops
 * being served at once. Needs CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN (a
 * token with the Zone → Cache Purge permission); without them nothing is
 * purged and `cloudflareConfigured()` is false.
 */

/** Cloudflare's limit on addresses per purge request (free plan). */
const BATCH = 30;

export const cloudflareConfigured = () =>
	!!(process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_API_TOKEN);

/** The public address of a site path, e.g. `/images/brand/logo.svg`. */
export const siteUrl = (path: string) =>
	`${(process.env.SITE_URL || SITE_URL).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

export async function purgeCloudflare(body: object) {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/purge_cache`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		},
	);
	const result = (await response.json().catch(() => ({}))) as {
		success?: boolean;
		errors?: { message: string }[];
	};
	if (!response.ok || !result.success)
		throw new Error(
			`Cloudflare purge failed (${response.status}): ${result.errors?.map((e) => e.message).join("; ") || "no details"}`,
		);
}

/** Purges site paths, in batches Cloudflare accepts. */
export async function purgePaths(paths: string[]) {
	const urls = paths.map(siteUrl);
	for (let i = 0; i < urls.length; i += BATCH)
		await purgeCloudflare({ files: urls.slice(i, i + BATCH) });
	return urls;
}
