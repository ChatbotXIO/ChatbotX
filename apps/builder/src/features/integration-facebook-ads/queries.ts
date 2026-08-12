import {
  buildContext,
  integrationFacebookAdsService,
} from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  type FacebookAdInsight,
  facebookAdsAuthSchema,
  integration as facebookAdsIntegration,
} from "@chatbotx.io/integration-facebook-ads"
import { withCache } from "@chatbotx.io/redis"

const FB_LIST_CACHE_TTL_SECONDS = 60
const FB_INSIGHTS_CACHE_TTL_SECONDS = 60 * 60

export const getFacebookAdsContext = async (workspaceId: string) => {
  const row =
    await integrationFacebookAdsService.findByWorkspaceIdOrFail(workspaceId)
  const auth = await encryptUtils.decryptObject(
    encryptedDataSchema.parse(row.auth),
    facebookAdsAuthSchema,
  )
  return buildContext({
    workspaceId,
    integrationType: "facebookAds",
    integration: { ...row, auth },
  })
}

export type FacebookAdsContext = Awaited<
  ReturnType<typeof getFacebookAdsContext>
>

export function getCachedAdAccounts(workspaceId: string) {
  return withCache(
    `fb-ads:ad-accounts:${workspaceId}`,
    async () => {
      const ctx = await getFacebookAdsContext(workspaceId)
      return facebookAdsIntegration.runAction("getAdAccounts", { ctx })
    },
    { ttl: FB_LIST_CACHE_TTL_SECONDS },
  )
}

export function getCachedCustomAudiences(input: {
  workspaceId: string
  adAccountId: string
}) {
  return withCache(
    `fb-ads:custom-audiences:${input.workspaceId}:${input.adAccountId}`,
    async () => {
      const ctx = await getFacebookAdsContext(input.workspaceId)
      return facebookAdsIntegration.runAction("getCustomAudiences", {
        ctx,
        props: { adAccountId: input.adAccountId },
      })
    },
    { ttl: FB_LIST_CACHE_TTL_SECONDS },
  )
}

/**
 * HIGH-4: `getContext` is resolved by the caller (once per request, shared
 * across every account in the fan-out — see `memoizeOnce` in analytics.ts)
 * instead of being resolved here inside the cache callback. Resolving it
 * here would re-fetch + re-decrypt the same workspace credential once per
 * account on every cache-miss fan-out. The resolved context (holding a
 * decrypted access token) is only ever passed in-memory — never itself
 * stored in `withCache`/Redis.
 */
export function getCachedAdInsights(input: {
  workspaceId: string
  adAccountId: string
  since: string
  until: string
  getContext: () => Promise<FacebookAdsContext>
}): Promise<FacebookAdInsight[]> {
  return withCache(
    `fb-ads:insights:v2:${input.workspaceId}:${input.adAccountId}:${input.since}:${input.until}`,
    async () => {
      const ctx = await input.getContext()
      return facebookAdsIntegration.runAction("getAdInsights", {
        ctx,
        props: {
          adAccountId: input.adAccountId,
          since: input.since,
          until: input.until,
        },
      })
    },
    { ttl: FB_INSIGHTS_CACHE_TTL_SECONDS },
  )
}

export function getCachedDailyAdInsights(input: {
  workspaceId: string
  adAccountId: string
  since: string
  until: string
  getContext: () => Promise<FacebookAdsContext>
}): Promise<FacebookAdInsight[]> {
  return withCache(
    `fb-ads:insights-daily:v1:${input.workspaceId}:${input.adAccountId}:${input.since}:${input.until}`,
    async () => {
      const ctx = await input.getContext()
      return facebookAdsIntegration.runAction("getAdInsights", {
        ctx,
        props: {
          adAccountId: input.adAccountId,
          since: input.since,
          until: input.until,
          timeIncrement: 1,
        },
      })
    },
    { ttl: FB_INSIGHTS_CACHE_TTL_SECONDS },
  )
}
