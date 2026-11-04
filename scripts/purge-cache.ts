/**
 * Drops the site's bundled images (public/: logo, size guide, sample
 * bouquets) from Cloudflare's cache, so a replaced file shows at once.
 * Browsers already check these on every visit (see vite.config.ts), so once
 * Cloudflare has the new file, shoppers see it.
 *
 *   bun run cache:purge --changed               only files changed since the
 *                                               last --changed run (deploys)
 *   bun run cache:purge                         every bundled file
 *   bun run cache:purge /images/brand/logo.svg  just these paths
 *   bun run cache:purge --everything            the whole site's cache
 *   bun run cache:purge --dry-run               list what would be purged
 *
 * --changed keeps a fingerprint of each file beside the database (it
 * survives redeploys) and purges only files that are new, changed or gone.
 * With no fingerprints yet (the first run) it purges every bundled file.
 *
 * Needs CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN (a token with the
 * Zone → Cache Purge permission). Without them it says so and does nothing,
 * so local runs and deploys without Cloudflare aren't affected.
 *
 * Uploaded photos and /assets/ never need purging: a changed file gets a new
 * name, so its address is new.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
	cloudflareConfigured,
	purgeCloudflare,
	purgePaths,
	siteUrl,
} from "../src/server/cloudflare-cache";

/** The built copy of public/, which is what the server sends. */
const PUBLIC_DIR = ".output/public";

/** Fingerprints from the last --changed run, next to the database. */
const FINGERPRINTS =
	process.env.CACHE_FINGERPRINTS_PATH ||
	join(
		dirname(process.env.DATABASE_PATH || ".data/oraia.sqlite"),
		"public-fingerprints.json",
	);

async function bundledPaths() {
	const files = await readdir(PUBLIC_DIR, { recursive: true, withFileTypes: true });
	return files
		.filter((f) => f.isFile())
		.map((f) => `/${relative(PUBLIC_DIR, join(f.parentPath, f.name)).split(sep).join("/")}`)
		// Hashed names: a changed file is a new address, nothing to purge.
		.filter((path) => !path.startsWith("/assets/"))
		.sort();
}

/** Each bundled file's path and a hash of its contents. */
async function fingerprints() {
	const result: Record<string, string> = {};
	for (const path of await bundledPaths()) {
		const bytes = await readFile(join(PUBLIC_DIR, path));
		result[path] = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
	}
	return result;
}

async function savedFingerprints(): Promise<Record<string, string> | null> {
	try {
		return JSON.parse(await readFile(FINGERPRINTS, "utf8"));
	} catch {
		return null;
	}
}

/** Paths that are new, changed or removed since the saved fingerprints. */
function changedPaths(
	before: Record<string, string>,
	now: Record<string, string>,
) {
	const paths = new Set([...Object.keys(before), ...Object.keys(now)]);
	return [...paths].filter((path) => before[path] !== now[path]).sort();
}

async function main() {
	const args = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
	const dryRun = process.argv.includes("--dry-run");
	if (!dryRun && !cloudflareConfigured()) {
		console.log(
			"Cache purge skipped: set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN to purge Cloudflare.",
		);
		return;
	}
	if (args.includes("--everything")) {
		if (dryRun) return console.log("Would purge everything.");
		await purgeCloudflare({ purge_everything: true });
		console.log("Purged everything from Cloudflare's cache.");
		return;
	}
	if (args.includes("--changed")) {
		const now = await fingerprints();
		const before = await savedFingerprints();
		const paths = before ? changedPaths(before, now) : Object.keys(now);
		if (paths.length === 0) {
			console.log("Bundled images unchanged since the last deploy: nothing to purge.");
			return;
		}
		if (dryRun) {
			const urls = paths.map(siteUrl);
			console.log(urls.join("\n"));
			console.log(
				`Would purge ${urls.length} ${before ? "changed" : "(first run: every)"} file(s).`,
			);
			return;
		}
		const urls = await purgePaths(paths);
		// Saved only once Cloudflare has taken the purge, so a failed one is retried next deploy.
		await writeFile(FINGERPRINTS, `${JSON.stringify(now, null, "\t")}\n`);
		console.log(
			`Purged ${urls.length} ${before ? "changed" : "(first run: every)"} file(s) from Cloudflare's cache: ${paths.join(", ")}`,
		);
		return;
	}
	const paths = args.length > 0 ? args : await bundledPaths();
	if (dryRun) {
		const urls = paths.map(siteUrl);
		console.log(urls.join("\n"));
		console.log(`Would purge ${urls.length} file(s).`);
		return;
	}
	const urls = await purgePaths(paths);
	console.log(`Purged ${urls.length} file(s) from Cloudflare's cache.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
