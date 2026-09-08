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
  "/t/",
]

/**
 * Whether the middleware lets a request through without a session.
 *
 * Matching is by path SEGMENT, never by bare `startsWith`: a plain prefix test
 * opens far more than the entry names — "/t" would also match "/templates",
 * and "/rpc" would match a future "/rpcadmin". A trailing slash on an entry is
 * therefore cosmetic here, and an entry still opens everything nested under it,
 * so the list is pinned by a test.
 */
export function isPublicRoute(pathname: string) {
  for (const route of PUBLIC_ROUTES) {
    const base = route.endsWith("/") ? route.slice(0, -1) : route
    if (pathname === base || pathname.startsWith(`${base}/`)) {
      return true
    }
  }
  return false
}
