import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  buildShopifyCartPermalink,
  fromShopifyGid,
  ShopifyApiError,
  toShopifyGid,
  verifyShopifyWebhookSignature,
} from "../src"

const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body, "utf8").digest("base64")

describe("verifyShopifyWebhookSignature", () => {
  const rawBody = JSON.stringify({ id: 1, title: "Áo sơ mi" })

  it("accepts the signature Shopify computes", async () => {
    await expect(
      verifyShopifyWebhookSignature({
        rawBody,
        signature: sign(rawBody, "shh"),
        secret: "shh",
      }),
    ).resolves.toBe(true)
  })

  it("rejects a body signed with another secret", async () => {
    await expect(
      verifyShopifyWebhookSignature({
        rawBody,
        signature: sign(rawBody, "other"),
        secret: "shh",
      }),
    ).resolves.toBe(false)
  })

  it("rejects a tampered body and a missing header", async () => {
    const signature = sign(rawBody, "shh")
    await expect(
      verifyShopifyWebhookSignature({
        rawBody: `${rawBody} `,
        signature,
        secret: "shh",
      }),
    ).resolves.toBe(false)
    await expect(
      verifyShopifyWebhookSignature({
        rawBody,
        signature: null,
        secret: "shh",
      }),
    ).resolves.toBe(false)
  })
})

describe("gid helpers", () => {
  it("round-trips a numeric id", () => {
    expect(toShopifyGid("Product", 42)).toBe("gid://shopify/Product/42")
    expect(fromShopifyGid("gid://shopify/ProductVariant/48930416427200")).toBe(
      "48930416427200",
    )
    expect(fromShopifyGid("123")).toBe("123")
  })
})

describe("buildShopifyCartPermalink", () => {
  it("puts lines, customer, discount and attributes in the URL", () => {
    const url = new URL(
      buildShopifyCartPermalink({
        shopDomain: "botxshop.myshopify.com",
        lines: [
          { variantId: "gid://shopify/ProductVariant/11", quantity: 2 },
          { variantId: "gid://shopify/ProductVariant/12", quantity: 0 },
          { variantId: "13", quantity: 1 },
        ],
        email: "a@example.com",
        shippingAddress: {
          firstName: "Van A",
          lastName: "Nguyen",
          address1: "123 Nguyen Hue, Quan 1",
          city: "Ho Chi Minh",
          countryCode: "VN",
          zip: null,
        },
        discountCode: "FASHION10",
        attributes: { cbx_ref: "abc.def" },
      }),
    )
    expect(url.origin).toBe("https://botxshop.myshopify.com")
    expect(url.pathname).toBe("/cart/11:2,13:1")
    expect(url.searchParams.get("checkout[email]")).toBe("a@example.com")
    expect(url.searchParams.get("checkout[shipping_address][address1]")).toBe(
      "123 Nguyen Hue, Quan 1",
    )
    expect(url.searchParams.get("checkout[shipping_address][country]")).toBe(
      "VN",
    )
    expect(url.searchParams.has("checkout[shipping_address][zip]")).toBe(false)
    expect(url.searchParams.get("discount")).toBe("FASHION10")
    expect(url.searchParams.get("attributes[cbx_ref]")).toBe("abc.def")
  })
})

describe("ShopifyApiError", () => {
  it("treats a refused token (401) as unauthorized", () => {
    expect(
      new ShopifyApiError({ message: "Invalid token", statusCode: 401 })
        .unauthorized,
    ).toBe(true)
  })

  it("does not treat a missing scope (403, ACCESS_DENIED) as unauthorized", () => {
    expect(
      new ShopifyApiError({ message: "Access denied", statusCode: 403 })
        .unauthorized,
    ).toBe(false)
  })
})
