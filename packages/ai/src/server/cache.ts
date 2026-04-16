import { distributedStore, withCache } from "@chatbotx.io/redis"
import { env } from "../keys"
import { getAIIntegrationInDB } from "./factory"

export const getAIIntegrationCachedKey = (
  props: Record<string, string | number | boolean | undefined>,
) => {
  const sortedKeys = Object.keys(props)
    .filter((key) => props[key] !== undefined)
    .sort()
  const keyParts = sortedKeys.map((key) => `${key}:${props[key]}`).join(":")
  return `ai-integration:${keyParts}`
}

export const getCachedAIIntegration = (props: {
  workspaceId: string
  provider: string
  autoReply?: boolean
}) =>
  withCache(
    getAIIntegrationCachedKey(props),
    () => getAIIntegrationInDB(props),
    {
      ttl: env.AI_INTEGRATION_CACHE_TTL_SECONDS,
    },
  )

export const invalidateAIIntegrationCache = (
  workspaceId: string,
  provider: string,
) =>
  Promise.all([
    distributedStore.delete(
      getAIIntegrationCachedKey({ workspaceId, provider }),
    ),
    distributedStore.delete(
      getAIIntegrationCachedKey({ workspaceId, provider, autoReply: true }),
    ),
    distributedStore.delete(
      getAIIntegrationCachedKey({ workspaceId, provider, autoReply: false }),
    ),
  ])
