#!/bin/sh
set -e

# First start on an empty disk: load the catalog from catalog-snapshot/.
# After that the database exists, so restarts and redeploys never touch it.
if [ ! -f "$DATABASE_PATH" ]; then
	echo "No database at $DATABASE_PATH: importing the catalog."
	bun scripts/catalog.ts import
fi

exec bun .output/server/index.mjs
