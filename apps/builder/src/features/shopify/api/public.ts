import { shopifyIntegrationService } from "@chatbotx.io/business"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnShopify,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  connectShopifyRequest,
  SHOPIFY_SCOPES_TEXT,
  shopifyConnectionResource,
  shopifyStatusResource,
  syncShopifyRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const shopifyPublicRouter = {
  getStatus: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/shopify",
      summary: "Get Shopify connection",
      description:
        "The connected Shopify store, its last sync and counts, or `connected: false`. Never returns a credential.",
      tags: ["Shopify"],
    })
    .output(shopifyStatusResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context }) =>
        await shopifyIntegrationService.getStatus(context.workspace.id),
    ),

  connect: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/shopify",
      summary: "Connect Shopify store",
      description: `Connects a Shopify store as the ecommerce store source. The credentials are checked with Shopify, a webhook is subscribed for every product, inventory, order and discount change, the credentials are stored encrypted, and a full sync is queued (poll \`shopify.getStatus\`). The app needs the scopes ${SHOPIFY_SCOPES_TEXT}. Replaces any previous Shopify connection. Then switch the store to it with \`ecommerceSettings.update\` (\`general.storeSource: "shopify"\`).`,
      tags: ["Shopify"],
    })
    .input(connectShopifyRequest)
    .output(shopifyConnectionResource)
    .errors(possibleErrorsOnShopify)
    .handler(
      async ({ context, input }) =>
        await shopifyIntegrationService.connect({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  sync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/shopify/sync",
      summary: "Sync Shopify store",
      description:
        "Queues a sync of the connected store: products and discount codes, and/or the last 60 days of orders. Changes also arrive by webhook on their own; this catches up anything missed. Refused with `shopifySyncInProgress` while one runs; poll `shopify.getStatus` for the result.",
      tags: ["Shopify"],
    })
    .input(syncShopifyRequest)
    .output(shopifyConnectionResource)
    .errors(possibleErrorsOnShopify)
    .handler(
      async ({ context, input }) =>
        await shopifyIntegrationService.requestSync({
          workspaceId: context.workspace.id,
          scope: input.scope,
        }),
    ),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/shopify",
      summary: "Disconnect Shopify store",
      description:
        "Removes the store's webhooks and the connection, and switches the store source back to the platform's own catalog. Mirrored products and orders are kept, hidden, and show again after reconnecting. Does nothing when not connected.",
      successStatus: 204,
      tags: ["Shopify"],
    })
    .errors(possibleErrorsOnShopify)
    .handler(async ({ context }) => {
      await shopifyIntegrationService.disconnect(context.workspace.id)
    }),
}
