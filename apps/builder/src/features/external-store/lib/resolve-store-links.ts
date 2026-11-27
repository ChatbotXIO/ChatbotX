import "server-only"

import {
  shopifyIntegrationService,
  wooCommerceIntegrationService,
} from "@chatbotx.io/business"
import {
  EXTERNAL_STORE_NAMES,
  isExternalStoreSource,
  type StoreSource,
} from "@chatbotx.io/database/partials"
import type { ExternalStoreLinks } from "./store-links"

/**
 * The connected store's links, when the store sells from an external store
 * that is still connected; undefined for our own catalog.
 */
export async function resolveExternalStoreLinks(
  workspaceId: string,
  storeSource: StoreSource,
): Promise<ExternalStoreLinks | undefined> {
  if (!isExternalStoreSource(storeSource)) {
    return
  }
  if (storeSource === "shopify") {
    const status = await shopifyIntegrationService.getStatus(workspaceId)
    return status.connected
      ? {
          source: "shopify",
          storeName: EXTERNAL_STORE_NAMES.shopify,
          shopLabel: status.shopDomain,
          adminUrl: status.adminUrl,
        }
      : undefined
  }
  const status = await wooCommerceIntegrationService.getStatus(workspaceId)
  return status.connected
    ? {
        source: "woocommerce",
        storeName: EXTERNAL_STORE_NAMES.woocommerce,
        shopLabel: status.storeName ?? status.siteUrl,
        adminUrl: status.adminUrl,
      }
    : undefined
}
