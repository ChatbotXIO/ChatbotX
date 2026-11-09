import { createHmac } from "node:crypto"
import { describe, expect, test } from "vitest"
import { verifyWooCommerceWebhookSignature } from "../src/lib/webhook-signature"
import {
  wooCommerceOrderSchema,
  wooCommerceProductSchema,
} from "../src/schemas"

const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64")

describe("verifyWooCommerceWebhookSignature", () => {
  const rawBody = JSON.stringify({ id: 12, status: "processing" })

  test("accepts the body signed with the webhook's secret", async () => {
    await expect(
      verifyWooCommerceWebhookSignature({
        rawBody,
        signature: sign(rawBody, "webhook-secret"),
        secret: "webhook-secret",
      }),
    ).resolves.toBe(true)
  })

  test("refuses another secret, a changed body or no signature", async () => {
    await expect(
      verifyWooCommerceWebhookSignature({
        rawBody,
        signature: sign(rawBody, "other"),
        secret: "webhook-secret",
      }),
    ).resolves.toBe(false)
    await expect(
      verifyWooCommerceWebhookSignature({
        rawBody: `${rawBody} `,
        signature: sign(rawBody, "webhook-secret"),
        secret: "webhook-secret",
      }),
    ).resolves.toBe(false)
    await expect(
      verifyWooCommerceWebhookSignature({
        rawBody,
        signature: null,
        secret: "webhook-secret",
      }),
    ).resolves.toBe(false)
  })
})

describe("schemas", () => {
  test("reads WooCommerce's string prices and blank values", () => {
    const product = wooCommerceProductSchema.parse({
      id: 7,
      name: "Tote",
      type: "simple",
      status: "publish",
      price: "19.90",
      regular_price: "",
      stock_quantity: null,
      stock_status: "instock",
    })
    expect(product.price).toBe(19.9)
    expect(product.regular_price).toBe(0)
    expect(product.stock_quantity).toBeNull()
    expect(product.brands).toEqual([])
    expect(product.parent_id).toBe(0)
  })

  test("reads an order with its lines and meta", () => {
    const order = wooCommerceOrderSchema.parse({
      id: 99,
      number: "99",
      status: "processing",
      currency: "USD",
      total: "25.00",
      total_tax: "0.00",
      shipping_total: "5.00",
      discount_total: "0.00",
      billing: { first_name: "An", email: "an@example.com" },
      shipping: {},
      line_items: [
        {
          id: 1,
          name: "Tote",
          product_id: 7,
          quantity: 2,
          subtotal: "20.00",
          total: "20.00",
        },
      ],
      meta_data: [{ key: "cbx_ref", value: "token" }],
    })
    expect(order.total).toBe(25)
    expect(order.billing.last_name).toBe("")
    expect(order.line_items[0]?.subtotal).toBe(20)
    expect(order.payment_url ?? null).toBeNull()
  })
})

describe("decodeHtmlEntities", () => {
  test("turns WooCommerce's currency symbols into text", async () => {
    const { decodeHtmlEntities } = await import("../src/apis/store")
    expect(decodeHtmlEntities("&#8363;")).toBe("₫")
    expect(decodeHtmlEntities("&#x20ac;")).toBe("€")
    expect(decodeHtmlEntities("&euro;")).toBe("€")
    expect(decodeHtmlEntities("&#36;")).toBe("$")
    expect(decodeHtmlEntities("kr")).toBe("kr")
  })
})
