import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the flow-step handlers `handleTrackAdsLeadStep`/
// `handleTrackAdsPurchaseStep`
// (apps/worker/src/integration/handlers/meta-conversions/track-ads-step-handler.ts).
// They are a thin adapter from the flow-execution runtime to the REUSED
// ads-conversion pipeline (attribution gate + find-or-create + CAPI send):
// they derive `flowNodeId` from `props.targetNodeId` (NOT a step-schema
// field), `workspaceId` from `conversation.workspaceId`, `contactInboxId`
// from the passed contact inbox, and delegate to
// `adsConversionService.recordFlowStepConversion`. Errors are caught and
// returned as a step result, never a rejection.

const mocks = vi.hoisted(() => ({
  recordFlowStepConversion: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    adsConversionService: {
      recordFlowStepConversion: mocks.recordFlowStepConversion,
    },
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleTrackAdsLeadStep, handleTrackAdsPurchaseStep } = await import(
  "../src/integration/handlers/meta-conversions/track-ads-step-handler"
)

const baseLeadStep = {
  id: "step-1",
  stepType: "trackAdsLead" as const,
}

const basePurchaseStep = {
  id: "step-2",
  stepType: "trackAdsPurchase" as const,
  value: undefined,
  currency: undefined,
}

const NO_TARGET_NODE_ID = Symbol("no targetNodeId provided")

function leadProps(targetNodeId: string | typeof NO_TARGET_NODE_ID = "node-1") {
  return {
    contactInbox: { id: "ci-1", inboxId: "inbox-1", channel: "whatsapp" },
    conversation: { id: "conv-1", workspaceId: "ws-1" },
    step: baseLeadStep,
    targetNodeId: targetNodeId === NO_TARGET_NODE_ID ? undefined : targetNodeId,
  } as unknown as Parameters<typeof handleTrackAdsLeadStep>[0]
}

function purchaseProps(
  step: typeof basePurchaseStep = basePurchaseStep,
  targetNodeId: string | typeof NO_TARGET_NODE_ID = "node-1",
) {
  return {
    contactInbox: { id: "ci-1", inboxId: "inbox-1", channel: "whatsapp" },
    conversation: { id: "conv-1", workspaceId: "ws-1" },
    step,
    targetNodeId: targetNodeId === NO_TARGET_NODE_ID ? undefined : targetNodeId,
  } as unknown as Parameters<typeof handleTrackAdsPurchaseStep>[0]
}

describe("handleTrackAdsLeadStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordFlowStepConversion.mockResolvedValue({ id: "event-1" })
  })

  test("delegates to recordFlowStepConversion with flowNodeId from props.targetNodeId", async () => {
    const result = await handleTrackAdsLeadStep(leadProps())

    expect(mocks.recordFlowStepConversion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      flowNodeId: "node-1",
      eventType: "lead",
      value: undefined,
      currency: undefined,
    })
    expect(result).toEqual({ status: "success", result: null })
  })

  test("is a success even when the contact is not ads-attributed (silent no-op)", async () => {
    mocks.recordFlowStepConversion.mockResolvedValue(null)

    const result = await handleTrackAdsLeadStep(leadProps())

    expect(result).toEqual({ status: "success", result: null })
  })

  test("returns an error without calling the service when targetNodeId is missing", async () => {
    const result = await handleTrackAdsLeadStep(leadProps(NO_TARGET_NODE_ID))

    expect(mocks.recordFlowStepConversion).not.toHaveBeenCalled()
    expect(result.status).toBe("error")
  })

  test("returns an error result (never a rejection) when the service call throws", async () => {
    mocks.recordFlowStepConversion.mockRejectedValueOnce(new Error("boom"))

    const result = await handleTrackAdsLeadStep(leadProps())

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.errorMessage).toBe("boom")
    }
  })
})

describe("handleTrackAdsPurchaseStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordFlowStepConversion.mockResolvedValue({ id: "event-1" })
  })

  test("delegates to recordFlowStepConversion with flowNodeId + purchase value/currency", async () => {
    const result = await handleTrackAdsPurchaseStep(
      purchaseProps({ ...basePurchaseStep, value: "19.99", currency: "USD" }),
    )

    expect(mocks.recordFlowStepConversion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      flowNodeId: "node-1",
      eventType: "purchase",
      value: "19.99",
      currency: "USD",
    })
    expect(result).toEqual({ status: "success", result: null })
  })

  test("returns an error without calling the service when targetNodeId is missing", async () => {
    const result = await handleTrackAdsPurchaseStep(
      purchaseProps(basePurchaseStep, NO_TARGET_NODE_ID),
    )

    expect(mocks.recordFlowStepConversion).not.toHaveBeenCalled()
    expect(result.status).toBe("error")
  })

  test("returns an error result (never a rejection) when the service call throws", async () => {
    mocks.recordFlowStepConversion.mockRejectedValueOnce(new Error("boom"))

    const result = await handleTrackAdsPurchaseStep(purchaseProps())

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.errorMessage).toBe("boom")
    }
  })
})
