import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Queue -> worker seam (§5.6), producer side: a contactInboxId passed into a
// BaseEventEmitter method (e.g. tagApplied) must survive the trip through
// withContactInboxMetadata -> emit() -> emitToQueue() and land, unmodified,
// in the BullMQ job's `data.eventData` bag — this is the exact shape the
// trigger worker later reads with extractContactInboxId.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  triggerQueueAdd: vi.fn(async () => undefined),
  hasActiveTriggers: vi.fn(async () => true),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  triggerQueue: { add: (...args: unknown[]) => mocks.triggerQueueAdd(...args) },
}))

vi.mock("../src/trigger/cache", () => ({
  hasActiveTriggers: (...args: unknown[]) => mocks.hasActiveTriggers(...args),
}))

const { TriggerEventEmitter } = await import("../src/trigger/emitter")

describe("TriggerEventEmitter — contactInboxId queue round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveTriggers.mockResolvedValue(true)
  })

  test("tagApplied's contactInboxId lands in the queued job's eventData", async () => {
    await TriggerEventEmitter.tagApplied(
      "ws-1",
      "contact-1",
      "tag-1",
      "ci-whatsapp",
    )

    expect(mocks.triggerQueueAdd).toHaveBeenCalledTimes(1)
    const [, jobData] = mocks.triggerQueueAdd.mock.calls[0] as [
      string,
      { data: { eventData: Record<string, unknown> } },
    ]
    expect(jobData.data.eventData).toEqual({
      sourceId: "tag-1",
      tagId: "tag-1",
      contactInboxId: "ci-whatsapp",
    })
  })

  test("tagApplied omitted contactInboxId never adds the key to eventData", async () => {
    await TriggerEventEmitter.tagApplied("ws-1", "contact-1", "tag-1")

    const [, jobData] = mocks.triggerQueueAdd.mock.calls[0] as [
      string,
      { data: { eventData: Record<string, unknown> } },
    ]
    expect(jobData.data.eventData).toEqual({
      sourceId: "tag-1",
      tagId: "tag-1",
    })
    expect(jobData.data.eventData).not.toHaveProperty("contactInboxId")
  })

  test("contactCreated's contactInboxId lands in the queued job's eventData alongside the rest of the metadata", async () => {
    await TriggerEventEmitter.contactCreated(
      "ws-1",
      "contact-1",
      "Ada",
      undefined,
      "ada@example.com",
      "ci-webchat",
    )

    const [, jobData] = mocks.triggerQueueAdd.mock.calls[0] as [
      string,
      { data: { eventData: Record<string, unknown> } },
    ]
    expect(jobData.data.eventData).toEqual({
      name: "Ada",
      phone: undefined,
      email: "ada@example.com",
      contactInboxId: "ci-webchat",
    })
  })
})

describe("TriggerEventEmitter — catalog events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveTriggers.mockResolvedValue(true)
  })

  const reference = {
    catalogReference: {
      source: "metaCatalog",
      catalogId: "cat-1",
      retailerId: "sku-1",
    },
    product: null,
  } as const
  const base = {
    channel: "whatsapp",
    conversationId: "conv-1",
    messageId: "msg-1",
    catalogId: "cat-1",
  }

  const queuedEventData = () =>
    (
      mocks.triggerQueueAdd.mock.calls[0] as unknown as [
        string,
        { data: { eventType: string; eventData: Record<string, unknown> } },
      ]
    )[1].data

  test("shoppingCartSent queues its metadata and contactInboxId, never a sourceId", async () => {
    const metadata = {
      ...base,
      note: null,
      products: [{ ...reference, quantity: 2, itemPrice: 5, currency: "USD" }],
    }

    await TriggerEventEmitter.shoppingCartSent(
      "ws-1",
      "contact-1",
      metadata,
      "ci-1",
    )

    expect(queuedEventData().eventType).toBe("shoppingCartSent")
    expect(queuedEventData().eventData).toEqual({
      ...metadata,
      contactInboxId: "ci-1",
    })
    // No sourceId: the cache is asked "any active condition of this type?".
    expect(mocks.hasActiveTriggers).toHaveBeenCalledWith(
      "ws-1",
      ["shoppingCartSent"],
      undefined,
    )
  })

  test("userAskedAboutProduct queues its metadata and contactInboxId, never a sourceId", async () => {
    const metadata = { ...base, product: reference }

    await TriggerEventEmitter.userAskedAboutProduct(
      "ws-1",
      "contact-1",
      metadata,
      "ci-1",
    )

    expect(queuedEventData().eventType).toBe("userAskedAboutProduct")
    expect(queuedEventData().eventData).toEqual({
      ...metadata,
      contactInboxId: "ci-1",
    })
    expect(queuedEventData().eventData).not.toHaveProperty("sourceId")
  })

  test("queues nothing when no active trigger listens for the event", async () => {
    mocks.hasActiveTriggers.mockResolvedValue(false)

    await TriggerEventEmitter.userAskedAboutProduct("ws-1", "contact-1", {
      ...base,
      product: reference,
    })

    expect(mocks.triggerQueueAdd).not.toHaveBeenCalled()
  })
})
