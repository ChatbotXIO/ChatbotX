import { prisma } from "@aha.chat/database"
import { getRedisConnection } from "@aha.chat/worker-config"
import type { TriggerEventType } from "./types"
import { LRUCache } from "./utils/lru-cache"

const ramCache = new LRUCache<
  string,
  { data: Record<number, string[]>; timestamp: number }
>(50_000)

const RAM_TTL = 10_000
const REDIS_PREFIX = "trigger:cache:"
const REDIS_TTL = 3600

export async function hasActiveTriggers(
  chatbotId: string,
  eventTypes: TriggerEventType[],
  sourceId?: string,
): Promise<boolean> {
  const now = Date.now()
  const ramEntry = ramCache.get(chatbotId)

  if (ramEntry && now - ramEntry.timestamp < RAM_TTL) {
    for (const eventType of eventTypes) {
      const sourceIds = ramEntry.data[eventType]
      if (
        sourceIds &&
        (sourceIds.includes("*") || (sourceId && sourceIds.includes(sourceId)))
      ) {
        return true
      }
    }
    return false
  }

  if (ramEntry && now - ramEntry.timestamp >= RAM_TTL) {
    ramCache.delete(chatbotId)
  }

  try {
    const redis = getRedisConnection()
    const key = getCacheKey(chatbotId)
    const cached = await redis.get(key)

    if (cached) {
      const cacheData = JSON.parse(cached) as Record<number, string[]>

      ramCache.set(chatbotId, { data: cacheData, timestamp: now })

      for (const eventType of eventTypes) {
        const sourceIds = cacheData[eventType]
        if (
          sourceIds &&
          (sourceIds.includes("*") ||
            (sourceId && sourceIds.includes(sourceId)))
        ) {
          return true
        }
      }
      return false
    }
  } catch (error) {
    console.error("Redis trigger cache error:", error)
  }

  await updateTriggerCache(chatbotId)

  const freshEntry = ramCache.get(chatbotId)
  if (freshEntry) {
    for (const eventType of eventTypes) {
      const sourceIds = freshEntry.data[eventType]
      if (
        sourceIds &&
        (sourceIds.includes("*") || (sourceId && sourceIds.includes(sourceId)))
      ) {
        return true
      }
    }
  }

  return false
}

async function buildCacheData(
  chatbotId: string,
): Promise<Record<number, string[]>> {
  const triggers = await prisma.trigger.findMany({
    where: {
      chatbotId,
      active: true,
    },
    select: {
      triggerConditions: {
        select: {
          type: true,
          sourceId: true,
        },
      },
    },
  })

  const chatbotMap: Record<number, string[]> = {}

  for (const trigger of triggers) {
    for (const condition of trigger.triggerConditions) {
      if (!chatbotMap[condition.type]) {
        chatbotMap[condition.type] = []
      }
      const sourceId = condition.sourceId || "*"
      if (!chatbotMap[condition.type].includes(sourceId)) {
        chatbotMap[condition.type].push(sourceId)
      }
    }
  }

  return chatbotMap
}

export async function updateTriggerCache(chatbotId: string): Promise<void> {
  try {
    const chatbotMap = await buildCacheData(chatbotId)

    if (Object.keys(chatbotMap).length === 0) {
      return
    }

    ramCache.set(chatbotId, { data: chatbotMap, timestamp: Date.now() })

    const redis = getRedisConnection()
    const key = getCacheKey(chatbotId)

    await redis.setex(key, REDIS_TTL, JSON.stringify(chatbotMap))
  } catch (error) {
    console.error("Update trigger cache error:", error)
  }
}

export async function getCacheData(
  chatbotId: string,
): Promise<Record<number, string[]>> {
  const now = Date.now()
  const ramEntry = ramCache.get(chatbotId)

  if (ramEntry && now - ramEntry.timestamp < RAM_TTL) {
    return ramEntry.data
  }

  if (ramEntry && now - ramEntry.timestamp >= RAM_TTL) {
    ramCache.delete(chatbotId)
  }

  try {
    const redis = getRedisConnection()
    const key = getCacheKey(chatbotId)
    const cached = await redis.get(key)

    if (cached) {
      const cacheData = JSON.parse(cached) as Record<number, string[]>
      ramCache.set(chatbotId, { data: cacheData, timestamp: now })
      return cacheData
    }
  } catch (error) {
    console.error("Redis cache error:", error)
  }

  const chatbotMap = await buildCacheData(chatbotId)

  if (Object.keys(chatbotMap).length > 0) {
    ramCache.set(chatbotId, { data: chatbotMap, timestamp: Date.now() })

    try {
      const redis = getRedisConnection()
      const key = getCacheKey(chatbotId)

      await redis.setex(key, REDIS_TTL, JSON.stringify(chatbotMap))
    } catch (error) {
      console.error("Redis cache error:", error)
    }
  }

  return chatbotMap
}

export async function removeTriggerCache(chatbotId: string): Promise<void> {
  ramCache.delete(chatbotId)

  try {
    const redis = getRedisConnection()
    const key = getCacheKey(chatbotId)
    await redis.del(key)
  } catch (error) {
    console.error("Redis trigger cache error:", error)
  }
}

function cleanupExpiredCache(): void {
  const now = Date.now()

  for (const [chatbotId, entry] of ramCache.entries()) {
    if (now - entry.timestamp >= RAM_TTL) {
      ramCache.delete(chatbotId)
    }
  }
}

function getCacheKey(chatbotId: string): string {
  return `${REDIS_PREFIX}${chatbotId}`
}

setInterval(cleanupExpiredCache, 30_000)
