import { quickReplySettingsDefaultFn } from "@chatbotx.io/flow-config"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationService: {
    clearQuickReplyChallenge: vi.fn(async () => true),
    setQuickReplyChallengeAttempts: vi.fn(async () => true),
    ensureActive: vi.fn(async () => true),
  },
  contactInboxService: { hasIncomingMessageSince: vi.fn(async () => false) },
  smartDelayService: {
    findById: vi.fn(),
    claimForRun: vi.fn(async () => true),
    requeueClaimedRun: vi.fn(async () => true),
  },
  detectConversationAndContactInbox: vi.fn(),
  detectFlowVersion: vi.fn(),
  enqueueFlowStepMessage: vi.fn(async () => undefined),
  runStepsAndQuickReplies: vi.fn(async () => undefined),
  initVariables: vi.fn(() => ({ conversation: {} })),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: mocks.conversationService,
  contactInboxService: mocks.contactInboxService,
}))
vi.mock("@chatbotx.io/business/contact-inbox", () => ({
  contactInboxService: mocks.contactInboxService,
}))
vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: mocks.smartDelayService,
}))
vi.mock("@chatbotx.io/sdk", () => ({
  initVariables: mocks.initVariables,
  SdkException: mocks.SdkException,
}))
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: mocks.detectConversationAndContactInbox,
  detectFlowVersion: mocks.detectFlowVersion,
}))
vi.mock("../src/integration/handlers/flow-utils", () => ({
  enqueueFlowStepMessage: mocks.enqueueFlowStepMessage,
}))
vi.mock("../src/integration/handlers/flow", () => ({
  runStepsAndQuickReplies: mocks.runStepsAndQuickReplies,
}))
vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const { runQuickReplyChallenge, runQuickReplyFollowUpResume } = await import(
  "../src/integration/handlers/quick-reply-resume"
)

const target = {
  buttonType: "startAnotherNode" as const,
  beforeStep: {
    id: "9",
    stepType: "startAnotherNode",
    nodeId: "node-2",
    viewOnly: true,
  },
}
const quickReplies = [
  { id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] },
]

function mockFlow(
  configure: (s: ReturnType<typeof quickReplySettingsDefaultFn>) => void,
) {
  const settings = quickReplySettingsDefaultFn()
  configure(settings)
  mocks.detectFlowVersion.mockResolvedValue({
    flowVersion: {
      id: "fv-1",
      flowId: "flow-1",
      nodes: [
        {
          id: "node-1",
          data: {
            details: { steps: [], quickReplies, quickReplySettings: settings },
          },
        },
      ],
      edges: [],
    },
    useLatestFlowVersion: true,
  })
  return settings
}

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  additionalAttributes: {},
}
const contactInbox = { id: "ci-1", channel: "messenger" }

function challenge(attempts: number, maxRetries = 3) {
  return {
    type: "quickReply" as const,
    data: {
      flowId: "flow-1",
      nodeId: "node-1",
      attempts,
      maxRetries,
      sentAt: new Date(),
    },
  }
}

describe("runQuickReplyChallenge", () => {
  beforeEach(() => vi.clearAllMocks())

  test("bot inactive: clears the challenge and sends nothing", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
    })
    mocks.conversationService.ensureActive.mockResolvedValueOnce(false)
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
    })
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("sends the retry message with the node's quick replies and bumps attempts", async () => {
    const settings = mockFlow((s) => {
      s.retry = {
        ...s.retry,
        enabled: true,
        message: "Tap one",
        maxRetries: 3,
        target,
      }
    })
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(1),
    })
    expect(
      mocks.conversationService.setQuickReplyChallengeAttempts,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
      fromAttempts: 1,
      toAttempts: 2,
    })
    expect(mocks.enqueueFlowStepMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "flow-1",
        flowVersionId: undefined,
        executedFlowVersionId: "fv-1",
        quickReplies,
        step: expect.objectContaining({
          id: settings.retry.id,
          nodeId: "node-1",
          stepType: "sendText",
          text: "Tap one",
        }),
      }),
    )
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a concurrent message that loses the CAS sends nothing", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
    })
    mocks.conversationService.setQuickReplyChallengeAttempts.mockResolvedValueOnce(
      false,
    )
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
  })

  test("a failed retry send rolls the attempt back", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
    })
    mocks.enqueueFlowStepMessage.mockRejectedValueOnce(
      new Error("window closed"),
    )
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(
      mocks.conversationService.setQuickReplyChallengeAttempts,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromAttempts: 1, toAttempts: 0 }),
    )
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("a failed rollback still logs the original send error", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
    })
    const sendError = new Error("window closed")
    const rollbackError = new Error("db down")
    mocks.enqueueFlowStepMessage.mockRejectedValueOnce(sendError)
    mocks.conversationService.setQuickReplyChallengeAttempts
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(rollbackError)
    await expect(
      runQuickReplyChallenge({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        challenge: challenge(0),
      }),
    ).resolves.toBeUndefined()
    expect(mocks.logger.warn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ err: sendError }),
      "runQuickReplyChallenge: failed to send retry message",
    )
    expect(mocks.logger.warn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ err: rollbackError }),
      "runQuickReplyChallenge: failed to roll back retry attempt",
    )
  })

  test("exceeded branch: a stale job losing the attempts-scoped clear does not route", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, maxRetries: 3, target }
    })
    mocks.conversationService.clearQuickReplyChallenge.mockResolvedValueOnce(
      false,
    )
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(3),
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith(expect.objectContaining({ attempts: 3 }))
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("exceeded retries clear the challenge and route to the target", async () => {
    const settings = mockFlow((s) => {
      s.retry = {
        ...s.retry,
        enabled: true,
        message: "Tap",
        maxRetries: 3,
        target,
      }
    })
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(3),
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
      attempts: 3,
    })
    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "quickReply",
        targetId: settings.retry.id,
        targetNodeId: "node-1",
        details: expect.objectContaining({
          id: settings.retry.id,
          label: "",
          buttonType: "startAnotherNode",
          steps: [],
        }),
      }),
    )
  })

  test("0 retries routes on the first non quick reply message", async () => {
    mockFlow((s) => {
      s.retry = { ...s.retry, enabled: true, maxRetries: 0, target }
    })
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0, 0),
    })
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledOnce()
  })

  test("stale state (retry turned off) clears and stops", async () => {
    mockFlow(() => undefined)
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalled()
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })
})

describe("runQuickReplyChallenge stale flow", () => {
  beforeEach(() => vi.clearAllMocks())

  test("flow version gone: clears the challenge for that node and stops", async () => {
    mocks.detectFlowVersion.mockRejectedValueOnce(
      new mocks.SdkException("FlowVersion not found"),
    )
    await runQuickReplyChallenge({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      challenge: challenge(0),
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
    })
    expect(mocks.logger.warn).toHaveBeenCalled()
    expect(mocks.enqueueFlowStepMessage).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("other errors are not swallowed", async () => {
    mocks.detectFlowVersion.mockRejectedValueOnce(new Error("db down"))
    await expect(
      runQuickReplyChallenge({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        challenge: challenge(0),
      }),
    ).rejects.toThrow("db down")
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).not.toHaveBeenCalled()
  })
})

describe("runQuickReplyFollowUpResume", () => {
  const row = {
    id: "sd-1",
    workspaceId: "ws-1",
    flowId: "flow-1",
    flowVersionId: null,
    contactInboxId: "ci-1",
    conversationId: "conv-1",
    nodeId: "node-1",
    stepId: "x",
    metadata: null,
    type: "quickReplyFollowUp",
    createdAt: new Date("2026-09-30T00:00:00.000Z"),
    triggerAt: new Date("2026-09-30T00:10:00.000Z"),
    status: "scheduled",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-30T00:10:00.000Z"))
    mocks.smartDelayService.findById.mockResolvedValue(row)
    mocks.detectConversationAndContactInbox.mockResolvedValue({
      conversation,
      contactInbox,
    })
  })

  afterEach(() => vi.useRealTimers())

  test("flow version gone after the claim: warns and stops without throwing", async () => {
    mocks.detectFlowVersion.mockRejectedValueOnce(
      new mocks.SdkException("FlowVersion not found"),
    )
    await expect(
      runQuickReplyFollowUpResume({ smartDelayId: "sd-1" }),
    ).resolves.toBeUndefined()
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "completed",
    })
    expect(mocks.logger.warn).toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("fires: completes the row, clears the challenge, routes to the follow-up target", async () => {
    const settings = mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "completed",
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      nodeId: "node-1",
    })
    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: settings.followUp.id,
        targetType: "quickReply",
      }),
    )
  })

  test("a failure after the claim requeues the row and rethrows for retry", async () => {
    mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    mocks.runStepsAndQuickReplies.mockRejectedValueOnce(new Error("queue down"))
    await expect(
      runQuickReplyFollowUpResume({ smartDelayId: "sd-1" }),
    ).rejects.toThrow("queue down")
    expect(mocks.smartDelayService.requeueClaimedRun).toHaveBeenCalledWith({
      id: "sd-1",
    })
  })

  test("contact replied since → cancel, no routing", async () => {
    mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    mocks.contactInboxService.hasIncomingMessageSince.mockResolvedValueOnce(
      true,
    )
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "canceled",
    })
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("bot paused / handed off → cancel, no routing", async () => {
    mockFlow((s) => {
      s.followUp = { ...s.followUp, enabled: true, target }
    })
    mocks.conversationService.ensureActive.mockResolvedValueOnce(false)
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "canceled",
    })
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("ignores rows of other types or statuses", async () => {
    mocks.smartDelayService.findById.mockResolvedValueOnce({
      ...row,
      type: "followUp",
    })
    await runQuickReplyFollowUpResume({ smartDelayId: "sd-1" })
    expect(mocks.smartDelayService.claimForRun).not.toHaveBeenCalled()
  })
})
