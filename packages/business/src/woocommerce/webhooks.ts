import { woocommerceRepository } from "@chatbotx.io/database/repositories"
import { verifyWooCommerceWebhookSignature } from "@chatbotx.io/integration-woocommerce"
import {
  getWoocommerceWebhookJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { decryptWooCommerceAuth } from "./auth"
import { wooCommerceSyncService } from "./sync.service"

/** What the webhook route answers: 401 for a bad signature, 404 for no store. */
export type WooCommerceWebhookReceipt = { status: 200 | 401 | 404 }

const TRAILING_SLASHES = /\/+$/

/** `https://Example.com/` and `https://example.com` are the same site. */
const sameSite = (left: string, right: string) =>
  left.replace(TRAILING_SLASHES, "").toLowerCase() ===
  right.replace(TRAILING_SLASHES, "").toLowerCase()

/**
 * The worker side of a delivery: re-reads the object from the store and
 * writes it, or removes it when the store says it was deleted.
 */
export const processWooCommerceWebhook = async (input: {
  workspaceId: string
  topic: string
  resourceId: string
}): Promise<void> => {
  const { workspaceId, topic, resourceId } = input
  switch (topic) {
    case "product.created":
    case "product.updated":
    case "product.restored":
      await wooCommerceSyncService.syncProduct(workspaceId, resourceId)
      return
    case "product.deleted":
      await wooCommerceSyncService.deleteProduct(workspaceId, resourceId)
      return
    case "coupon.created":
    case "coupon.updated":
    case "coupon.restored":
      await wooCommerceSyncService.syncCoupon(workspaceId, resourceId)
      return
    case "coupon.deleted":
      await wooCommerceSyncService.deleteCoupon(workspaceId, resourceId)
      return
    default:
      // A deleted order keeps its mirror: the customer was already told
      // about it, and our order history stays whole.
      if (topic.startsWith("order.") && topic !== "order.deleted") {
        await wooCommerceSyncService.syncOrder(workspaceId, resourceId)
      }
  }
}

/** The id of the product, order or coupon a delivery is about. */
const resourceIdOf = (rawBody: string): string | null => {
  try {
    const body = JSON.parse(rawBody) as { id?: unknown }
    return typeof body.id === "number" || typeof body.id === "string"
      ? String(body.id)
      : null
  } catch {
    return null
  }
}

/**
 * A delivery to `/api/woocommerce/{workspaceId}/webhook`. WooCommerce first
 * pings a new webhook (`webhook_id=…`, no topic) and needs a 200 to keep it
 * active. A real delivery is checked against the secret we registered the
 * webhook with and the store's address, then handed to a job named after
 * the delivery id, so a redelivery runs once. The job reads the object back
 * from the store, so the body is only used for the id.
 */
export const receiveWooCommerceWebhook = async (input: {
  workspaceId: string
  rawBody: string
  headers: Headers
}): Promise<WooCommerceWebhookReceipt> => {
  const topic = input.headers.get("x-wc-webhook-topic")
  if (!topic) {
    // The ping sent when a webhook is created — before a first connection
    // is even saved: nothing to do.
    return { status: 200 }
  }
  const row = await woocommerceRepository.findIntegration(input.workspaceId)
  if (!row) {
    return { status: 404 }
  }
  const { webhookSecret } = await decryptWooCommerceAuth(row)
  const valid = await verifyWooCommerceWebhookSignature({
    rawBody: input.rawBody,
    signature: input.headers.get("x-wc-webhook-signature"),
    secret: webhookSecret,
  })
  if (!valid) {
    return { status: 401 }
  }
  const source = input.headers.get("x-wc-webhook-source")
  if (source && !sameSite(source, row.siteUrl)) {
    logger.warn(
      { workspaceId: input.workspaceId, source },
      "[woocommerce] a webhook came from another site",
    )
    return { status: 200 }
  }

  const resourceId = resourceIdOf(input.rawBody)
  if (!resourceId) {
    return { status: 200 }
  }
  await integrationQueue.add(
    IntegrationJobAction.woocommerceWebhook,
    {
      type: IntegrationJobAction.woocommerceWebhook,
      data: { workspaceId: input.workspaceId, topic, resourceId },
    },
    {
      jobId: getWoocommerceWebhookJobId(
        await deliveryKey(input.workspaceId, input.headers, input.rawBody),
      ),
    },
  )
  return { status: 200 }
}

/**
 * What tells one delivery from another. WooCommerce's `X-WC-Webhook-Delivery-ID`
 * is a hash of the webhook id and the current second, so two changes of an
 * order in the same second share it; the body tells them apart (it carries
 * the object's new state). The same body delivered twice is the same change.
 */
const deliveryKey = async (
  workspaceId: string,
  headers: Headers,
  rawBody: string,
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      [
        headers.get("x-wc-webhook-id") ?? "",
        headers.get("x-wc-webhook-delivery-id") ?? "",
        rawBody,
      ].join("\n"),
    ),
  )
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `${workspaceId}-${hex}`
}
