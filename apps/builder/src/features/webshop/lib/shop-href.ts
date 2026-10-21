/**
 * A link inside the shop. Every page needs the signed `token`, so it rides
 * along on every internal link.
 */
export function shopHref(
  workspaceId: string,
  token: string,
  path = "",
  params: Record<string, string | number | null | undefined> = {},
): string {
  const query = new URLSearchParams({ token })
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value))
    }
  }
  return `/shop/${workspaceId}${path}?${query.toString()}`
}
