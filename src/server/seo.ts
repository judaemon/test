/**
 * Sections search engines should skip: sign-in walls, staff tools, one
 * customer's order. Used by robots.txt and to keep them out of the sitemap.
 */
export const PRIVATE_PATHS = [
	"/admin",
	"/account",
	"/active-orders",
	"/checkout",
	"/sign-in",
	"/order",
	"/pay",
	"/api",
	"/uploads/payments",
];

export function isPrivatePath(path: string) {
	return PRIVATE_PATHS.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
}

/**
 * The public address, e.g. https://oraiashop.com. Set SITE_URL in production:
 * behind a proxy the request's own origin can be the internal http one.
 */
export function siteUrl(request: Request) {
	return (process.env.SITE_URL ?? new URL(request.url).origin).replace(
		/\/+$/,
		"",
	);
}
