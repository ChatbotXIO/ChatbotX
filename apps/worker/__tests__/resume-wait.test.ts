import { beforeEach, describe, expect, test, vi } from "vitest"

const { runFlowNode, smartDelayService } = vi.hoisted(() => ({
  runFlowNode: vi.fn(),
  smartDelayService: {
    claimForRun: vi.fn(),
    findById: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business/smart-delay", () => ({ smartDelayService }))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    resumeFollowUp: "resumeFollowUp",
    resumeWait: "resumeWait",
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: vi.fn(),
  },
}))

vi.mock("../src/integration/handlers/flow", () => ({ runFlowNode }))

const { runWaitResume } = await import(
  "../src/integration/handlers/wait-resume"
)

const waitRow = {
  id: "smart-delay-1",
  workspaceId: "workspace-1",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  contactInboxId: "contact-inbox-1",
  appointmentId: null,
  conversationId: "conversation-1",
  nodeId: "next-node",
  stepId: "step-1",
  metadata: null,
  type: "waitNode",
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  triggerAt: new Date("2026-07-16T00:01:00.000Z"),
  status: "scheduled",
}

describe("runWaitResume", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T00:01:00.000Z"))
    smartDelayService.findById.mockResolvedValue(waitRow)
    smartDelayService.claimForRun.mockResolvedValue(true)
  })

  test("runs the connected node after claiming the scheduled row", async () => {
    await runWaitResume({ smartDelayId: "smart-delay-1" })

    expect(smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "smart-delay-1",
      to: "completed",
    })
    expect(runFlowNode).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      nodeId: "next-node",
    })
  })

  test("preserves broadcast metadata when resuming the connected node", async () => {
    smartDelayService.findById.mockResolvedValueOnce({
      ...waitRow,
      metadata: {
        type: "broadcast",
        broadcastId: "broadcast-1",
        contactInboxId: "contact-inbox-1",
      },
    })

    await runWaitResume({ smartDelayId: "smart-delay-1" })

    expect(runFlowNode).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          type: "broadcast",
          broadcastId: "broadcast-1",
          contactInboxId: "contact-inbox-1",
        },
      }),
    )
  })

  test("preserves appointmentId when resuming the connected node", async () => {
    smartDelayService.findById.mockResolvedValueOnce({
      ...waitRow,
      appointmentId: "appointment-1",
    })

    await runWaitResume({ smartDelayId: "smart-delay-1" })

    expect(runFlowNode).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appointment-1",
      }),
    )
  })

  test("does not run when another worker already claimed the row", async () => {
    smartDelayService.claimForRun.mockResolvedValueOnce(false)

    await runWaitResume({ smartDelayId: "smart-delay-1" })

    expect(runFlowNode).not.toHaveBeenCalled()
  })

  test("does not touch rows scheduled for the future", async () => {
    smartDelayService.findById.mockResolvedValueOnce({
      ...waitRow,
      triggerAt: new Date("2026-07-16T00:02:00.000Z"),
    })

    await runWaitResume({ smartDelayId: "smart-delay-1" })

    expect(smartDelayService.claimForRun).not.toHaveBeenCalled()
    expect(runFlowNode).not.toHaveBeenCalled()
  })

  test.each([
    null,
    { ...waitRow, type: "followUp" },
    { ...waitRow, status: "completed" },
    { ...waitRow, nodeId: null },
  ])("no-ops for non-resumable row %#", async (row) => {
    smartDelayService.findById.mockResolvedValueOnce(row)

    await runWaitResume({ smartDelayId: "smart-delay-1" })

    expect(smartDelayService.claimForRun).not.toHaveBeenCalled()
    expect(runFlowNode).not.toHaveBeenCalled()
  })
})
