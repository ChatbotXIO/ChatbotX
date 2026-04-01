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
  chatbotId: bigint,
  eventTypes: number[],
  sourceId?: string,
): Promise<boolean> {
  return await webhookCache.hasActive(chatbotId, eventTypes, sourceId)
}

export async function updateWebhookCache(chatbotId: bigint): Promise<void> {
  return await webhookCache.updateCache(chatbotId)
}

export async function removeWebhookCache(chatbotId: bigint): Promise<void> {
  return await webhookCache.removeCache(chatbotId)
}
