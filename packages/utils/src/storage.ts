const LEADING_SLASHES_RE = /^\/+/

/**
 * Join a stored object key onto a public storage base URL.
 *
 * `new URL(path, base)` is deceptively fragile here: a leading slash on `path`,
 * or a missing trailing slash on `base`, silently drops the base's own path
 * segment — e.g. the bucket in `https://cdn.example.com/chatbotx/`. Normalizing
 * both sides keeps the base (bucket prefix included) intact.
 *
 * An already-absolute `path` (http/https) is returned unchanged.
 */
export const getPublicFileUrl = (path: string, baseUrl: string): string => {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return new URL(path.replace(LEADING_SLASHES_RE, ""), base).toString()
}
