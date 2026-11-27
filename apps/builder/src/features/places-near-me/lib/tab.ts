export type PlacesNearMeTab = "locations" | "categories"

export function parsePlacesNearMeTab(
  value: string | string[] | undefined,
): PlacesNearMeTab {
  const first = Array.isArray(value) ? value[0] : value
  return first === "categories" ? first : "locations"
}

// useDataTable URL keys (packages/ui/src/hooks/use-data-table.ts) plus the
// locations search filter; each belongs to one tab only.
const TAB_PARAM_KEYS = ["page", "perPage", "name"]

/** Search string for switching tabs: sets `tab` and drops tab-state keys. */
export function buildTabSearchParams(
  current: URLSearchParams | string,
  value: unknown,
): URLSearchParams {
  const params = new URLSearchParams(current)
  if (value === "categories") {
    params.set("tab", value)
  } else {
    params.delete("tab")
  }
  for (const key of TAB_PARAM_KEYS) {
    params.delete(key)
  }
  return params
}
