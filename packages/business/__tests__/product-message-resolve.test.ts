import {
  CHANNEL_FLOW_POLICIES,
  type SendProductsStepSchema,
} from "@chatbotx.io/flow-config"
import type { ProductMessageItem } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { resolveProductMessage } from "../src/product-message/resolve-message"

const capability = CHANNEL_FLOW_POLICIES.whatsapp.productMessages
if (!capability) {
  throw new Error("whatsapp must declare productMessages")
}

const item = (productId: string): ProductMessageItem => ({
  productId,
  name: `Product ${productId}`,
  imageUrl: null,
  price: 10,
  currency: "USD",
  catalogReference: {
    source: "metaCatalog",
    catalogId: "cat-1",
    retailerId: `sku-${productId}`,
  },
})

const sendable = (...ids: string[]) => new Map(ids.map((id) => [id, item(id)]))

const step = (
  props: Partial<SendProductsStepSchema>,
): SendProductsStepSchema => ({
  id: "1",
  stepType: "sendProducts",
  display: "products",
  sections: [],
  ...props,
})

const resolve = (props: Partial<SendProductsStepSchema>, ids: string[]) =>
  resolveProductMessage({
    capability,
    content: step(props),
    sendableById: sendable(...ids),
  })

describe("resolveProductMessage — products display", () => {
  test("keeps the author's sections and order", () => {
    const result = resolve(
      {
        header: "Picks",
        body: "Look",
        sections: [
          { title: "Shoes", productIds: ["2", "1"] },
          { title: "Bags", productIds: ["3"] },
        ],
      },
      ["1", "2", "3"],
    )

    expect(result).toMatchObject({
      ok: true,
      missing: [],
      message: {
        display: "products",
        header: "Picks",
        body: "Look",
        sections: [
          { title: "Shoes", items: [{ productId: "2" }, { productId: "1" }] },
          { title: "Bags", items: [{ productId: "3" }] },
        ],
      },
    })
  })

  test("drops products that are not sendable and reports them", () => {
    const result = resolve(
      {
        header: "Picks",
        body: "Look",
        sections: [{ title: "All", productIds: ["1", "9", "2"] }],
      },
      ["1", "2"],
    )

    expect(result).toMatchObject({
      ok: true,
      missing: [{ productId: "9" }],
      message: {
        sections: [{ items: [{ productId: "1" }, { productId: "2" }] }],
      },
    })
  })

  test("drops a section whose products are all gone", () => {
    const result = resolve(
      {
        header: "Picks",
        body: "Look",
        sections: [
          { title: "Gone", productIds: ["9"] },
          { title: "Kept", productIds: ["1", "2"] },
        ],
      },
      ["1", "2"],
    )

    expect(result).toMatchObject({
      ok: true,
      message: { sections: [{ title: "Kept" }] },
    })
  })

  test("omits the header once the message shrinks to one product", () => {
    const result = resolve(
      {
        header: "Picks",
        body: "Look",
        sections: [{ title: "All", productIds: ["1", "9"] }],
      },
      ["1"],
    )

    expect(result).toMatchObject({ ok: true, message: { display: "products" } })
    expect(
      result.ok && "header" in result.message && result.message.header,
    ).toBeUndefined()
  })

  test("fails with noProductsSendable when nothing resolves", () => {
    expect(
      resolve(
        {
          header: "Picks",
          body: "Look",
          sections: [{ title: "x", productIds: ["8", "9"] }],
        },
        [],
      ),
    ).toEqual({ ok: false, reason: "noProductsSendable" })
  })

  test("fails an invalid single-product step instead of dropping its header", () => {
    expect(
      resolve({ header: "Picks", sections: [{ productIds: ["1"] }] }, ["1"]),
    ).toEqual({ ok: false, reason: "invalidMessage" })
  })

  test("rejects over-limit text instead of clamping it", () => {
    expect(
      resolve(
        {
          header: "h".repeat(61),
          body: "b",
          sections: [{ title: "t", productIds: ["1", "2"] }],
        },
        ["1", "2"],
      ),
    ).toEqual({ ok: false, reason: "invalidMessage" })
  })

  test("treats whitespace-only text as absent", () => {
    expect(
      resolve(
        { header: "   ", body: "   ", sections: [{ productIds: ["1", "2"] }] },
        ["1", "2"],
      ),
    ).toEqual({ ok: false, reason: "invalidMessage" })
  })
})

describe("resolveProductMessage — carousel display", () => {
  const carousel = (ids: string[]) => ({
    display: "carousel" as const,
    body: "Look",
    sections: [{ productIds: ids }],
  })

  test("flattens the single section into cards", () => {
    expect(resolve(carousel(["1", "2", "3"]), ["1", "2", "3"])).toMatchObject({
      ok: true,
      message: {
        display: "carousel",
        body: "Look",
        items: [{ productId: "1" }, { productId: "2" }, { productId: "3" }],
      },
    })
  })

  test("fails as noProductsSendable when too few cards remain", () => {
    expect(resolve(carousel(["1", "9"]), ["1"])).toEqual({
      ok: false,
      reason: "noProductsSendable",
    })
    expect(resolve(carousel(["1", "8", "9"]), ["1"])).toEqual({
      ok: false,
      reason: "noProductsSendable",
    })
  })

  test("fails an invalid step instead of repairing it", () => {
    expect(
      resolve({ ...carousel(["1", "2"]), footer: "not allowed" }, ["1", "2"]),
    ).toEqual({ ok: false, reason: "invalidMessage" })
  })
})
