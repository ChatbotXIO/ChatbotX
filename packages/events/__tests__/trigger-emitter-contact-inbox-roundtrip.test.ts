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
