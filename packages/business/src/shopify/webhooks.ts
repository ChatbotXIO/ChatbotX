import { shopifyRepository } from "@chatbotx.io/database/repositories"
import {
  toShopifyGid,
  verifyShopifyWebhookSignature,
} from "@chatbotx.io/integration-shopify"
import {
  getShopifyWebhookJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { decryptShopifyAuth, webhookSecretOf } from "./auth"
import { shopifyIntegrationService } from "./integration.service"
import { shopifySyncService } from "./sync.service"

/** What the webhook route answers: 401 for a bad signature, 404 for no store. */
export type ShopifyWebhookReceipt = { status: 200 | 401 | 404 }

type WebhookBody = {
  id?: number | string
  admin_graphql_api_id?: string
  inventory_item_id?: number | string
  order_id?: number | string
}

/**
 * The GID of the object a delivery is about. Product and order deliveries
 * carry it as `admin_graphql_api_id`; inventory and fulfillment deliveries
 * name the inventory item or order by number.
 */
export const shopifyWebhookObjectId = (
  topic: string,
  body: WebhookBody,
): string | null => {
  if (topic === "inventory_levels/update") {
    return body.inventory_item_id
      ? toShopifyGid("InventoryItem", body.inventory_item_id)
      : null
  }
  if (topic.startsWith("fulfillments/")) {
    return body.order_id ? toShopifyGid("Order", body.order_id) : null
  }
  if (body.admin_graphql_api_id) {
    return body.admin_graphql_api_id
  }
  if (body.id && topic.startsWith("products/")) {
    return toShopifyGid("Product", body.id)
  }
  if (body.id && topic.startsWith("orders/")) {
    return toShopifyGid("Order", body.id)
  }
  return null
}

/**
 * The worker side of a delivery: re-reads the object from Shopify and writes
 * it, or removes it when Shopify says it was deleted.
 */
export const processShopifyWebhook = async (input: {
  workspaceId: string
  topic: string
  objectId: string | null
}): Promise<void> => {
  const { workspaceId, topic, objectId } = input
  if (topic === "app/uninstalled") {
    await shopifyIntegrationService.markInvalid(
      workspaceId,
      "The Shopify app was uninstalled from the store.",
    )
    return
  }
  if (!objectId) {
    return
  }
  switch (topic) {
    case "products/create":
    case "products/update":
      await shopifySyncService.syncProduct(workspaceId, objectId)
      return
    case "products/delete":
      await shopifySyncService.deleteProduct(workspaceId, objectId)
      return
    case "inventory_levels/update":
      await shopifySyncService.syncInventoryItem(workspaceId, objectId)
      return
    case "discounts/create":
    case "discounts/update":
      await shopifySyncService.syncDiscount(workspaceId, objectId)
      return
    case "discounts/delete":
      await shopifySyncService.deleteDiscount(workspaceId, objectId)
      return
    default:
      if (topic.startsWith("orders/") || topic.startsWith("fulfillments/")) {
        await shopifySyncService.syncOrder(workspaceId, objectId)
      }
  }
}

/**
 * A delivery to `/api/shopify/{workspaceId}/webhook`. Checked against the
 * store's app secret and its shop domain, then handed to a job named after
 * the delivery id, so Shopify's retries run it once. The job reads the object
 * back from Shopify, so the body is only used for the id.
 */
export const receiveShopifyWebhook = async (input: {
  workspaceId: string
  rawBody: string
  headers: Headers
}): Promise<ShopifyWebhookReceipt> => {
  const row = await shopifyRepository.findIntegration(input.workspaceId)
  if (!row) {
    return { status: 404 }
  }
  const secret = webhookSecretOf(await decryptShopifyAuth(row))
  const valid = await verifyShopifyWebhookSignature({
    rawBody: input.rawBody,
    signature: input.headers.get("x-shopify-hmac-sha256"),
    secret,
  })
  if (!valid) {
    return { status: 401 }
  }
  const shopDomain = input.headers.get("x-shopify-shop-domain")
  if (shopDomain && shopDomain.toLowerCase() !== row.shopDomain) {
    logger.warn(
      { workspaceId: input.workspaceId, shopDomain },
      "[shopify] a webhook came from another store",
    )
    return { status: 200 }
  }

  const topic = input.headers.get("x-shopify-topic") ?? ""
  const webhookId =
    input.headers.get("x-shopify-webhook-id") ??
    input.headers.get("x-shopify-event-id")
  let body: WebhookBody = {}
  try {
    body = JSON.parse(input.rawBody) as WebhookBody
  } catch {
    return { status: 200 }
  }
  const objectId = shopifyWebhookObjectId(topic, body)
  if (!(topic === "app/uninstalled" || objectId)) {
    return { status: 200 }
  }

  await integrationQueue.add(
    IntegrationJobAction.shopifyWebhook,
    {
      type: IntegrationJobAction.shopifyWebhook,
      data: { workspaceId: input.workspaceId, topic, objectId },
    },
    webhookId ? { jobId: getShopifyWebhookJobId(webhookId) } : undefined,
  )
  return { status: 200 }
}
