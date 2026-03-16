import { BaseCache } from "../base-cache"
import type { TriggerEventType } from "./types"

class TriggerCache extends BaseCache {
  protected cachePrefix = "trigger:cache:"
  protected redisTTL = 3600
  protected ramTTL = 5000

  protected getTableName(): string {
    return "triggerModel"
  }
}

const triggerCache = new TriggerCache()

export async function hasActiveTriggers(
  chatbotId: string,
  eventTypes: TriggerEventType[],
  sourceId?: string,
): Promise<boolean> {
  return await triggerCache.hasActive(chatbotId, eventTypes, sourceId)
}

export async function updateTriggerCache(chatbotId: string): Promise<void> {
  return await triggerCache.updateCache(chatbotId)
}

export async function getCacheData(
  chatbotId: string,
): Promise<Record<number, string[]>> {
  return await triggerCache.getCacheData(chatbotId)
}

export async function removeTriggerCache(chatbotId: string): Promise<void> {
  return await triggerCache.removeCache(chatbotId)
}

setInterval(() => triggerCache.cleanupExpiredCache(), 30_000)
