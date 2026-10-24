import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  triggerCartItemChanged: vi.fn(),
  webhookCartItemChanged: vi.fn(),
}))

vi.mock("../src/trigger/emitter", () => ({
  TriggerEventEmitter: { cartItemChanged: mocks.triggerCartItemChanged },
}))

vi.mock("../src/webhook/emitter", () => ({
  WebhookEventEmitter: { cartItemChanged: mocks.webhookCartItemChanged },
}))

const { emitCartItemChanged } = await import("../src/event-dispatcher")

const metadata = (change: number, categoryIds: string[] = ["cat-1"]) => ({
  channel: "webshop",
  product: { productId: "p-1", variantId: null, name: "Shirt", categoryIds },
  quantity: Math.max(change, 0),
  change,
})

describe("emitCartItemChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("an addition is productAddedToCart and categoryAddedToCart", async () => {
    await emitCartItemChanged("ws-1", "c-1", metadata(2), "ci-1")
    const types = mocks.triggerCartItemChanged.mock.calls.map(([type]) => type)
    expect(types).toEqual(["productAddedToCart", "categoryAddedToCart"])
    // Both emitters get every event.
    expect(mocks.webhookCartItemChanged).toHaveBeenCalledTimes(2)
  })

  test("a product without a category emits no category event", async () => {
    await emitCartItemChanged("ws-1", "c-1", metadata(1, []))
    const types = mocks.triggerCartItemChanged.mock.calls.map(([type]) => type)
    expect(types).toEqual(["productAddedToCart"])
  })

  test("a removal is productRemovedFromCart only", async () => {
    await emitCartItemChanged("ws-1", "c-1", metadata(-1))
    const types = mocks.triggerCartItemChanged.mock.calls.map(([type]) => type)
    expect(types).toEqual(["productRemovedFromCart"])
  })
})
