import { prisma } from "@aha.chat/database"
import { getRedisConnection } from "@aha.chat/worker-config"
import { LRUCache } from "lru-cache"

type CacheEntry = {
  data: Record<number, string[]>
  timestamp: number
}

export abstract class BaseCache {
  protected abstract cachePrefix: string
  protected abstract redisTTL: number
  protected abstract ramTTL: number
  protected abstract tableName: "trigger" | "webhook"

  private _ramCache?: LRUCache<string, CacheEntry>

  protected get ramCache(): LRUCache<string, CacheEntry> {
    if (!this._ramCache) {
      this._ramCache = new LRUCache<string, CacheEntry>({
        max: 50_000,
      })
    }
    return this._ramCache
  }

  protected getCacheKey(chatbotId: string): string {
    return `${this.cachePrefix}${chatbotId}`
  }

  protected async getCachedData(
    chatbotId: string,
  ): Promise<Record<number, string[]> | null> {
    const cached = this.ramCache.get(chatbotId)
    if (cached && Date.now() - cached.timestamp < this.ramTTL) {
      return cached.data
    }

    try {
      const redis = getRedisConnection()
      const key = this.getCacheKey(chatbotId)
      const data = await redis.get(key)

      if (data) {
        const parsed = JSON.parse(data) as Record<number, string[]>
        this.ramCache.set(chatbotId, { data: parsed, timestamp: Date.now() })
        return parsed
      }
    } catch (error) {
      console.error(`Redis get error (${this.tableName}):`, error)
    }

    return null
  }

  protected async buildCacheData(
    chatbotId: string,
  ): Promise<Record<number, string[]>> {
    const table = this.tableName === "trigger" ? prisma.trigger : prisma.webhook

    const items = await table.findMany({
      where: {
        chatbotId,
        active: true,
      },
      select: {
        conditions: {
          select: {
            type: true,
            sourceId: true,
          },
        },
      },
    })

    const chatbotMap: Record<number, string[]> = {}

    for (const item of items) {
      for (const condition of item.conditions) {
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

  protected checkEventTypes(
    chatbotMap: Record<number, string[]>,
    eventTypes: number[],
    sourceId?: string,
  ): boolean {
    for (const eventType of eventTypes) {
      const sourceIds = chatbotMap[eventType]
      if (!sourceIds) {
        continue
      }

      if (sourceIds.includes("*")) {
        return true
      }

      if (sourceId && sourceIds.includes(sourceId)) {
        return true
      }
    }

    return false
  }

  async hasActive(
    chatbotId: string,
    eventTypes: number[],
    sourceId?: string,
  ): Promise<boolean> {
    const cached = await this.getCachedData(chatbotId)

    if (!cached) {
      const chatbotMap = await this.buildCacheData(chatbotId)

      if (Object.keys(chatbotMap).length === 0) {
        return false
      }

      this.ramCache.set(chatbotId, { data: chatbotMap, timestamp: Date.now() })

      try {
        const redis = getRedisConnection()
        const key = this.getCacheKey(chatbotId)
        await redis.setex(key, this.redisTTL, JSON.stringify(chatbotMap))
      } catch (error) {
        console.error(`Redis setex error (${this.tableName}):`, error)
      }

      return this.checkEventTypes(chatbotMap, eventTypes, sourceId)
    }

    return this.checkEventTypes(cached, eventTypes, sourceId)
  }

  async updateCache(chatbotId: string): Promise<void> {
    try {
      const chatbotMap = await this.buildCacheData(chatbotId)

      if (Object.keys(chatbotMap).length === 0) {
        await this.removeCache(chatbotId)
        return
      }

      this.ramCache.set(chatbotId, { data: chatbotMap, timestamp: Date.now() })

      const redis = getRedisConnection()
      const key = this.getCacheKey(chatbotId)

      await redis.setex(key, this.redisTTL, JSON.stringify(chatbotMap))
    } catch (error) {
      console.error(`Update cache error (${this.tableName}):`, error)
    }
  }

  async removeCache(chatbotId: string): Promise<void> {
    try {
      this.ramCache.delete(chatbotId)

      const redis = getRedisConnection()
      const key = this.getCacheKey(chatbotId)
      await redis.del(key)
    } catch (error) {
      console.error(`Remove cache error (${this.tableName}):`, error)
    }
  }

  async getCacheData(chatbotId: string): Promise<Record<number, string[]>> {
    const cached = await this.getCachedData(chatbotId)

    if (cached) {
      return cached
    }

    const chatbotMap = await this.buildCacheData(chatbotId)

    if (Object.keys(chatbotMap).length > 0) {
      this.ramCache.set(chatbotId, { data: chatbotMap, timestamp: Date.now() })

      try {
        const redis = getRedisConnection()
        const key = this.getCacheKey(chatbotId)
        await redis.setex(key, this.redisTTL, JSON.stringify(chatbotMap))
      } catch (error) {
        console.error(`Redis cache error (${this.tableName}):`, error)
      }
    }

    return chatbotMap
  }

  cleanupExpiredCache(): void {
    const now = Date.now()

    for (const [chatbotId, entry] of Array.from(this.ramCache.entries())) {
      if (now - entry.timestamp >= this.ramTTL) {
        this.ramCache.delete(chatbotId)
      }
    }
  }
}
