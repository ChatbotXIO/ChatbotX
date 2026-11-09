import {
  processWooCommerceWebhook,
  withBlockedOwnerGuard,
  wooCommerceSyncService,
} from "@chatbotx.io/business"
import type {
  IntegrationJobWoocommerceSync,
  IntegrationJobWoocommerceWebhook,
} from "@chatbotx.io/worker-config"

/**
 * Pulls the connected WooCommerce store's catalog, coupons and recent orders
 * again. A failure leaves the connection marked `failed` with the reason,
 * then throws so the job is retried.
 */
export async function runWooCommerceSync(
  data: IntegrationJobWoocommerceSync["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, () =>
    wooCommerceSyncService.run(data),
  )
}

/**
 * One signed WooCommerce webhook: the object it names is read back from the
 * store and written, so a late or reordered delivery still lands the store's
 * current state.
 */
export async function runWooCommerceWebhook(
  data: IntegrationJobWoocommerceWebhook["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, () =>
    processWooCommerceWebhook(data),
  )
}
