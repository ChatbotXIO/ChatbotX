export type MarketingMessagesTab = "campaigns" | "audiences" | "statistics"

export function parseMarketingMessagesTab(
  value: string | string[] | undefined,
): MarketingMessagesTab {
  const first = Array.isArray(value) ? value[0] : value
  return first === "audiences" || first === "statistics" ? first : "campaigns"
}

// useDataTable URL keys (packages/ui/src/hooks/use-data-table.ts) plus the
// Statistics toolbar's own filters; each belongs to one tab only.
const TAB_PARAM_KEYS = [
  "page",
  "perPage",
  "sort",
  "order",
  "adAccountId",
  "since",
  "until",
  "search",
]

/** Search string for switching tabs: sets `tab` and drops tab-state keys. */
export function buildTabSearchParams(
  current: URLSearchParams | string,
  value: unknown,
): URLSearchParams {
  const params = new URLSearchParams(current)
  if (value === "audiences" || value === "statistics") {
    params.set("tab", value)
  } else {
    params.delete("tab")
  }
  for (const key of TAB_PARAM_KEYS) {
    params.delete(key)
  }
  return params
}
