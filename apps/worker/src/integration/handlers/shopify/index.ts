import {
  processShopifyWebhook,
  shopifySyncService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import type {
  IntegrationJobShopifySync,
  IntegrationJobShopifyWebhook,
} from "@chatbotx.io/worker-config"

/**
 * Pulls the connected Shopify store's catalog, discount codes and recent
 * orders again. A failure leaves the connection marked `failed` with the
 * reason, then throws so the job is retried.
 */
export async function runShopifySync(
  data: IntegrationJobShopifySync["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, () =>
    shopifySyncService.run(data),
  )
}

/**
 * One signed Shopify webhook: the object it names is read back from Shopify
 * and written, so a late or reordered delivery still lands the store's
 * current state.
 */
export async function runShopifyWebhook(
  data: IntegrationJobShopifyWebhook["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, () =>
    processShopifyWebhook(data),
  )
}
