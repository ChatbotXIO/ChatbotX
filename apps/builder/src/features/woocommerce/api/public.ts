import { wooCommerceIntegrationService } from "@chatbotx.io/business"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnWooCommerce,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  connectWooCommerceRequest,
  syncWooCommerceRequest,
  wooCommerceConnectionResource,
  wooCommerceStatusResource,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const wooCommercePublicRouter = {
  getStatus: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/woocommerce",
      summary: "Get WooCommerce connection",
      description:
        "The connected WooCommerce store, its last sync and counts, or `connected: false`. Never returns a credential.",
      tags: ["WooCommerce"],
    })
    .output(wooCommerceStatusResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context }) =>
        await wooCommerceIntegrationService.getStatus(context.workspace.id),
    ),

  connect: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/woocommerce",
      summary: "Connect WooCommerce store",
      description:
        'Connects a WooCommerce store as the ecommerce store source. The REST API keys are checked with the store, a webhook is registered for every product, order and coupon change, the keys are stored encrypted, and a full sync is queued (poll `woocommerce.getStatus`). The store must be on `https://` with WordPress permalinks not set to Plain, and the keys need Read/Write permission. Replaces any previous WooCommerce connection. Then switch the store to it with `ecommerceSettings.update` (`general.storeSource: "woocommerce"`).',
      tags: ["WooCommerce"],
    })
    .input(connectWooCommerceRequest)
    .output(wooCommerceConnectionResource)
    .errors(possibleErrorsOnWooCommerce)
    .handler(
      async ({ context, input }) =>
        await wooCommerceIntegrationService.connect({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  sync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/woocommerce/sync",
      summary: "Sync WooCommerce store",
      description:
        "Queues a sync of the connected store: products and coupons, and/or the last 60 days of orders. Changes also arrive by webhook on their own; this catches up anything missed and turns back on any webhook WooCommerce disabled after failed deliveries. Refused with `woocommerceSyncInProgress` while one runs; poll `woocommerce.getStatus` for the result.",
      tags: ["WooCommerce"],
    })
    .input(syncWooCommerceRequest)
    .output(wooCommerceConnectionResource)
    .errors(possibleErrorsOnWooCommerce)
    .handler(
      async ({ context, input }) =>
        await wooCommerceIntegrationService.requestSync({
          workspaceId: context.workspace.id,
          scope: input.scope,
        }),
    ),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/woocommerce",
      summary: "Disconnect WooCommerce store",
      description:
        "Removes the store's webhooks and the connection, and switches a store selling from WooCommerce back to the platform's own catalog. Mirrored products and orders are kept, hidden, and show again after reconnecting. Does nothing when not connected.",
      successStatus: 204,
      tags: ["WooCommerce"],
    })
    .errors(possibleErrorsOnWooCommerce)
    .handler(async ({ context }) => {
      await wooCommerceIntegrationService.disconnect(context.workspace.id)
    }),
}
