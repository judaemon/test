# Build. Dev dependencies hold the build tools, so they're installed even if
# the host passes NODE_ENV=production at build time.
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN NODE_ENV=development bun install --frozen-lockfile
COPY . .
RUN bun --bun run build

# Run. The built server needs no node_modules; scripts/, src/ and
# catalog-snapshot/ are here for the first-start catalog import.
FROM oven/bun:1.4.4-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	DATABASE_PATH=/data/oraia.sqlite \
	UPLOAD_DIR=/data/uploads
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/catalog-snapshot ./catalog-snapshot
COPY --from=build /app/package.json /app/tsconfig.json ./
COPY --from=build /app/docker-entrypoint.sh ./
# Windows checkouts can add CRLF, which breaks a shell script.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
	&& mkdir -p /data \
	&& chown -R bun:bun /app /data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD bun -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
