import { prisma } from "@aha.chat/database"
import { BaseCache } from "../base-cache"

class WebhookCache extends BaseCache {
  protected cachePrefix = "webhook:active:"
  protected redisTTL = 3600
  protected ramTTL = 60_000
  protected getTable() {
    return prisma.webhook
  }
}

const webhookCache = new WebhookCache()

export function hasActiveWebhooks(
  chatbotId: string,
  eventTypes: number[],
  sourceId?: string,
): Promise<boolean> {
  return webhookCache.hasActive(chatbotId, eventTypes, sourceId)
}

export function updateWebhookCache(chatbotId: string): Promise<void> {
  return webhookCache.updateCache(chatbotId)
}

export function removeWebhookCache(chatbotId: string): Promise<void> {
  return webhookCache.removeCache(chatbotId)
}
