import { quickReplySettingsDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationService: {
    armQuickReplyChallenge: vi.fn(async () => true),
    clearQuickReplyChallenge: vi.fn(async () => true),
    ensureActive: vi.fn(async () => true),
  },
  smartDelayService: {
    cancelQuickReplyFollowUps: vi.fn(async () => 0),
  },
  scheduleSmartDelayResume: vi.fn(async () => undefined),
  logger: { warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: mocks.conversationService,
}))
vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: mocks.smartDelayService,
}))
vi.mock("../src/integration/handlers/smart-delay", () => ({
  scheduleSmartDelayResume: mocks.scheduleSmartDelayResume,
}))
vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const {
  armQuickReplySettings,
  clearQuickReplyChallengeOnTap,
  clearQuickReplyPendingOnFlowEntry,
} = await import("../src/integration/handlers/quick-reply-settings")

const target = {
  buttonType: "startAnotherNode" as const,
  beforeStep: {
    id: "9",
    stepType: "startAnotherNode",
    nodeId: "node-2",
    viewOnly: true,
  },
}

function makeDetails(
  configure: (s: ReturnType<typeof quickReplySettingsDefaultFn>) => void,
) {
  const settings = quickReplySettingsDefaultFn()
  configure(settings)
  return {
    steps: [],
    quickReplies: [
      {
        id: "qr-1",
        label: "Yes",
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ],
    quickReplySettings: settings,
  }
}

const base = {
  workspaceId: "ws-1",
  conversation: {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    botEnabled: true,
    botResumeAt: null,
  },
  contactInboxId: "ci-1",
  flowId: "flow-1",
  flowVersionId: null,
  nodeId: "node-1",
}

describe("armQuickReplySettings", () => {
  beforeEach(() => vi.clearAllMocks())

  test("a legacy node arms nothing but supersedes an earlier retry", async () => {
    await armQuickReplySettings({
      ...base,
      details: { steps: [], quickReplies: [{ id: "qr-1" }] },
    })
    expect(
      mocks.conversationService.armQuickReplyChallenge,
    ).not.toHaveBeenCalled()
    expect(mocks.scheduleSmartDelayResume).not.toHaveBeenCalled()
    // A previous node's retry is superseded even when this node has none.
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })
  })

  test("writes a quickReply challenge when retry is on", async () => {
    await armQuickReplySettings({
      ...base,
      details: makeDetails((s) => {
        s.retry = {
          ...s.retry,
          enabled: true,
          message: "Tap",
          maxRetries: 2,
          target,
        }
      }),
    })
    expect(
      mocks.conversationService.armQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      challenge: {
        type: "quickReply",
        data: expect.objectContaining({
          flowId: "flow-1",
          nodeId: "node-1",
          attempts: 0,
          maxRetries: 2,
        }),
      },
    })
  })

  test("schedules a follow-up and supersedes other nodes' follow-ups", async () => {
    const details = makeDetails((s) => {
      s.followUp = {
        ...s.followUp,
        enabled: true,
        duration: 10,
        unit: "minutes",
        target,
      }
    })
    await armQuickReplySettings({ ...base, details })
    expect(
      mocks.smartDelayService.cancelQuickReplyFollowUps,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      exceptNodeId: "node-1",
    })
    expect(mocks.scheduleSmartDelayResume).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "quickReplyFollowUp",
        connectedNodeId: "node-1",
        stepId: details.quickReplySettings.followUp.id,
        flowVersionId: null,
      }),
    )
  })

  test("retry alone still cancels other nodes' follow-ups (symmetric supersede)", async () => {
    await armQuickReplySettings({
      ...base,
      details: makeDetails((s) => {
        s.retry = { ...s.retry, enabled: true, message: "Tap", target }
      }),
    })
    expect(
      mocks.smartDelayService.cancelQuickReplyFollowUps,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      exceptNodeId: "node-1",
    })
    expect(mocks.scheduleSmartDelayResume).not.toHaveBeenCalled()
  })

  const retryAndFollowUp = () =>
    makeDetails((s) => {
      s.retry = { ...s.retry, enabled: true, message: "Tap", target }
      s.followUp = {
        ...s.followUp,
        enabled: true,
        duration: 10,
        unit: "minutes",
        target,
      }
    })

  test("a flow sent from the inbox arms nothing but still supersedes", async () => {
    await armQuickReplySettings({
      ...base,
      sendFrom: "inbox",
      details: retryAndFollowUp(),
    })
    expect(
      mocks.conversationService.armQuickReplyChallenge,
    ).not.toHaveBeenCalled()
    expect(mocks.scheduleSmartDelayResume).not.toHaveBeenCalled()
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({ workspaceId: "ws-1", conversationId: "conv-1" })
    expect(
      mocks.smartDelayService.cancelQuickReplyFollowUps,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      exceptNodeId: "node-1",
    })
  })

  test("a paused bot arms nothing but still supersedes", async () => {
    mocks.conversationService.ensureActive.mockResolvedValueOnce(false)
    const conversation = { ...base.conversation, botEnabled: false }
    await armQuickReplySettings({
      ...base,
      conversation,
      details: retryAndFollowUp(),
    })
    expect(mocks.conversationService.ensureActive).toHaveBeenCalledWith(
      conversation,
    )
    expect(
      mocks.conversationService.armQuickReplyChallenge,
    ).not.toHaveBeenCalled()
    expect(mocks.scheduleSmartDelayResume).not.toHaveBeenCalled()
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({ workspaceId: "ws-1", conversationId: "conv-1" })
    expect(
      mocks.smartDelayService.cancelQuickReplyFollowUps,
    ).toHaveBeenCalledOnce()
  })

  test("an active bot arms both retry and follow-up", async () => {
    await armQuickReplySettings({ ...base, details: retryAndFollowUp() })
    expect(
      mocks.conversationService.armQuickReplyChallenge,
    ).toHaveBeenCalledOnce()
    expect(mocks.scheduleSmartDelayResume).toHaveBeenCalledOnce()
  })

  test("a pause landing after ensureActive wins: no follow-up is scheduled", async () => {
    mocks.conversationService.armQuickReplyChallenge.mockResolvedValueOnce(
      false,
    )
    await armQuickReplySettings({ ...base, details: retryAndFollowUp() })
    expect(mocks.scheduleSmartDelayResume).not.toHaveBeenCalled()
    expect(
      mocks.smartDelayService.cancelQuickReplyFollowUps,
    ).toHaveBeenCalledOnce()
  })

  test("swallows service errors so the flow keeps running", async () => {
    mocks.conversationService.armQuickReplyChallenge.mockRejectedValueOnce(
      new Error("db down"),
    )
    await expect(
      armQuickReplySettings({
        ...base,
        details: makeDetails((s) => {
          s.retry = { ...s.retry, enabled: true, message: "Tap", target }
        }),
      }),
    ).resolves.toBeUndefined()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })
})

describe("clearQuickReplyPendingOnFlowEntry", () => {
  beforeEach(() => vi.clearAllMocks())

  test("same flow keeps the challenge (Continue edge case)", async () => {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: {
            type: "quickReply",
            data: { flowId: "flow-1", nodeId: "node-1" },
          },
        },
      },
      contactInboxId: "ci-1",
      flowId: "flow-1",
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).not.toHaveBeenCalled()
    expect(
      mocks.smartDelayService.cancelQuickReplyFollowUps,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      exceptFlowId: "flow-1",
    })
  })

  test("a different flow clears the challenge", async () => {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: {
            type: "quickReply",
            data: { flowId: "flow-1", nodeId: "node-1" },
          },
        },
      },
      contactInboxId: "ci-1",
      flowId: "flow-2",
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      exceptFlowId: "flow-2",
    })
  })

  test("never clears a Get User Data challenge", async () => {
    await clearQuickReplyPendingOnFlowEntry({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: {
            type: "step",
            data: { flowId: "flow-1", nodeId: "n", stepId: "s" },
          },
        },
      },
      contactInboxId: "ci-1",
      flowId: "flow-2",
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).not.toHaveBeenCalled()
  })
})

describe("clearQuickReplyChallengeOnTap", () => {
  beforeEach(() => vi.clearAllMocks())

  test("clears only when a quickReply challenge is pending", async () => {
    await clearQuickReplyChallengeOnTap({
      workspaceId: "ws-1",
      conversation: { id: "conv-1", additionalAttributes: {} },
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).not.toHaveBeenCalled()

    await clearQuickReplyChallengeOnTap({
      workspaceId: "ws-1",
      conversation: {
        id: "conv-1",
        additionalAttributes: {
          challenge: { type: "quickReply", data: { flowId: "f", nodeId: "n" } },
        },
      },
    })
    expect(
      mocks.conversationService.clearQuickReplyChallenge,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })
  })
})
