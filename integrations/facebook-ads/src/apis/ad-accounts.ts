import { z } from "zod"
import {
  ADS_PAGE_LIMIT,
  DEFAULT_API_VERSION,
  MAX_GRAPH_PAGES,
} from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import type { AdAccountDetails } from "../messaging-ads/types"
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

const adAccountDetailsResponseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  currency: z.string(),
  timezone_name: z.string(),
  account_status: z.number(),
  // Phase 0 confirm: no Meta ad account field is documented as a universal
  // "minimum daily budget" guarantee — `min_daily_budget` is requested
  // best-effort and may be absent for some accounts/currencies.
  min_daily_budget: z.number().optional(),
})

/**
 * Extends the bare `getAdAccounts` listing with the fields the messaging-ads
 * wizard needs before it can render a budget input: currency (to label the
 * input), timezone (for schedule display), account status (advertisable
 * check), and a best-effort minimum daily budget.
 */
export function getAdAccountDetails(
  accessToken: string,
  adAccountId: string,
  version: string = DEFAULT_API_VERSION,
): Promise<AdAccountDetails> {
  const endpoint = `${version}/${adAccountId}`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: {
        fields:
          "id,name,currency,timezone_name,account_status,min_daily_budget",
        access_token: accessToken,
      },
    })
    const parsed = adAccountDetailsResponseSchema.parse(response)
    return {
      id: parsed.id,
      name: parsed.name,
      currency: parsed.currency,
      timezoneName: parsed.timezone_name,
      accountStatus: parsed.account_status,
      minDailyBudgetMinorUnits: parsed.min_daily_budget,
    }
  })
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
