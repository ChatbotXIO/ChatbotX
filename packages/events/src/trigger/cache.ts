import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { BaseCache } from "../base-cache"

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
  workspaceId: string,
  eventTypes: TriggerEventType[],
  sourceId?: string,
): Promise<boolean> {
  return await triggerCache.hasActive(workspaceId, eventTypes, sourceId)
}

export async function updateTriggerCache(workspaceId: string): Promise<void> {
  return await triggerCache.updateCache(workspaceId)
}

export async function getCacheData(
  workspaceId: string,
): Promise<Record<number, string[]>> {
  return await triggerCache.getCacheData(workspaceId)
}

export async function removeTriggerCache(workspaceId: string): Promise<void> {
  return await triggerCache.removeCache(workspaceId)
}

setInterval(() => triggerCache.cleanupExpiredCache(), 30_000)
