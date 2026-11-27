/** The Posts Connect tab. */
export const connectTabPath = (workspaceId: string): string =>
  `/space/${workspaceId}/posts/connect`

/**
 * Where the old Accounts tab URL goes: the Connect tab, keeping the query (the
 * outcome of a connect that started before the rename).
 */
export const buildConnectTabRedirect = (
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>,
): string => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        query.append(key, item)
      }
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ""
  return `${connectTabPath(workspaceId)}${suffix}`
}
