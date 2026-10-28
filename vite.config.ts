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
 * to Vite's static handler, which knows nothing about admin uploads. In
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
        const match = /^\/uploads\/(products|payments)\/([a-z0-9-]+)$/.exec(path)
        if (!match) return next()
        for (const [ext, type] of Object.entries(types)) {
          try {
            const bytes = await readFile(join(root, match[1], `${match[2]}.${ext}`))
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

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devUploads(),
    devtools(),
    nitro(),
    tailwindcss(),
    tanstackStart(),
    solidPlugin({ ssr: true }),
  ],
})
