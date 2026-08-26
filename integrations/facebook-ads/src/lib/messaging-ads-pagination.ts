import { MAX_GRAPH_PAGES } from "../constants"
import { facebookAdsGraphClient } from "./http-client"

type GraphPage<T> = {
  data?: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

/**
 * Shared cursor-pagination helper for the messaging-ads API modules. `ad-
 * accounts.ts`/`insights.ts` each hand-roll their own copy of this — kept
 * separate here (rather than refactoring those two, which are stable,
 * already-tested modules) to avoid touching working code while adding the new
 * campaigns/adsets/adcreatives/ads listing endpoints.
 */
export async function fetchAllMessagingAdsPages<T>(
  endpoint: string,
  searchParams: Record<string, string>,
): Promise<T[]> {
  const results: T[] = []
  let after: string | undefined
  for (let page = 0; page < MAX_GRAPH_PAGES; page++) {
    const res = await facebookAdsGraphClient.get<GraphPage<T>>(endpoint, {
      searchParams: after ? { ...searchParams, after } : searchParams,
    })
    results.push(...(res.data ?? []))
    after = res.paging?.next ? res.paging.cursors?.after : undefined
    if (!after) {
      break
    }
  }
  return results
}
