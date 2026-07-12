import {
  ADS_PAGE_LIMIT,
  DEFAULT_API_VERSION,
  MAX_GRAPH_PAGES,
} from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import type { FacebookAdAccount, FacebookCustomAudience } from "../schemas"

type GraphPage<T> = {
  data?: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

// `paging.next` is an absolute URL while the ky client is baseUrl-relative, so
// follow `paging.cursors.after` instead (mirrors integration-messenger).
async function fetchAllPages<T>(
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

export function getAdAccounts(
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<FacebookAdAccount[]> {
  const endpoint = `${version}/me/adaccounts`

  return rescue(endpoint, () =>
    fetchAllPages<FacebookAdAccount>(endpoint, {
      fields: "id,name",
      limit: String(ADS_PAGE_LIMIT),
      access_token: accessToken,
    }),
  )
}

export function getCustomAudiences(
  accessToken: string,
  adAccountId: string,
  version: string = DEFAULT_API_VERSION,
): Promise<FacebookCustomAudience[]> {
  const endpoint = `${version}/${adAccountId}/customaudiences`

  return rescue(endpoint, () =>
    fetchAllPages<FacebookCustomAudience>(endpoint, {
      fields: "id,name,subtype",
      limit: String(ADS_PAGE_LIMIT),
      access_token: accessToken,
    }),
  )
}
