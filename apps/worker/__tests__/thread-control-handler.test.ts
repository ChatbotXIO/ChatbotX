import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  identify: vi.fn(),
  hasChannelHandler: vi.fn(),
  runChannelHandler: vi.fn(),
  buildContext: vi.fn(),
  receiveMessage: vi.fn(),
  detectContactAndConversation: vi.fn(),
  resolveExistingContactInbox: vi.fn(),
  findOrCreate: vi.fn(),
  findConversationByUncached: vi.fn(),
  findActiveById: vi.fn(),
  recordEvent: vi.fn(),
  resolveCurrentState: vi.fn(),
  queueAdd: vi.fn(),
  requestThreadControlAction: vi.fn(),
  syncThreadOwner: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
  recordCallPermissionReply: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  conversationService: {
    findOrCreate: mocks.findOrCreate,
    findByUncached: mocks.findConversationByUncached,
  },
  flowService: { findActiveById: mocks.findActiveById },
  threadControlService: {
    recordEvent: mocks.recordEvent,
    resolveCurrentState: mocks.resolveCurrentState,
  },
}))

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  requestThreadControlAction: mocks.requestThreadControlAction,
  syncThreadOwner: mocks.syncThreadOwner,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.queueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mocks.loggerWarn,
    info: vi.fn(),
    debug: mocks.loggerDebug,
  },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    whatsapp: {
      hasChannelHandler: mocks.hasChannelHandler,
      runChannelHandler: mocks.runChannelHandler,
    },
  },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mocks.identify,
  },
}))

vi.mock("../src/integration/handlers/received-message", () => ({
  receiveMessage: mocks.receiveMessage,
  detectContactAndConversation: mocks.detectContactAndConversation,
  resolveExistingContactInbox: mocks.resolveExistingContactInbox,
}))

vi.mock("../src/integration/handlers/whatsapp-call-permission-reply", () => ({
  recordWhatsappCallPermissionReply: mocks.recordCallPermissionReply,
}))

const {
  isThreadControlJobReprocess,
  receiveThreadControlEvent,
  releaseOwnedThread,
} = await import("../src/integration/handlers/thread-control")

const OCCURRED_AT = new Date("2026-09-29T09:00:00.000Z")
const inbox = { id: "inbox-1", workspaceId: "ws-1", channel: "whatsapp" }
const integrationRow = { id: "iw-1", inboxId: "inbox-1" }
const contactInbox = { id: "ci-1", contactId: "contact-1", contact: {} }
const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

const jobData = {
  integrationType: "whatsapp",
  integrationIdentifier: "phone-1",
  payload: { kind: "handover", body: {} },
}

const handover = (overrides: Record<string, unknown> = {}) => ({
  kind: "handover" as const,
  event: {
    contact: { sourceId: "84900000001" },
    event: "controlPassed",
    // What the WhatsApp parser emits for every control_passed.
    resumeEligible: true,
    previousOwnerRole: "ai_agent",
    newOwnerRole: "escalation",
    handoverNote: "needs a human",
    context: { type: "summary", text: "Wants a refund" },
    occurredAt: OCCURRED_AT,
    ...overrides,
  },
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.identify.mockResolvedValue({ inbox, integrationRow })
  mocks.hasChannelHandler.mockReturnValue(true)
  mocks.buildContext.mockResolvedValue({ workspaceId: "ws-1" })
  mocks.resolveExistingContactInbox.mockResolvedValue({
    row: contactInbox,
    matchedBy: "sourceId",
  })
  mocks.findOrCreate.mockResolvedValue(conversation)
  // Default: the conversation is still archived when a release job runs.
  mocks.findConversationByUncached.mockResolvedValue({ archivedAt: new Date() })
  mocks.recordEvent.mockResolvedValue({
    eventApplied: true,
    stateChanged: true,
    isRedelivery: false,
    row: contactInbox,
  })
  mocks.queueAdd.mockResolvedValue(undefined)
  mocks.requestThreadControlAction.mockResolvedValue(undefined)
  mocks.syncThreadOwner.mockResolvedValue({})
})

describe("isThreadControlJobReprocess", () => {
  test("a fresh delivery is not a reprocess", () => {
    expect(
      isThreadControlJobReprocess({ attemptsMade: 0, stalledCounter: 0 }),
    ).toBe(false)
  })

  test("a thrown-error retry (attemptsMade bumped) is a reprocess", () => {
    expect(
      isThreadControlJobReprocess({ attemptsMade: 1, stalledCounter: 0 }),
    ).toBe(true)
  })

  test("a stalled-job recovery after a crash (only stalledCounter bumped) is a reprocess", () => {
    // BullMQ's stalled checker bumps stalledCounter, never attemptsMade, so a
    // crash between recordEvent and the resume enqueue must still count as a
    // reprocess or the resume flow is lost.
    expect(
      isThreadControlJobReprocess({ attemptsMade: 0, stalledCounter: 1 }),
    ).toBe(true)
  })
})

describe("receiveThreadControlEvent — routing", () => {
  test("hands the job payload to the channel handler", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())

    await receiveThreadControlEvent(jobData)

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "receiveThreadControlEvent",
      { ctx: { workspaceId: "ws-1" }, data: jobData },
    )
  })

  test("a null result (routing off or malformed) is dropped quietly", async () => {
    mocks.runChannelHandler.mockResolvedValue(null)

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordEvent).not.toHaveBeenCalled()
    expect(mocks.receiveMessage).not.toHaveBeenCalled()
    expect(mocks.loggerDebug).toHaveBeenCalled()
  })

  test("a channel without the handler is dropped without calling it", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    await receiveThreadControlEvent(jobData)

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("an unregistered integration type fails loudly", async () => {
    await expect(
      receiveThreadControlEvent({ ...jobData, integrationType: "nope" }),
    ).rejects.toThrow("No integration registered")
  })

  test("a standby message goes through the normal inbound pipeline, unchanged", async () => {
    const receivePayload = {
      phoneID: "phone-1",
      from: "84900000001",
      message: {},
    }
    mocks.runChannelHandler.mockResolvedValue({
      kind: "standbyMessage",
      receivePayload,
    })

    await receiveThreadControlEvent(jobData)

    expect(mocks.receiveMessage).toHaveBeenCalledWith({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-1",
      payload: receivePayload,
    })
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a stored standby message still records a call-permission answer (not automation)", async () => {
    const message = { id: "msg-1", senderType: "contact" }
    mocks.runChannelHandler.mockResolvedValue({
      kind: "standbyMessage",
      receivePayload: {},
    })
    mocks.receiveMessage.mockResolvedValue({
      message,
      conversation,
      postbackAction: null,
      quickReplyAction: null,
      suppressAutomation: true,
      standbyCopy: message,
    })

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordCallPermissionReply).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      message,
    })
  })

  test("the retry after a failed standby write still records the answer, once", async () => {
    const message = { id: "msg-1", senderType: "contact" }
    mocks.runChannelHandler.mockResolvedValue({
      kind: "standbyMessage",
      receivePayload: {},
    })
    // Attempt 1 failed after the save; on the retry the copy is not new
    // (`message` null) but is still the stored standby copy.
    mocks.receiveMessage.mockResolvedValue({
      message: null,
      conversation,
      postbackAction: null,
      quickReplyAction: null,
      suppressAutomation: true,
      standbyCopy: message,
    })

    await receiveThreadControlEvent(jobData, { isRetry: true })

    expect(mocks.recordCallPermissionReply).toHaveBeenCalledTimes(1)
    expect(mocks.recordCallPermissionReply).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      message,
    })
  })

  test("a duplicate or dropped standby message records nothing", async () => {
    mocks.runChannelHandler.mockResolvedValue({
      kind: "standbyMessage",
      receivePayload: {},
    })
    mocks.receiveMessage.mockResolvedValue({
      message: null,
      conversation,
      standbyCopy: null,
    })

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordCallPermissionReply).not.toHaveBeenCalled()
  })
})

describe("receiveThreadControlEvent — handover (T-6)", () => {
  beforeEach(() => {
    mocks.identify.mockResolvedValue({
      inbox,
      integrationRow: { ...integrationRow, handoverResumeFlowId: "flow-1" },
    })
    mocks.findActiveById.mockResolvedValue({
      id: "flow-1",
      currentVersionId: "fv-1",
    })
  })

  test("control_passed records the event with roles, note and context, then starts the resume flow once", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordEvent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inbox,
      contactInbox,
      conversationId: "conv-1",
      event: "controlPassed",
      ownerRole: "escalation",
      previousOwnerRole: "ai_agent",
      ownerAppId: null,
      previousOwnerAppId: null,
      occurredAt: OCCURRED_AT,
      context: { type: "summary", text: "Wants a refund" },
      handoverNote: "needs a human",
    })
    expect(mocks.findActiveById).toHaveBeenCalledWith({
      id: "flow-1",
      workspaceId: "ws-1",
    })
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    const [name, payload, options] = mocks.queueAdd.mock.calls[0] ?? []
    expect(name).toBe("sendFlow")
    expect(payload).toEqual({
      type: "sendFlow",
      data: {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "flow-1",
        origin: "channel",
      },
    })
    expect(options.jobId).toBe(`thread-resume-ci-1-${OCCURRED_AT.getTime()}`)
    expect(options.jobId).not.toContain(":")
  })

  test("a BullMQ retry after the flow enqueue failed starts the flow exactly once", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())
    mocks.queueAdd.mockRejectedValueOnce(new Error("redis down"))

    // Attempt 1: the event lands, then the enqueue throws.
    await expect(receiveThreadControlEvent(jobData)).rejects.toThrow(
      "redis down",
    )

    // Attempt 2: the row already holds this event, so it reads as a
    // redelivery, but it is our own retry.
    mocks.recordEvent.mockResolvedValue({
      eventApplied: true,
      stateChanged: false,
      isRedelivery: true,
      row: contactInbox,
    })
    await receiveThreadControlEvent(jobData, { isRetry: true })

    expect(mocks.queueAdd).toHaveBeenCalledTimes(2)
    const jobIds = mocks.queueAdd.mock.calls.map(
      ([, , options]) => options.jobId,
    )
    // Same deterministic id on both attempts: BullMQ keeps a single job.
    expect(new Set(jobIds)).toEqual(
      new Set([`thread-resume-ci-1-${OCCURRED_AT.getTime()}`]),
    )
  })

  test("a fresh Meta redelivery on the first attempt stays suppressed", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())
    mocks.recordEvent.mockResolvedValue({
      eventApplied: true,
      stateChanged: false,
      isRedelivery: true,
      row: contactInbox,
    })

    await receiveThreadControlEvent(jobData, { isRetry: false })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("an exact Meta redelivery (applied idempotently) never starts the flow again", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())
    // The row already held this controlPassed at this exact time.
    mocks.resolveExistingContactInbox.mockResolvedValue({
      row: {
        ...contactInbox,
        threadControlState: "owned",
        threadOwnerRole: "escalation",
        threadControlLastEvent: "controlPassed",
        threadControlUpdatedAt: OCCURRED_AT,
      },
      matchedBy: "sourceId",
    })
    mocks.recordEvent.mockResolvedValue({
      eventApplied: true,
      stateChanged: false,
      isRedelivery: true,
      row: contactInbox,
    })

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a stale handover (a newer transition already landed) never starts the flow", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())
    mocks.recordEvent.mockResolvedValue({
      eventApplied: false,
      stateChanged: false,
      isRedelivery: false,
      row: null,
    })

    await receiveThreadControlEvent(jobData)

    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("our own take is never a handover: control_taken records but starts no flow", async () => {
    mocks.runChannelHandler.mockResolvedValue(
      // The WhatsApp parser never marks control_taken resume-eligible.
      handover({
        event: "controlTaken",
        resumeEligible: undefined,
        context: undefined,
      }),
    )

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "controlTaken" }),
    )
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("resumeEligible decides, not the event name: a control_passed without it starts no flow", async () => {
    mocks.runChannelHandler.mockResolvedValue(
      handover({ resumeEligible: undefined }),
    )

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("an app-id channel: the owner app ids are persisted, and only a resume-eligible pass starts the flow", async () => {
    const appIdHandover = (overrides: Record<string, unknown>) =>
      handover({
        previousOwnerRole: null,
        newOwnerRole: null,
        previousOwnerAppId: "bizai-app",
        newOwnerAppId: "our-app",
        ...overrides,
      })

    // Resume-eligible pass (channel decided): persists ids and starts the flow.
    mocks.runChannelHandler.mockResolvedValueOnce(appIdHandover({}))
    await receiveThreadControlEvent(jobData)
    expect(mocks.recordEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ownerRole: null,
        ownerAppId: "our-app",
        previousOwnerAppId: "bizai-app",
      }),
    )
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)

    // Our own take (channel: not eligible): recorded, no flow.
    mocks.runChannelHandler.mockResolvedValueOnce(
      appIdHandover({
        event: "controlTaken",
        resumeEligible: false,
        previousOwnerAppId: "bizai-app",
      }),
    )
    await receiveThreadControlEvent(jobData)
    expect(mocks.recordEvent).toHaveBeenCalledTimes(2)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("no resume flow configured: the handover is recorded and nothing starts", async () => {
    mocks.identify.mockResolvedValue({ inbox, integrationRow })
    mocks.runChannelHandler.mockResolvedValue(handover())

    await receiveThreadControlEvent(jobData)

    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(mocks.findActiveById).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test.each([
    ["deleted or inactive flow", undefined],
    [
      "flow without a published version",
      { id: "flow-1", currentVersionId: null },
    ],
  ])("%s is logged and skipped, never fatal", async (_name, flow) => {
    mocks.findActiveById.mockResolvedValue(flow)
    mocks.runChannelHandler.mockResolvedValue(handover())

    await expect(receiveThreadControlEvent(jobData)).resolves.toBeUndefined()

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "flow-1" }),
      expect.stringContaining("resume flow"),
    )
  })

  test("an unknown contact handed to us is created, then handled like any other", async () => {
    mocks.resolveExistingContactInbox.mockResolvedValue(undefined)
    mocks.detectContactAndConversation.mockResolvedValue({
      contactInbox,
      conversation,
      contact: {},
      isNewContact: true,
    })
    mocks.runChannelHandler.mockResolvedValue(handover())

    await receiveThreadControlEvent(jobData)

    expect(mocks.detectContactAndConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingContact: { sourceId: "84900000001" },
        inbox,
      }),
    )
    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("control_taken for an unknown contact is dropped: nothing is created or recorded", async () => {
    mocks.resolveExistingContactInbox.mockResolvedValue(undefined)
    mocks.runChannelHandler.mockResolvedValue(
      handover({ event: "controlTaken" }),
    )

    await receiveThreadControlEvent(jobData)

    expect(mocks.detectContactAndConversation).not.toHaveBeenCalled()
    expect(mocks.recordEvent).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a failure recording the handover propagates so the job retries", async () => {
    mocks.runChannelHandler.mockResolvedValue(handover())
    mocks.recordEvent.mockRejectedValue(new Error("db down"))

    await expect(receiveThreadControlEvent(jobData)).rejects.toThrow("db down")
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})

describe("receiveThreadControlEvent — channel expiry sync after a handover", () => {
  const standbyRow = { ...contactInbox, threadControlState: "standby" }
  const recorded = (row: unknown, eventApplied = true) =>
    mocks.recordEvent.mockResolvedValue({
      eventApplied,
      stateChanged: true,
      isRedelivery: false,
      row,
    })

  beforeEach(() => {
    mocks.runChannelHandler.mockResolvedValue(
      handover({ event: "controlTaken", resumeEligible: undefined }),
    )
  })

  test("a handover that leaves the thread on standby syncs the owner for the fresh row", async () => {
    recorded(standbyRow)

    await receiveThreadControlEvent(jobData)

    expect(mocks.syncThreadOwner).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: standbyRow,
      conversationId: "conv-1",
    })
  })

  test.each([
    ["owned", { ...contactInbox, threadControlState: "owned" }],
    ["idle", { ...contactInbox, threadControlState: "idle" }],
  ])("a handover resulting in %s does not sync", async (_name, row) => {
    recorded(row)
    await receiveThreadControlEvent(jobData)
    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
  })

  test("a stale (not applied) handover does not sync", async () => {
    recorded(null, false)
    await receiveThreadControlEvent(jobData)
    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
  })

  test("a channel with no owner query (WhatsApp) resolves the sync to a no-op and the handover is unaffected", async () => {
    recorded(standbyRow)
    mocks.syncThreadOwner.mockResolvedValue(null)
    await expect(receiveThreadControlEvent(jobData)).resolves.toBeUndefined()
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  test("a failing sync is logged with err and never fails the handover", async () => {
    recorded(standbyRow)
    const failure = new Error("graph down")
    mocks.syncThreadOwner.mockRejectedValue(failure)

    await expect(receiveThreadControlEvent(jobData)).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, contactInboxId: "ci-1" }),
      expect.any(String),
    )
  })
})

describe("releaseOwnedThread (archive auto-release)", () => {
  const VERSION = new Date("2026-09-29T10:00:00.000Z")
  const data = {
    workspaceId: "ws-1",
    contactInboxId: "ci-1",
    conversationId: "conv-1",
    action: "release" as const,
    threadControlUpdatedAt: VERSION.toISOString(),
  }
  const ownedNow = { state: "owned", threadControlUpdatedAt: VERSION }

  beforeEach(() => {
    mocks.resolveCurrentState.mockResolvedValue(ownedNow)
  })

  test.each([
    "standby",
    "idle",
    null,
  ])("skips the release when the fresh thread state is %s", async (state) => {
    mocks.resolveCurrentState.mockResolvedValue(
      state === null ? null : { state, threadControlUpdatedAt: VERSION },
    )

    await expect(releaseOwnedThread(data)).resolves.toBeUndefined()

    expect(mocks.resolveCurrentState).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
    })
    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
  })

  test("skips the release when the thread was reacquired since the archive (version advanced)", async () => {
    mocks.resolveCurrentState.mockResolvedValue({
      state: "owned",
      threadControlUpdatedAt: new Date(VERSION.getTime() + 5000),
    })

    await expect(releaseOwnedThread(data)).resolves.toBeUndefined()

    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
  })

  test("skips the release when the conversation was unarchived since the job was queued", async () => {
    mocks.findConversationByUncached.mockResolvedValue({ archivedAt: null })

    await expect(releaseOwnedThread(data)).resolves.toBeUndefined()

    expect(mocks.findConversationByUncached).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
  })

  test("skips the release when the conversation no longer exists", async () => {
    mocks.findConversationByUncached.mockResolvedValue(undefined)

    await expect(releaseOwnedThread(data)).resolves.toBeUndefined()

    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
  })

  test("a legacy job without a carried version releases on the owned check alone", async () => {
    mocks.resolveCurrentState.mockResolvedValue({
      state: "owned",
      threadControlUpdatedAt: new Date(VERSION.getTime() + 5000),
    })
    const { threadControlUpdatedAt: _omitted, ...legacy } = data

    await releaseOwnedThread(legacy)

    expect(mocks.requestThreadControlAction).toHaveBeenCalledTimes(1)
  })

  test("asks the registry-aware action to release the thread", async () => {
    await releaseOwnedThread(data)

    expect(mocks.requestThreadControlAction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "release",
      // The validated version is re-checked inside requestAction, before the
      // channel call.
      expectedThreadControlUpdatedAt: VERSION,
    })
  })

  test("a permanent channel rejection (we no longer own the thread) is logged and the job completes", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(
      new ChannelError("not owner", ChannelErrorCategory.PERMISSION_DENIED, {
        code: 2_494_191,
      }),
    )

    await expect(releaseOwnedThread(data)).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  test("an unsupported channel or missing contact inbox is not retried", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(
      new ChatbotXException("gone", "notFound", 404),
    )

    await expect(releaseOwnedThread(data)).resolves.toBeUndefined()
  })

  test("a retryable channel failure rethrows so BullMQ retries", async () => {
    const error = new ChannelError("boom", ChannelErrorCategory.NETWORK_ERROR)
    mocks.requestThreadControlAction.mockRejectedValue(error)

    await expect(releaseOwnedThread(data)).rejects.toBe(error)
  })

  test("an unexpected failure rethrows", async () => {
    const error = new Error("redis down")
    mocks.requestThreadControlAction.mockRejectedValue(error)

    await expect(releaseOwnedThread(data)).rejects.toBe(error)
  })
})
