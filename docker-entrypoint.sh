#!/bin/sh
set -e

# First start on an empty disk: load the catalog from catalog-snapshot/.
# After that the database exists, so restarts and redeploys never touch it.
if [ ! -f "$DATABASE_PATH" ]; then
	echo "No database at $DATABASE_PATH: importing the catalog."
	bun scripts/catalog.ts import
fi

# A deploy may bring new or changed bundled images (public/): once this server
# is answering, drop the old copies of just those from Cloudflare so shoppers
# get the new ones. Unchanged images stay cached. In the background and allowed
# to fail, so it never holds up or stops the start.
(
	for _ in $(seq 1 60); do
		if bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
			bun scripts/purge-cache.ts --changed || echo "Cache purge failed; run bun run cache:purge by hand."
			exit 0
		fi
		sleep 2
	done
	echo "Server didn't answer in time; cache not purged."
) &

exec bun .output/server/index.mjs
