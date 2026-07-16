import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  contactInboxService,
  integrationQueueAdd,
  loggerWarn,
  smartDelayService,
} = vi.hoisted(() => ({
  contactInboxService: {
    hasIncomingMessageSince: vi.fn(),
  },
  integrationQueueAdd: vi.fn(),
  loggerWarn: vi.fn(),
  smartDelayService: {
    create: vi.fn(),
    findById: vi.fn(),
    markCanceled: vi.fn(),
    markCompleted: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business/contact-inbox", () => ({ contactInboxService }))

vi.mock("@chatbotx.io/business/smart-delay", () => ({ smartDelayService }))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    resumeFollowUp: "resumeFollowUp",
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: integrationQueueAdd,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarn,
  },
}))

const { handleFollowUp } = await import("../src/integration/handlers/follow-up")

const makeProps = (overrides: Record<string, unknown> = {}) =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
    },
    flowVersion: {
      id: "flow-version-1",
      flowId: "flow-1",
      edges: [
        {
          id: "edge-1",
          source: "follow-up-node",
          sourceHandle: "follow-up-node",
          target: "next-node",
          targetHandle: "input",
        },
      ],
    },
    step: {
      id: "step-1",
      stepType: "followUp",
      duration: 1,
      unit: "minutes",
    },
    targetId: "follow-up-node",
    useLatestFlowVersion: false,
    ...overrides,
  }) as never

describe("handleFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"))
    integrationQueueAdd.mockResolvedValue(undefined)
  })

  test("creates a follow-up smart-delay row and immediately enqueues resumeFollowUp for short delays", async () => {
    const result = await handleFollowUp(makeProps())

    expect(result).toEqual({ status: "wait", result: null })
    expect(smartDelayService.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        nodeId: "next-node",
        stepId: "step-1",
        type: "followUp",
        triggerAt: new Date("2026-07-16T00:01:00.000Z"),
        status: "pending",
      }),
    })

    const rowId = smartDelayService.create.mock.calls[0][0].data.id
    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "resumeFollowUp",
      {
        type: "resumeFollowUp",
        data: { smartDelayId: rowId },
      },
      { delay: 60_000, jobId: `smart-delay-${rowId}` },
    )
    expect(smartDelayService.markCompleted).toHaveBeenCalledWith({ id: rowId })
  })

  test("keeps long-delay rows pending for the scanner", async () => {
    const result = await handleFollowUp(
      makeProps({
        step: {
          id: "step-1",
          stepType: "followUp",
          duration: 10,
          unit: "minutes",
        },
      }),
    )

    expect(result).toEqual({ status: "wait", result: null })
    expect(smartDelayService.create).toHaveBeenCalledOnce()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(smartDelayService.markCompleted).not.toHaveBeenCalled()
  })

  test("skips without creating a row when no node is connected", async () => {
    const result = await handleFollowUp(
      makeProps({
        flowVersion: { id: "flow-version-1", flowId: "flow-1", edges: [] },
      }),
    )

    expect(result).toEqual({ status: "skip", result: null })
    expect(smartDelayService.create).not.toHaveBeenCalled()
  })

  test("skips without creating a row when contactInbox is missing", async () => {
    const result = await handleFollowUp(makeProps({ contactInbox: undefined }))

    expect(result).toEqual({ status: "skip", result: null })
    expect(smartDelayService.create).not.toHaveBeenCalled()
  })

  test("leaves the row pending when immediate enqueue fails", async () => {
    integrationQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    const result = await handleFollowUp(makeProps())

    expect(result).toEqual({ status: "wait", result: null })
    expect(smartDelayService.create).toHaveBeenCalledOnce()
    expect(smartDelayService.markCompleted).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: expect.any(String) }),
      "Failed to immediately enqueue smart delay; scanner will pick it up",
    )
  })
})
