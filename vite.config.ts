import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from 'vite-plugin-solid'
import { nitro } from 'nitro/vite'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Dev only: Nitro's dev server hands image requests (`sec-fetch-dest: image`)
 * to Vite's static handler, which knows nothing about uploads. In
 * production they're served by the `/uploads/$` route instead.
 */
function devUploads(): Plugin {
  const root = process.env.UPLOAD_DIR ?? '.data/uploads'
  const types = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
  return {
    name: 'oraia:dev-uploads',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        // `<id>`, `<id>.jpg`, or a card-sized copy `<id>-w640.jpg`; like the
        // `/uploads/$` route, a copy that isn't made yet falls back to the photo.
        const match =
          /^\/uploads\/(products|payments|references)\/([a-z0-9-]+?)(-w\d+)?(?:\.(?:png|jpg|webp))?$/.exec(path)
        if (!match) return next()
        const names = match[3] ? [`${match[2]}${match[3]}`, match[2]] : [match[2]]
        for (const [name, [ext, type]] of names.flatMap((n) =>
          Object.entries(types).map((t) => [n, t] as const),
        )) {
          try {
            const bytes = await readFile(join(root, match[1], `${name}.${ext}`))
            res.setHeader('Content-Type', type)
            res.setHeader('X-Content-Type-Options', 'nosniff')
            res.end(bytes)
            return
          } catch {
            // Try the next extension.
          }
        }
        next()
      })
    },
  }
}

/** Browsers revalidate every time; Cloudflare (s-maxage) keeps a week. */
const STATIC_IMAGE_CACHE = 'public, max-age=0, must-revalidate, s-maxage=604800'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devUploads(),
    devtools(),
    nitro({
      // Bundled images in public/ (logo, size guide, sample bouquets). Unlike
      // /assets/ and uploads, their names stay the same when the file changes,
      // so browsers check each time (a quick 304 from Cloudflare) while
      // Cloudflare keeps them a week. Each deploy purges them from Cloudflare
      // (scripts/purge-cache.ts), so a replaced image shows at once.
      routeRules: {
        '/images/**': { headers: { 'cache-control': STATIC_IMAGE_CACHE } },
        '/favicon.svg': { headers: { 'cache-control': STATIC_IMAGE_CACHE } },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    solidPlugin({ ssr: true }),
  ],
})
