import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the flow-step handler `handleSendMetaCapiEventStep`
// (apps/worker/src/integration/handlers/meta-conversions/). It is the flow
// builder's entry into the Meta CAPI pipeline: it gates the channel, derives
// the workspace from the conversation, builds the deterministic per-step/day
// dedup `sourceKey`, threads the optional value/currency/content fields, and
// delegates to `metaConversionsService.enqueueLeadEvent`. The trigger-action
// path has its own coverage (trigger-action-executor-add-tag.test.ts); this is
// the parallel coverage for the flow-step path.

const mocks = vi.hoisted(() => ({
  enqueueLeadEvent: vi.fn(),
  buildLeadSourceKey: vi.fn(() => "flow:step-1:ci-1:key"),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    metaConversionsService: {
      enqueueLeadEvent: mocks.enqueueLeadEvent,
      buildLeadSourceKey: mocks.buildLeadSourceKey,
    },
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleSendMetaCapiEventStep } = await import(
  "../src/integration/handlers/meta-conversions/send-meta-capi-event-step-handler"
)

const baseStep = {
  id: "step-1",
  stepType: "sendMetaCapiEvent" as const,
  eventName: "LeadSubmitted" as const,
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
}

function props(channel: string, step: typeof baseStep = baseStep) {
  return {
    contactInbox: { id: "ci-1", inboxId: "inbox-1", channel },
    conversation: { id: "conv-1", workspaceId: "ws-1" },
    step,
  } as unknown as Parameters<typeof handleSendMetaCapiEventStep>[0]
}

describe("handleSendMetaCapiEventStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildLeadSourceKey.mockReturnValue("flow:step-1:ci-1:key")
    mocks.enqueueLeadEvent.mockResolvedValue({ id: "mce-1" })
  })

  test.each([
    "messenger",
    "instagram",
    "whatsapp",
  ])("enqueues a lead event for supported channel %s with a channel-aware source key", async (channel) => {
    const result = await handleSendMetaCapiEventStep(props(channel))

    expect(mocks.buildLeadSourceKey).toHaveBeenCalledWith({
      scope: "flow",
      scopeId: "step-1",
      contactInboxId: "ci-1",
      channel,
    })
    expect(mocks.enqueueLeadEvent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel,
      contactInboxId: "ci-1",
      inboxId: "inbox-1",
      source: "flowStep",
      sourceKey: "flow:step-1:ci-1:key",
      value: undefined,
      currency: undefined,
      contentCategory: undefined,
      contentName: undefined,
    })
    expect(result).toEqual({ status: "success", result: null })
  })

  test("threads value, currency, and content fields to the enqueue", async () => {
    await handleSendMetaCapiEventStep(
      props("messenger", {
        ...baseStep,
        value: "9.99",
        currency: "USD",
        contentCategory: "signup",
        contentName: "newsletter",
      }),
    )

    expect(mocks.enqueueLeadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "9.99",
        currency: "USD",
        contentCategory: "signup",
        contentName: "newsletter",
      }),
    )
  })

  test("returns an error for an unsupported channel without enqueuing", async () => {
    const result = await handleSendMetaCapiEventStep(props("telegram"))

    expect(mocks.enqueueLeadEvent).not.toHaveBeenCalled()
    expect(result.status).toBe("error")
  })

  test("returns an error when the enqueue fails", async () => {
    mocks.enqueueLeadEvent.mockRejectedValueOnce(new Error("boom"))

    const result = await handleSendMetaCapiEventStep(props("messenger"))

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.errorMessage).toBe("boom")
    }
  })
})
