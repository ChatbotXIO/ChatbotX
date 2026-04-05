import { db } from "@chatbotx.io/database/client"
import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { LRUCache } from "lru-cache"

type CacheEntry = {
  data: Record<number, string[]>
  timestamp: number
}

export abstract class BaseCache {
  protected abstract cachePrefix: string
  protected abstract redisTTL: number
  protected abstract ramTTL: number
  protected abstract getTableName(): string

  private _ramCache?: LRUCache<string, CacheEntry>

  protected get ramCache(): LRUCache<string, CacheEntry> {
    if (!this._ramCache) {
      this._ramCache = new LRUCache<string, CacheEntry>({
        max: 50_000,
      })
    }
    return this._ramCache
  }

  protected getCacheKey(workspaceId: string): string {
    return `${this.cachePrefix}${workspaceId}`
  }

  protected async getCachedData(
    workspaceId: string,
  ): Promise<Record<TriggerEventType, string[]> | null> {
    const cacheKey = this.getCacheKey(workspaceId)
    const cached = this.ramCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.ramTTL) {
      return cached.data as Record<TriggerEventType, string[]>
    }

    try {
      const redis = getRedisConnection()
      const data = await redis.get(cacheKey)

      if (data) {
        const parsed = JSON.parse(data) as Record<TriggerEventType, string[]>
        this.ramCache.set(cacheKey, { data: parsed, timestamp: Date.now() })
        return parsed
      }
    } catch (error) {
      console.error("Redis get error (cache):", error)
    }

    return null
  }

  protected async buildCacheData(
    workspaceId: string,
  ): Promise<Record<TriggerEventType, string[]>> {
    const tableName = this.getTableName()

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic table access
    const items = await (db.query as Record<string, any>)[tableName].findMany({
      where: {
        workspaceId,
        active: true,
      },
      with: {
        conditions: {
          columns: {
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

    return chatbotMap as Record<TriggerEventType, string[]>
  }

  protected checkEventTypes(
    chatbotMap: Record<TriggerEventType, string[]>,
    eventTypes: TriggerEventType[],
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

      if (sourceId && sourceIds.includes(sourceId.toString())) {
        return true
      }
    }

    return false
  }

  async hasActive(
    workspaceId: string,
    eventTypes: TriggerEventType[],
    sourceId?: string,
  ): Promise<boolean> {
    const cached = await this.getCachedData(workspaceId)

    if (!cached) {
      const chatbotMap = await this.buildCacheData(workspaceId)

      if (Object.keys(chatbotMap).length === 0) {
        return false
      }

      const cacheKey = this.getCacheKey(workspaceId)
      this.ramCache.set(cacheKey, { data: chatbotMap, timestamp: Date.now() })

      try {
        const redis = getRedisConnection()
        await redis.setex(cacheKey, this.redisTTL, JSON.stringify(chatbotMap))
      } catch (error) {
        console.error("Redis setex error (cache):", error)
      }

      return this.checkEventTypes(chatbotMap, eventTypes, sourceId)
    }

    return this.checkEventTypes(cached, eventTypes, sourceId)
  }

  async updateCache(workspaceId: string): Promise<void> {
    try {
      const chatbotMap = await this.buildCacheData(workspaceId)

      if (Object.keys(chatbotMap).length === 0) {
        await this.removeCache(workspaceId)
        return
      }

      const cacheKey = this.getCacheKey(workspaceId)
      this.ramCache.set(cacheKey, { data: chatbotMap, timestamp: Date.now() })

      const redis = getRedisConnection()
      await redis.setex(cacheKey, this.redisTTL, JSON.stringify(chatbotMap))
    } catch (error) {
      console.error("Update cache error (cache):", error)
    }
  }

  async removeCache(workspaceId: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(workspaceId)
      this.ramCache.delete(cacheKey)

      const redis = getRedisConnection()
      await redis.del(cacheKey)
    } catch (error) {
      console.error("Remove cache error (cache):", error)
    }
  }

  async getCacheData(workspaceId: string): Promise<Record<number, string[]>> {
    const cached = await this.getCachedData(workspaceId)

    if (cached) {
      return cached
    }

    const chatbotMap = await this.buildCacheData(workspaceId)

    if (Object.keys(chatbotMap).length > 0) {
      const cacheKey = this.getCacheKey(workspaceId)
      this.ramCache.set(cacheKey, { data: chatbotMap, timestamp: Date.now() })

      try {
        const redis = getRedisConnection()
        await redis.setex(cacheKey, this.redisTTL, JSON.stringify(chatbotMap))
      } catch (error) {
        console.error("Redis cache error (cache):", error)
      }
    }

    return chatbotMap
  }

  cleanupExpiredCache(): void {
    const now = Date.now()

    for (const [cacheKey, entry] of Array.from(this.ramCache.entries())) {
      if (now - entry.timestamp >= this.ramTTL) {
        this.ramCache.delete(cacheKey)
      }
    }
  }
}
