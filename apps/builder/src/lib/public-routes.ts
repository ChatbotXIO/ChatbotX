/**
 * Paths the proxy middleware lets through without a session.
 *
 * Kept in its own module so the list can be tested without importing the
 * middleware's server-only auth dependencies.
 */
export const PUBLIC_ROUTES = [
  "/integrations",
  "/r",
  "/l",
  "/dynamic-images",
  "/minigames",
  "/auth",
  "/api",
  // Like "/api": the RPC handler runs the full router, where every procedure
  // carries its own auth middleware and answers an unauthenticated call with
  // a 401. Redirecting here instead would hand the typed client the sign-in
  // page's HTML, which it cannot tell from a failed call.
  "/rpc",
  "/ws",
  "/storage",
  "/checkout",
  "/unsubscribe",
  "/email-topic",
  "/extensions",
  "/booking",
  "/portal/redeem",
  "/webchat",
  // Trailing slash is deliberate: `isPublicRoute` below is a bare
  // unanchored `startsWith`, so "/t" (no slash) would also match
  // "/templates" and make the authenticated template list world-readable.
  "/t/",
]

/**
 * Whether the middleware lets a request through without a session. A prefix
 * added to `PUBLIC_ROUTES` silently opens every path under it, so the list is
 * pinned by a test.
 */
export function isPublicRoute(pathname: string) {
  for (const route of PUBLIC_ROUTES) {
    if (pathname.startsWith(route)) {
      return true
    }
  }
  return false
}
