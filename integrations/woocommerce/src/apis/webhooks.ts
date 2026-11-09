import { z } from "zod"
import { type WooCommerceCredentials, woocommerceRequest } from "../client"
import { WOOCOMMERCE_PAGE_SIZE } from "../constants"
import { type WooCommerceWebhook, wooCommerceWebhookSchema } from "../schemas"

/** Registers one webhook, signed with `secret`. Returns its id. */
export async function createWooCommerceWebhook(
  credentials: WooCommerceCredentials,
  input: { name: string; topic: string; deliveryUrl: string; secret: string },
): Promise<string> {
  const { data } = await woocommerceRequest(
    credentials,
    {
      method: "post",
      path: "/webhooks",
      json: {
        name: input.name,
        topic: input.topic,
        delivery_url: input.deliveryUrl,
        secret: input.secret,
        status: "active",
      },
    },
    wooCommerceWebhookSchema,
  )
  return String(data.id)
}

/** The store's webhooks that deliver to `deliveryUrl`. */
export async function listWooCommerceWebhooks(
  credentials: WooCommerceCredentials,
  deliveryUrl: string,
): Promise<WooCommerceWebhook[]> {
  const { data } = await woocommerceRequest(
    credentials,
    {
      method: "get",
      path: "/webhooks",
      query: { per_page: WOOCOMMERCE_PAGE_SIZE },
    },
    z.array(wooCommerceWebhookSchema),
  )
  return data.filter((webhook) => webhook.delivery_url === deliveryUrl)
}

/**
 * Turns a webhook back on: WooCommerce disables one after five failed
 * deliveries in a row.
 */
export async function activateWooCommerceWebhook(
  credentials: WooCommerceCredentials,
  webhookId: string,
): Promise<void> {
  await woocommerceRequest(
    credentials,
    {
      method: "put",
      path: `/webhooks/${encodeURIComponent(webhookId)}`,
      json: { status: "active" },
    },
    wooCommerceWebhookSchema,
  )
}

export async function deleteWooCommerceWebhook(
  credentials: WooCommerceCredentials,
  webhookId: string,
): Promise<void> {
  await woocommerceRequest(
    credentials,
    {
      method: "delete",
      path: `/webhooks/${encodeURIComponent(webhookId)}`,
      query: { force: true },
    },
    z.unknown(),
  )
}
