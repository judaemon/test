import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'

import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

import '@fontsource/inter/400.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'

import { HydrationScript } from 'solid-js/web'
import { Suspense, onCleanup, onMount } from 'solid-js'

import { Toaster } from '~/components/ui/toast'
import { startCartPersistence } from '~/lib/cart-store'
import { SITE_NAME, absoluteUrl } from '~/lib/site'
import { getCurrentUser } from '~/server/account'
import { getCatalog } from '~/server/catalog'

import styleCss from '../styles.css?url'

export const Route = createRootRouteWithContext()({
  // Who's signed in (customer or staff), for the header and account pages.
  beforeLoad: async ({ abortController }) => ({
    user: await getCurrentUser({ signal: abortController.signal }),
  }),
  loader: ({ abortController }) =>
    getCatalog({ signal: abortController.signal }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // Defaults for share previews; pages override the title, text and image.
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'en_PH' },
      { property: 'og:image', content: absoluteUrl('/images/brand/logo.png') },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'stylesheet', href: styleCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/images/brand/logo.png' },
    ],
  }),
  shellComponent: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
      </head>
      <body>
        {/* Must live in <body> to stay reactive across client navigations; it portals into <head>. */}
        <HeadContent />
        <Suspense>
          <Outlet />
          <Toaster />
          <CartPersistence />
          <TanStackRouterDevtools />
        </Suspense>
        <Scripts />
      </body>
    </html>
  )
}

/** Restores the saved bag after hydration so server and client markup match. */
function CartPersistence() {
  onMount(() => onCleanup(startCartPersistence()))
  return null
}
