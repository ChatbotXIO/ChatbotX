import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  ChannelError,
  ChannelErrorCategory,
  ThreadControlTakeRefusedError,
} from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isConfiguredAndInactive: vi.fn(),
  resolveCurrentState: vi.fn(),
  requestThreadControlAction: vi.fn(),
  integrationQueueAdd: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiHandoverSettingsService: {
    isConfiguredAndInactive: mocks.isConfiguredAndInactive,
  },
  threadControlService: { resolveCurrentState: mocks.resolveCurrentState },
}))
vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  requestThreadControlAction: mocks.requestThreadControlAction,
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    aiHandoverTakeBack: "aiHandoverTakeBack",
    incomingMessage: "incomingMessage",
  },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { enqueueAiHandoverTakeBackIfDue, runAiHandoverTakeBack } = await import(
  "../src/integration/handlers/ai-handover-take-back"
)

const AI_APP_ID = "ai-app"
const UPDATED_AT = new Date("2026-10-01T09:00:00.000Z")
const REPLAY = { object: "page", entry: [{ messaging: [{ message: {} }] }] }

type EnqueueProps = Parameters<typeof enqueueAiHandoverTakeBackIfDue>[0]

const enqueueProps = (overrides: Partial<EnqueueProps> = {}): EnqueueProps => ({
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  integrationType: "messenger",
  integrationIdentifier: "page-1",
  ownerReplayPayload: REPLAY,
  aiAgentAppId: AI_APP_ID,
  standbyCopy: {
    id: "msg-1",
    conversationId: "conv-1",
    contactInboxId: "ci-1",
    messageType: "incoming",
  },
  ...overrides,
})

const jobData = {
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  integrationType: "messenger",
  integrationIdentifier: "page-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  messageId: "msg-1",
  aiAgentAppId: AI_APP_ID,
  threadControlUpdatedAt: UPDATED_AT.toISOString(),
  ownerReplayPayload: REPLAY,
}

/** The AI agent holds the thread. */
const heldByAi = {
  state: "standby",
  ownerRole: "ai_agent",
  lastEvent: "standbyReceived",
  previousOwnerAppId: null,
  threadControlUpdatedAt: UPDATED_AT,
}
/** This app already took the thread from the AI agent. */
const takenFromAi = {
  state: "owned",
  ownerRole: null,
  lastEvent: "taken",
  previousOwnerAppId: AI_APP_ID,
  threadControlUpdatedAt: UPDATED_AT,
}

const replayCall = () => [
  "incomingMessage",
  {
    type: "incomingMessage",
    data: {
      integrationType: "messenger",
      integrationIdentifier: "page-1",
      payload: REPLAY,
    },
  },
  { jobId: "ai-takeback-replay-msg-1" },
]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.isConfiguredAndInactive.mockResolvedValue(true)
  mocks.resolveCurrentState.mockResolvedValue(heldByAi)
  mocks.requestThreadControlAction.mockResolvedValue({
    threadControlState: "owned",
    threadControlLastEvent: "taken",
  })
  mocks.integrationQueueAdd.mockResolvedValue(undefined)
})

describe("enqueueAiHandoverTakeBackIfDue", () => {
  test("queues one take-back per message when the AI holds the thread and the automation is inactive, carrying the version it saw", async () => {
    await enqueueAiHandoverTakeBackIfDue(enqueueProps())

    expect(mocks.integrationQueueAdd).toHaveBeenCalledExactlyOnceWith(
      "aiHandoverTakeBack",
      { type: "aiHandoverTakeBack", data: jobData },
      {
        jobId: "ai-takeback-msg-1",
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnFail: true,
      },
    )
    expect(mocks.isConfiguredAndInactive).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
  })

  test("queues a replay for a later message of a burst once we took the thread from the AI (the automation is still not running)", async () => {
    mocks.resolveCurrentState.mockResolvedValue(takenFromAi)

    await enqueueAiHandoverTakeBackIfDue(enqueueProps())

    expect(mocks.integrationQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("never replays for a thread a human took from the AI while the automation is running (the AI already answered)", async () => {
    mocks.resolveCurrentState.mockResolvedValue(takenFromAi)
    mocks.isConfiguredAndInactive.mockResolvedValue(false)

    await enqueueAiHandoverTakeBackIfDue(enqueueProps())

    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test.each([
    ["the channel gave no replay payload", { ownerReplayPayload: undefined }],
    ["the channel has no AI app id", { aiAgentAppId: undefined }],
    [
      "the standby copy is an outgoing message (the AI's own reply)",
      {
        standbyCopy: {
          id: "msg-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          messageType: "outgoing",
        },
      },
    ],
    [
      "the channel has no AI hand-off settings",
      { integrationType: "whatsapp" },
    ],
  ])("queues nothing when %s", async (_label, overrides) => {
    await enqueueAiHandoverTakeBackIfDue(enqueueProps(overrides))
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("a workspace that never configured the automation is never touched (and costs no thread read)", async () => {
    mocks.isConfiguredAndInactive.mockResolvedValue(false)
    await enqueueAiHandoverTakeBackIfDue(enqueueProps())
    expect(mocks.resolveCurrentState).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("queues nothing for a take while the automation is running", async () => {
    mocks.isConfiguredAndInactive.mockResolvedValue(false)
    await enqueueAiHandoverTakeBackIfDue(enqueueProps())
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
    expect(mocks.resolveCurrentState).not.toHaveBeenCalled()
  })

  test.each([
    ["a partner holds it", { ...heldByAi, ownerRole: "escalation" }],
    ["its owner is unknown", { ...heldByAi, ownerRole: null }],
    ["it is idle", { ...heldByAi, state: "idle" }],
    [
      "we own it from a take that was not from the AI",
      { ...takenFromAi, previousOwnerAppId: "partner-app" },
    ],
    [
      "we own it but not through a take",
      { ...takenFromAi, lastEvent: "controlPassed" },
    ],
    ["routing was never observed", null],
  ])("queues nothing when %s (never takes from or answers for another app)", async (_label, current) => {
    mocks.resolveCurrentState.mockResolvedValue(current)
    await enqueueAiHandoverTakeBackIfDue(enqueueProps())
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })
})

describe("runAiHandoverTakeBack", () => {
  test("takes the thread at the version it was queued for, then replays the message as an owner delivery", async () => {
    await runAiHandoverTakeBack(jobData)

    expect(mocks.requestThreadControlAction).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "take",
      expectedThreadControlUpdatedAt: UPDATED_AT,
    })
    expect(mocks.integrationQueueAdd).toHaveBeenCalledExactlyOnceWith(
      ...replayCall(),
    )
    // The job re-checks the SAME Page's automation, not a workspace-wide one.
    expect(mocks.isConfiguredAndInactive).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
  })

  test("a job that carried no version expects none (null), never the current one", async () => {
    await runAiHandoverTakeBack({ ...jobData, threadControlUpdatedAt: null })
    expect(
      mocks.requestThreadControlAction.mock.calls[0][0]
        .expectedThreadControlUpdatedAt,
    ).toBeNull()
  })

  test("does nothing when the automation became active since it was queued", async () => {
    mocks.isConfiguredAndInactive.mockResolvedValue(false)
    await runAiHandoverTakeBack(jobData)
    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("does not replay when the AI handed the thread back between the read and the take (owned, but not through our take)", async () => {
    mocks.requestThreadControlAction.mockResolvedValue({
      threadControlState: "owned",
      threadControlLastEvent: "controlPassed",
    })
    await runAiHandoverTakeBack(jobData)
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("does not replay when a newer event won the race (the take came back not owned)", async () => {
    mocks.requestThreadControlAction.mockResolvedValue({
      threadControlState: "standby",
    })
    await runAiHandoverTakeBack(jobData)
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("replays only, whatever the settings are now, when we already took it from the AI (burst or retry after the take)", async () => {
    mocks.resolveCurrentState.mockResolvedValue(takenFromAi)
    mocks.isConfiguredAndInactive.mockResolvedValue(false)

    await runAiHandoverTakeBack(jobData)

    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).toHaveBeenCalledExactlyOnceWith(
      ...replayCall(),
    )
  })

  test.each([
    ["a partner holds it", { ...heldByAi, ownerRole: "escalation" }],
    ["it is idle", { ...heldByAi, state: "idle" }],
    [
      "a human took it, not us from the AI",
      { ...takenFromAi, previousOwnerAppId: null },
    ],
    ["the contact is gone", null],
  ])("never takes or replays when %s", async (_label, current) => {
    mocks.resolveCurrentState.mockResolvedValue(current)
    await runAiHandoverTakeBack(jobData)
    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test.each([
    [
      "Meta refuses the take",
      new ThreadControlTakeRefusedError(
        "refused",
        ChannelErrorCategory.PERMISSION_DENIED,
      ),
    ],
    [
      "a permanent channel error",
      new ChannelError("nope", ChannelErrorCategory.PERMISSION_DENIED),
    ],
    ["a domain rejection", new ChatbotXException("not found", "notFound", 404)],
  ])("%s: logged, no replay, the job completes (the bot stays silent)", async (_label, error) => {
    mocks.requestThreadControlAction.mockRejectedValue(error)

    await expect(runAiHandoverTakeBack(jobData)).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("a refusal because a concurrent take of the same burst already got us the thread still replays the message", async () => {
    mocks.resolveCurrentState
      .mockResolvedValueOnce(heldByAi) // this job's own read
      .mockResolvedValueOnce(takenFromAi) // after the refusal: already ours
    mocks.requestThreadControlAction.mockRejectedValue(
      new ThreadControlTakeRefusedError(
        "already owner",
        ChannelErrorCategory.PERMISSION_DENIED,
      ),
    )

    await runAiHandoverTakeBack(jobData)

    expect(mocks.integrationQueueAdd).toHaveBeenCalledExactlyOnceWith(
      ...replayCall(),
    )
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  test("an unclassified failure (e.g. a transport timeout) rethrows too: it is not a refusal, so the message must not be dropped", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(
      new ChannelError("timed out", ChannelErrorCategory.UNKNOWN),
    )

    await expect(runAiHandoverTakeBack(jobData)).rejects.toThrow("timed out")
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("a retryable channel error rethrows so the job retries, and nothing is replayed", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(
      new ChannelError("rate limited", ChannelErrorCategory.RATE_LIMITED),
    )

    await expect(runAiHandoverTakeBack(jobData)).rejects.toThrow("rate limited")
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("a failed replay enqueue rethrows; the retry finds the thread taken from the AI and replays even if the settings changed", async () => {
    mocks.integrationQueueAdd.mockRejectedValueOnce(new Error("redis down"))
    await expect(runAiHandoverTakeBack(jobData)).rejects.toThrow("redis down")

    mocks.resolveCurrentState.mockResolvedValue(takenFromAi)
    mocks.isConfiguredAndInactive.mockResolvedValue(false)
    await runAiHandoverTakeBack(jobData)

    expect(mocks.integrationQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.requestThreadControlAction).toHaveBeenCalledTimes(1)
  })

  test("a channel with no AI settings does nothing", async () => {
    await runAiHandoverTakeBack({ ...jobData, integrationType: "whatsapp" })
    expect(mocks.resolveCurrentState).not.toHaveBeenCalled()
  })
})
