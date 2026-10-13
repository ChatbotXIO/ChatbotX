import type { SendProductsStepSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByWorkspaceId: vi.fn(),
  listSendableProducts: vi.fn(),
  findSendableByProductIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCatalogItemRepository: {
    listSendableProducts: mocks.listSendableProducts,
    findSendableByProductIds: mocks.findSendableByProductIds,
  },
}))

vi.mock("../src/meta-catalog/integration.service", () => ({
  integrationMetaCatalogService: {
    findByWorkspaceId: mocks.findByWorkspaceId,
  },
}))

const { ProductMessageUnresolvableError, productMessageService } = await import(
  "../src/product-message/service"
)

const CONNECTION = { id: "conn-1", catalogId: "cat-1" }
const SCOPE = { integrationMetaCatalogId: "conn-1", catalogId: "cat-1" }

const row = (productId: string) => ({
  productId,
  retailerId: `sku-${productId}`,
  catalogId: "cat-1",
  name: `Product ${productId}`,
  images: [{ url: `https://img/${productId}.png`, type: "link" as const }],
  price: 12.5,
  currency: "USD",
})

const step = (
  props: Partial<SendProductsStepSchema>,
): SendProductsStepSchema => ({
  id: "1",
  stepType: "sendProducts",
  display: "products",
  sections: [],
  ...props,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findByWorkspaceId.mockResolvedValue(CONNECTION)
})

describe("productMessageService.listSendable", () => {
  test("lists the connection's sendable products for a supporting channel", async () => {
    mocks.listSendableProducts.mockResolvedValue({
      data: [row("1"), row("2")],
      pageCount: 3,
    })

    const result = await productMessageService.listSendable({
      workspaceId: "ws-1",
      channel: "whatsapp",
      keyword: "shoe",
      productIds: ["1", "2"],
      page: 2,
      perPage: 10,
    })

    expect(mocks.listSendableProducts).toHaveBeenCalledWith({
      ...SCOPE,
      workspaceId: "ws-1",
      channel: "whatsapp",
      keyword: "shoe",
      productIds: ["1", "2"],
      page: 2,
      perPage: 10,
    })
    expect(result).toEqual({
      ready: true,
      pageCount: 3,
      data: [
        {
          id: "1",
          name: "Product 1",
          imageUrl: "https://img/1.png",
          price: 12.5,
          currency: "USD",
        },
        {
          id: "2",
          name: "Product 2",
          imageUrl: "https://img/2.png",
          price: 12.5,
          currency: "USD",
        },
      ],
    })
  })

  test("is not ready without a catalog connection", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(undefined)

    expect(
      await productMessageService.listSendable({
        workspaceId: "ws-1",
        channel: "whatsapp",
      }),
    ).toEqual({
      ready: false,
      reason: "catalogNotConnected",
      data: [],
      pageCount: 0,
    })
    expect(mocks.listSendableProducts).not.toHaveBeenCalled()
  })

  test("is not ready when the connection is not bound to a catalog yet", async () => {
    mocks.findByWorkspaceId.mockResolvedValue({ id: "conn-1", catalogId: null })

    expect(
      (
        await productMessageService.listSendable({
          workspaceId: "ws-1",
          channel: "whatsapp",
        })
      ).reason,
    ).toBe("catalogNotConnected")
  })

  test.each([
    "telegram",
    "omnichannel",
    "unknown",
  ])("does not touch the catalog for channel %s", async (channel) => {
    expect(
      await productMessageService.listSendable({
        workspaceId: "ws-1",
        channel,
      }),
    ).toEqual({
      ready: false,
      reason: "channelUnsupported",
      data: [],
      pageCount: 0,
    })
    expect(mocks.findByWorkspaceId).not.toHaveBeenCalled()
  })
})

describe("productMessageService.resolveForSend", () => {
  test("resolves every section and the thumbnail with one catalog query", async () => {
    mocks.findSendableByProductIds.mockResolvedValue([
      row("1"),
      row("2"),
      row("3"),
    ])

    const result = await productMessageService.resolveForSend({
      workspaceId: "ws-1",
      channel: "whatsapp",
      step: step({
        header: "Picks",
        body: "Look",
        sections: [
          { title: "A", productIds: ["1", "2"] },
          { title: "B", productIds: ["3"] },
        ],
      }),
    })

    expect(mocks.findByWorkspaceId).toHaveBeenCalledTimes(1)
    expect(mocks.findSendableByProductIds).toHaveBeenCalledTimes(1)
    expect(mocks.findSendableByProductIds).toHaveBeenCalledWith({
      ...SCOPE,
      workspaceId: "ws-1",
      productIds: ["1", "2", "3"],
    })
    expect(result.missing).toEqual([])
    expect(result.message).toMatchObject({
      display: "products",
      sections: [
        {
          title: "A",
          items: [
            { productId: "1", catalogReference: { retailerId: "sku-1" } },
            { productId: "2" },
          ],
        },
        { title: "B", items: [{ productId: "3" }] },
      ],
    })
  })

  test("reports products that are no longer sendable", async () => {
    mocks.findSendableByProductIds.mockResolvedValue([row("1"), row("2")])

    const result = await productMessageService.resolveForSend({
      workspaceId: "ws-1",
      channel: "whatsapp",
      step: step({
        header: "h",
        body: "b",
        sections: [{ title: "A", productIds: ["1", "7", "2"] }],
      }),
    })

    expect(result.missing).toEqual([{ productId: "7" }])
  })

  test("fails permanently when nothing is sendable", async () => {
    mocks.findSendableByProductIds.mockResolvedValue([])

    await expect(
      productMessageService.resolveForSend({
        workspaceId: "ws-1",
        channel: "whatsapp",
        step: step({
          header: "h",
          body: "b",
          sections: [{ title: "A", productIds: ["7", "8"] }],
        }),
      }),
    ).rejects.toMatchObject({
      name: "ProductMessageUnresolvableError",
      reason: "noProductsSendable",
      code: "productMessageUnresolvable",
    })
  })

  test("fails when the workspace has no catalog and products are needed", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(undefined)

    await expect(
      productMessageService.resolveForSend({
        workspaceId: "ws-1",
        channel: "whatsapp",
        step: step({ sections: [{ productIds: ["1"] }] }),
      }),
    ).rejects.toMatchObject({ reason: "catalogNotConnected" })
    expect(mocks.findSendableByProductIds).not.toHaveBeenCalled()
  })

  test("sends the whole-catalog display without any lookup", async () => {
    const result = await productMessageService.resolveForSend({
      workspaceId: "ws-1",
      channel: "whatsapp",
      step: step({ display: "catalog", body: "Browse" }),
    })

    expect(result.message).toMatchObject({ display: "catalog", body: "Browse" })
    expect(mocks.findByWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.findSendableByProductIds).not.toHaveBeenCalled()
  })

  test("drops the thumbnail instead of failing when the catalog is not connected", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(undefined)

    const result = await productMessageService.resolveForSend({
      workspaceId: "ws-1",
      channel: "whatsapp",
      step: step({
        display: "catalog",
        body: "Browse",
        thumbnailProductId: "1",
      }),
    })

    expect(result.missing).toEqual([{ productId: "1" }])
    expect(result.message).toMatchObject({
      display: "catalog",
      thumbnail: undefined,
    })
  })

  test.each([
    "telegram",
    "omnichannel",
    "unknown",
  ])("refuses channel %s before reading anything", async (channel) => {
    await expect(
      productMessageService.resolveForSend({
        workspaceId: "ws-1",
        channel,
        step: step({ sections: [{ productIds: ["1"] }] }),
      }),
    ).rejects.toBeInstanceOf(ProductMessageUnresolvableError)
    expect(mocks.findByWorkspaceId).not.toHaveBeenCalled()
  })
})
