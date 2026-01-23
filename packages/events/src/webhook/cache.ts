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

export async function hasActiveWebhooks(
  chatbotId: string,
  eventTypes: number[],
  sourceId?: string,
): Promise<boolean> {
  return await webhookCache.hasActive(chatbotId, eventTypes, sourceId)
}

export async function updateWebhookCache(chatbotId: string): Promise<void> {
  return await webhookCache.updateCache(chatbotId)
}

export async function removeWebhookCache(chatbotId: string): Promise<void> {
  return await webhookCache.removeCache(chatbotId)
}
