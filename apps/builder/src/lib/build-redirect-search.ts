import type { SearchParams } from "nuqs/server"

/**
 * Serializes a page's `searchParams` back into a query string so a redirect
 * stub can forward filters (e.g. `?account=…&from=…`) to the moved route.
 */
export function buildRedirectSearch(searchParams: SearchParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value)
      continue
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry)
      }
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}
