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
import { authClient } from '~/lib/auth-client'
import { startCartPersistence } from '~/lib/cart-store'
import { SITE_NAME, absoluteUrl } from '~/lib/site'
import { getCurrentUser } from '~/server/account'
import { getCatalog } from '~/server/catalog'

import styleCss from '../styles.css?url'

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>

/**
 * In the browser, who's signed in is kept between navigations: asking the
 * server on every one is a round trip each page waits for. Signing in, up or
 * out (or changing the account) clears it, and it's asked again now and then.
 * Server functions still check the session themselves.
 */
const USER_FRESH_MS = 5 * 60_000
let knownUser: { user: SessionUser; at: number } | undefined
if (typeof window !== 'undefined') {
  authClient.$store.listen('$sessionSignal', () => {
    knownUser = undefined
  })
}

export const Route = createRootRouteWithContext()({
  // Who's signed in (customer or staff), for the header and account pages.
  beforeLoad: async ({ abortController }) => {
    const inBrowser = typeof window !== 'undefined'
    if (inBrowser && knownUser && Date.now() - knownUser.at < USER_FRESH_MS)
      return { user: knownUser.user }
    const user = await getCurrentUser({ signal: abortController.signal })
    if (inBrowser) knownUser = { user, at: Date.now() }
    return { user }
  },
  loader: ({ abortController }) =>
    getCatalog({ signal: abortController.signal }),
  // The whole catalog: reloaded at most once a minute while browsing (and on
  // every preload otherwise). Staff edits invalidate it straight away, and
  // checkout prices the bag on the server whatever the shop showed.
  staleTime: 60_000,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // Defaults for share previews; pages override the title, text and image.
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'en_PH' },
      { property: 'og:image', content: absoluteUrl('/images/brand/share.png') },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'stylesheet', href: styleCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/images/brand/apple-touch-icon.png' },
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
