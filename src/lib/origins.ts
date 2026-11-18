/**
 * The site answers on both oraiashop.com and www.oraiashop.com, so sign-in
 * must trust both. Only the base URL is trusted by default, and sign-in from
 * the other one fails with "Invalid origin" (a private window that
 * autocompletes to www couldn't sign in).
 */
export function siblingOrigins(baseUrl: string | undefined): string[] {
	if (!baseUrl) return [];
	try {
		const url = new URL(baseUrl);
		if (url.hostname === "localhost" || /^[\d.]+$/.test(url.hostname))
			return [];
		const other = new URL(url.origin);
		other.hostname = url.hostname.startsWith("www.")
			? url.hostname.slice(4)
			: `www.${url.hostname}`;
		return [other.origin];
	} catch {
		return [];
	}
}
