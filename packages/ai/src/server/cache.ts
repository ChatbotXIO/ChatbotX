import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { distributedStore, withCache } from "@chatbotx.io/redis"
import { getAIIntegrationInDB } from "./factory"

const AI_CACHE_TTL = 3600 // 1 hour
type WithCacheTTLSignature = <T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
) => Promise<T>
const withCacheByTTL = withCache as unknown as WithCacheTTLSignature

export const getAIIntegrationCachedKey = (
  workspaceId: string,
  provider: string,
  autoReply?: boolean,
) => {
  return `workspaces:${workspaceId}:ai-integration:${provider}${autoReply === undefined ? "" : `:autoReply:${autoReply}`}`
}

export const getCachedAIIntegration = (props: {
  workspaceId: string
  provider: string
  autoReply?: boolean
}) => {
  const { workspaceId, provider, autoReply } = props
  return withCacheByTTL<
    IntegrationOpenAIModel | IntegrationGeminiModel | null | undefined
  >(
    getAIIntegrationCachedKey(workspaceId, provider, autoReply),
    AI_CACHE_TTL,
    () => getAIIntegrationInDB(props),
  )
}
export const invalidateAIIntegrationCache = (
  workspaceId: string,
  provider: string,
) => {
  return Promise.all([
    distributedStore.delete(getAIIntegrationCachedKey(workspaceId, provider)),
    distributedStore.delete(
      getAIIntegrationCachedKey(workspaceId, provider, true),
    ),
    distributedStore.delete(
      getAIIntegrationCachedKey(workspaceId, provider, false),
    ),
  ])
}
