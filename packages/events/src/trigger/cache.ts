import { BaseCache } from "../base-cache"
import type { TriggerEventType } from "./types"

class TriggerCache extends BaseCache {
  protected cachePrefix = "trigger:cache:"
  protected redisTTL = 3600
  protected ramTTL = 5000
  protected tableName = "trigger" as const
}

const triggerCache = new TriggerCache()

export function hasActiveTriggers(
  chatbotId: string,
  eventTypes: TriggerEventType[],
  sourceId?: string,
): Promise<boolean> {
  return triggerCache.hasActive(chatbotId, eventTypes, sourceId)
}

export function updateTriggerCache(chatbotId: string): Promise<void> {
  return triggerCache.updateCache(chatbotId)
}

export function getCacheData(
  chatbotId: string,
): Promise<Record<number, string[]>> {
  return triggerCache.getCacheData(chatbotId)
}

export function removeTriggerCache(chatbotId: string): Promise<void> {
  return triggerCache.removeCache(chatbotId)
}

setInterval(() => triggerCache.cleanupExpiredCache(), 30_000)
