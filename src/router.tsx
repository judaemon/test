import { createRouter as createTanStackRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

import { getContext } from './integrations/tanstack-query/provider'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    context: getContext(),

    scrollRestoration: true,
    // Pages start loading when a link is hovered or touched, and what's
    // loaded is kept for the click that follows (30s, the router's default).
    defaultPreload: 'intent',
  })

  return router
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
