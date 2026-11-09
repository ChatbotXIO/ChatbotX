import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationService: {
    consumeChallenge: vi.fn(async () => true),
    ensureActive: vi.fn(async () => true),
  },
  workspaceService: {
    findById: vi.fn(async () => ({ id: "ws-1" })),
    isActiveNow: vi.fn(() => true),
  },
  smartDelayService: {
    findById: vi.fn(),
    claimForRun: vi.fn(async () => true),
  },
  requeueClaimedRunOrLog: vi.fn(async () => undefined),
  detectConversationAndContactInbox: vi.fn(),
  detectFlowVersion: vi.fn(),
  runStepsAndQuickReplies: vi.fn(async () => undefined),
  emit: vi.fn(),
  initVariables: vi.fn(() => ({ conversation: {} })),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: mocks.conversationService,
  workspaceService: mocks.workspaceService,
}))
vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: mocks.smartDelayService,
}))
vi.mock("@chatbotx.io/event-bus", () => ({ emit: mocks.emit }))
vi.mock("@chatbotx.io/sdk", () => ({
  initVariables: mocks.initVariables,
  SdkException: mocks.SdkException,
}))
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: mocks.detectConversationAndContactInbox,
  detectFlowVersion: mocks.detectFlowVersion,
}))
vi.mock("../src/integration/handlers/flow", () => ({
  runStepsAndQuickReplies: mocks.runStepsAndQuickReplies,
}))
vi.mock("../src/integration/handlers/quick-reply-resume", () => ({
  runQuickReplyChallenge: vi.fn(),
}))
vi.mock("../src/integration/handlers/smart-delay", () => ({
  requeueClaimedRunOrLog: mocks.requeueClaimedRunOrLog,
}))
vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const { runStepInputResolution, runStepInputTimeoutResume } = await import(
  "../src/integration/handlers/step-input-resolution"
)

const STARTED_AT = new Date("2026-11-09T10:00:00.000Z")

function stepChallenge(overrides: Record<string, unknown> = {}) {
  return {
    type: "step" as const,
    data: {
      flowId: "flow-1",
      flowVersionId: "fv-1",
      nodeId: "node-1",
      stepId: "step-1",
      attempts: 2,
      lastAttemptAt: new Date("2026-11-09T10:05:00.000Z"),
      startedAt: STARTED_AT,
      appointmentId: "appointment-1",
      challengeId: "challenge-1",
      ...overrides,
    },
  }
}

function makeConversation(challenge: unknown = stepChallenge()) {
  return {
    id: "conv-1",
    workspaceId: "ws-1",
    additionalAttributes: challenge ? { challenge } : {},
  }
}

const contactInbox = { id: "ci-1", channel: "messenger", inboxId: "inbox-1" }

function mockFlow(nodes: unknown[]) {
  mocks.detectFlowVersion.mockResolvedValue({
    flowVersion: { id: "fv-1", flowId: "flow-1", nodes, edges: [] },
    useLatestFlowVersion: false,
  })
}

const flowWithStep = [
  {
    id: "node-1",
    data: { details: { steps: [{ id: "step-1" }] } },
  },
]

const userSkip = {
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  challengeId: "challenge-1",
  reason: "user_skipped" as const,
  messageId: "msg-1",
  messageCreatedAt: new Date("2026-11-09T10:06:00.000Z"),
}
const timeout = {
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  challengeId: "challenge-1",
  reason: "timeout" as const,
}

function lastRunArgs() {
  return (mocks.runStepsAndQuickReplies.mock.calls[0] as unknown[])[0] as {
    startFromStepId: string
    targetId: string
    startedByContactMessage: boolean
    triggerMessageId?: string
    appointmentId?: string
    metadata?: unknown
    ctx: {
      variables: {
        conversation: Record<string, { type: string; value: unknown }>
      }
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.conversationService.consumeChallenge.mockResolvedValue(true)
  mocks.conversationService.ensureActive.mockResolvedValue(true)
  mocks.workspaceService.isActiveNow.mockReturnValue(true)
  mocks.detectConversationAndContactInbox.mockResolvedValue({
    conversation: makeConversation(),
    contactInbox,
  })
  mockFlow(flowWithStep)
})

describe("runStepInputResolution", () => {
  test("a user skip re-enters the step from its challenge, as a contact-initiated run", async () => {
    await runStepInputResolution(userSkip)

    const run = lastRunArgs()
    expect(run).toMatchObject({
      startFromStepId: "step-1",
      targetId: "node-1",
      startedByContactMessage: true,
      triggerMessageId: "msg-1",
      appointmentId: "appointment-1",
    })
    expect(run.ctx.variables.conversation).toMatchObject({
      challengeResolution: { type: "string", value: "user_skipped" },
      challengeId: { type: "string", value: "challenge-1" },
      challengeAttempts: { value: 2 },
      challengeStartedAt: { value: STARTED_AT },
    })
  })

  test("a timeout is not contact-initiated and carries no message identity", async () => {
    await runStepInputResolution(timeout)

    const run = lastRunArgs()
    expect(run.startedByContactMessage).toBe(false)
    expect(run.triggerMessageId).toBeUndefined()
    expect(run.ctx.variables.conversation.challengeResolution?.value).toBe(
      "timeout",
    )
  })

  test("passes no run metadata, so a flow looping back to the step cannot re-resolve it", async () => {
    await runStepInputResolution(userSkip)

    expect(lastRunArgs().metadata).toBeUndefined()
  })

  test("records the dashboard event for a user skip only", async () => {
    await runStepInputResolution(userSkip)
    expect(mocks.emit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        eventType: "message:bot_received",
        messageId: "msg-1",
        result: "success",
        metadata: expect.objectContaining({
          triggerContext: expect.objectContaining({
            triggerHandler: "runStepInputResolution",
          }),
        }),
      }),
    )

    mocks.emit.mockClear()
    mocks.runStepsAndQuickReplies.mockClear()
    await runStepInputResolution(timeout)
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  test.each([
    ["no challenge", null],
    ["a replaced challenge", stepChallenge({ challengeId: "newer" })],
    [
      "a quick-reply challenge",
      { type: "quickReply", data: { flowId: "flow-1", nodeId: "node-1" } },
    ],
  ])("ignores a stale resolution: %s", async (_label, challenge) => {
    mocks.detectConversationAndContactInbox.mockResolvedValue({
      conversation: makeConversation(challenge),
      contactInbox,
    })

    await runStepInputResolution(userSkip)

    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
    expect(mocks.conversationService.consumeChallenge).not.toHaveBeenCalled()
  })

  test("leaves the challenge alone when the workspace is no longer active", async () => {
    mocks.workspaceService.isActiveNow.mockReturnValue(false)

    await runStepInputResolution(userSkip)

    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
    expect(mocks.conversationService.consumeChallenge).not.toHaveBeenCalled()
  })

  test("leaves the challenge alone when the bot is paused", async () => {
    mocks.conversationService.ensureActive.mockResolvedValue(false)

    await runStepInputResolution(timeout)

    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test.each([
    [
      "flow version gone",
      () =>
        mocks.detectFlowVersion.mockRejectedValue(
          new mocks.SdkException("FlowVersion not found"),
        ),
    ],
    ["node gone", () => mockFlow([])],
    [
      "step gone",
      () => mockFlow([{ id: "node-1", data: { details: { steps: [] } } }]),
    ],
    [
      "node without steps",
      () => mockFlow([{ id: "node-1", data: { details: { type: "wait" } } }]),
    ],
  ])("clears the challenge and does not retry when the flow was edited: %s", async (_label, arrange) => {
    arrange()

    await expect(runStepInputResolution(userSkip)).resolves.toBeUndefined()

    expect(mocks.conversationService.consumeChallenge).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "challenge-1",
    })
    expect(mocks.logger.warn).toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a failure while running the step propagates, so the job retries", async () => {
    mocks.runStepsAndQuickReplies.mockRejectedValueOnce(new Error("boom"))

    await expect(runStepInputResolution(userSkip)).rejects.toThrow("boom")
    expect(mocks.emit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({ result: "fallback" }),
    )
  })

  test("an unexpected error while loading the flow still propagates", async () => {
    mocks.detectFlowVersion.mockRejectedValue(new Error("db down"))

    await expect(runStepInputResolution(timeout)).rejects.toThrow("db down")
    expect(mocks.conversationService.consumeChallenge).not.toHaveBeenCalled()
  })
})

describe("runStepInputTimeoutResume", () => {
  const row = {
    id: "sd-1",
    workspaceId: "ws-1",
    flowId: "flow-1",
    flowVersionId: "fv-1",
    contactInboxId: "ci-1",
    conversationId: "conv-1",
    nodeId: "node-1",
    stepId: "step-1",
    metadata: {
      type: "stepInputResolution",
      stepId: "step-1",
      challengeId: "challenge-1",
      reason: "timeout",
    },
    type: "stepInputTimeout",
    createdAt: new Date("2026-11-09T10:00:00.000Z"),
    triggerAt: new Date("2026-11-09T11:00:00.000Z"),
    status: "scheduled",
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-09T11:00:00.000Z"))
    mocks.smartDelayService.findById.mockResolvedValue(row)
  })

  afterEach(() => vi.useRealTimers())

  test("fires: claims the row, then resolves the step with the stored challenge and reason", async () => {
    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    // Tied to the observed deadline, so a timer re-armed meanwhile is not consumed.
    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "completed",
      observedTriggerAt: row.triggerAt,
    })
    expect(mocks.detectConversationAndContactInbox).toHaveBeenCalledWith({
      conversationId: "conv-1",
      contactInboxId: "ci-1",
    })
    expect(
      lastRunArgs().ctx.variables.conversation.challengeResolution,
    ).toEqual({ name: "challengeResolution", type: "string", value: "timeout" })
  })

  test.each([
    ["the row is gone", null],
    ["it is another smart-delay type", { ...row, type: "followUp" }],
    ["it was already claimed", { ...row, status: "completed" }],
    ["it was canceled", { ...row, status: "canceled" }],
    ["it is still pending", { ...row, status: "pending" }],
  ])("does nothing when %s", async (_label, found) => {
    mocks.smartDelayService.findById.mockResolvedValue(found)

    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    expect(mocks.smartDelayService.claimForRun).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a superseded timer (restarted for a later deadline) stands down", async () => {
    mocks.smartDelayService.findById.mockResolvedValue({
      ...row,
      triggerAt: new Date("2026-11-09T11:30:00.000Z"),
    })

    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    expect(mocks.smartDelayService.claimForRun).not.toHaveBeenCalled()
  })

  test("cancels a row whose payload is unreadable instead of running it", async () => {
    mocks.smartDelayService.findById.mockResolvedValue({
      ...row,
      metadata: { type: "stepInputResolution", reason: "nonsense" },
    })

    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "canceled",
      observedTriggerAt: row.triggerAt,
    })
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a timer re-armed between the read and the claim is left alone and nothing is resolved", async () => {
    // The claim is tied to the deadline read above, so the re-armed row (same
    // id, later deadline) does not match and the claim is lost.
    mocks.smartDelayService.claimForRun.mockResolvedValueOnce(false)

    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith(
      expect.objectContaining({ observedTriggerAt: row.triggerAt }),
    )
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a lost claim (another worker took the row) runs nothing", async () => {
    mocks.smartDelayService.claimForRun.mockResolvedValueOnce(false)

    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("a failed run restores the claimed row and rethrows so BullMQ retries it", async () => {
    mocks.runStepsAndQuickReplies.mockRejectedValueOnce(new Error("boom"))

    await expect(
      runStepInputTimeoutResume({ smartDelayId: "sd-1" }),
    ).rejects.toThrow("boom")

    expect(mocks.requeueClaimedRunOrLog).toHaveBeenCalledWith(
      "sd-1",
      expect.any(String),
    )
  })

  test("a stale challenge (the contact already answered) completes without running the step", async () => {
    mocks.detectConversationAndContactInbox.mockResolvedValue({
      conversation: makeConversation(null),
      contactInbox,
    })

    await runStepInputTimeoutResume({ smartDelayId: "sd-1" })

    expect(mocks.smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "sd-1",
      to: "completed",
      observedTriggerAt: row.triggerAt,
    })
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
    expect(mocks.requeueClaimedRunOrLog).not.toHaveBeenCalled()
  })
})
