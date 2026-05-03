import { distributedLock, distributedStore } from "@chatbotx.io/redis"
import { type AIContext, aiContextSchema } from "./schema"

const CACHE_TTL = 24 * 60 * 60 // 24 hours
const LOCK_TIMEOUT = 10 // 10 seconds

export const getAIContextKey = (conversationId: string) =>
  `ai:ctx:v1:${conversationId}`

export const aiContextStore = {
  async get(conversationId: string): Promise<AIContext | null> {
    const key = getAIContextKey(conversationId)
    const data = await distributedStore.hgetJson<Record<string, unknown>>(key)

    if (!data) {
      return null
    }

    const result = aiContextSchema.safeParse(data)
    if (!result.success) {
      return null
    }

    return result.data
  },

  async update(
    conversationId: string,
    data: Partial<AIContext>,
  ): Promise<void> {
    const key = getAIContextKey(conversationId)
    const updateData = {
      ...data,
      updatedAt: Date.now(),
    }

    await distributedStore.merge(key, updateData, CACHE_TTL)
  },

  async delete(conversationId: string): Promise<void> {
    const key = getAIContextKey(conversationId)
    await distributedStore.delete(key)
  },

  async runExclusive<T>(
    conversationId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `lock:${getAIContextKey(conversationId)}`
    return await distributedLock.runExclusive({
      key,
      timeoutInSeconds: LOCK_TIMEOUT,
      fn,
    })
  },
}
