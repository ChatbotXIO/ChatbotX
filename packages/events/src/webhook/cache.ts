import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { BaseCache } from "../base-cache"

class WebhookCache extends BaseCache {
  protected cachePrefix = "webhook:active:"
  protected redisTTL = 3600
  protected ramTTL = 60_000

  protected getTableName(): string {
    return "webhookModel"
  }
}

const webhookCache = new WebhookCache()

export async function hasActiveWebhooks(
  workspaceId: string,
  eventTypes: TriggerEventType[],
  sourceId?: string,
): Promise<boolean> {
  return await webhookCache.hasActive(workspaceId, eventTypes, sourceId)
}

export async function updateWebhookCache(workspaceId: string): Promise<void> {
  return await webhookCache.updateCache(workspaceId)
}

export async function removeWebhookCache(workspaceId: string): Promise<void> {
  return await webhookCache.removeCache(workspaceId)
}
