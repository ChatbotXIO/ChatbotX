import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  decodeRef: vi.fn(),
  findUnscopedWithCandidates: vi.fn(),
  findWorkspace: vi.fn(),
  chatAdd: vi.fn(),
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  decodeRef: mocks.decodeRef,
  encodeRef: vi.fn(),
  workspaceService: { findById: mocks.findWorkspace },
}))
vi.mock("@chatbotx.io/business/leaderboard", () => ({
  leaderboardScoringService: {},
  leaderboardService: {},
}))
vi.mock("@chatbotx.io/business/minigame", () => ({
  isMinigameWithinPlayWindow: vi.fn(),
  minigameService: {},
  minigameContactService: {},
}))
vi.mock("@chatbotx.io/business/poll", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pollService: {
    findUnscopedWithCandidates: mocks.findUnscopedWithCandidates,
  },
  pollVoteService: {},
}))
vi.mock("@chatbotx.io/database/client", () => ({ findOrFail: vi.fn() }))
vi.mock(
  "@chatbotx.io/database/schema",
  () => new Proxy({}, { get: () => ({}), has: () => true }),
)
vi.mock("@chatbotx.io/event-bus", () => ({ emit: mocks.emit }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactReferredANewContact: vi.fn(),
  emitContactReferredExistingContact: vi.fn(),
}))
vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "channel",
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendFlowMessage: "sendFlowMessage" },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  chatQueue: { add: mocks.chatAdd },
  integrationQueue: { add: vi.fn() },
}))

const contactInbox = { id: "ci-1", channel: "messenger", inboxId: "inbox-1" }
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: vi.fn(async () => ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox,
  })),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock("../src/integration/handlers/utils/contact", () => ({
  saveResultToCustomField: vi.fn(),
}))

const { runRef } = await import("../src/integration/handlers/ref")

const HOUR = 3_600_000
const poll = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  workspaceId: "workspace-1",
  name: "Best cat",
  imageUrl: "https://example.com/cat.png",
  startsAt: new Date(Date.now() - HOUR),
  endsAt: new Date(Date.now() + HOUR),
  afterVoteFlowId: null,
  candidates: [],
  ...overrides,
})

const run = () =>
  runRef({
    conversationId: "conversation-1",
    contactInboxId: "ci-1",
    ref: "pl_x",
    messageId: "m1",
  } as never)

describe("runRef - poll link", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contactInbox.channel = "messenger"
    mocks.decodeRef.mockReturnValue({ type: "poll", pollId: "p1" })
    mocks.findWorkspace.mockResolvedValue({ language: "en", timezone: "UTC" })
    mocks.findUnscopedWithCandidates.mockResolvedValue(poll())
  })

  test("running poll enqueues one carousel with one card and one button", async () => {
    await run()
    expect(mocks.chatAdd).toHaveBeenCalledTimes(1)
    const [name, job] = mocks.chatAdd.mock.calls[0] ?? []
    expect(name).toBe("sendFlowMessage")
    expect(job.data.flowId).toBe("0")
    expect(job.data.step.stepType).toBe("sendCarousel")
    expect(job.data.step.cards).toHaveLength(1)
    expect(job.data.step.cards[0].buttons).toHaveLength(1)
    const payloads = Object.values(job.data.richResponse.buttonPayloads) as {
      payload: unknown
    }[]
    expect(payloads.map((entry) => entry.payload)).toEqual([
      { type: "poll_open", pollId: "p1" },
    ])
    expect(mocks.emit).toHaveBeenCalledTimes(1)
  })

  test("poll in another workspace enqueues nothing", async () => {
    mocks.findUnscopedWithCandidates.mockResolvedValue(
      poll({ workspaceId: "workspace-2" }),
    )
    await run()
    expect(mocks.chatAdd).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  test("missing or unparsable poll enqueues nothing and does not throw", async () => {
    mocks.findUnscopedWithCandidates.mockResolvedValue(undefined)
    await expect(run()).resolves.toBeUndefined()
    expect(mocks.chatAdd).not.toHaveBeenCalled()
  })

  test("a poll lookup failure throws so the job retries", async () => {
    mocks.findUnscopedWithCandidates.mockRejectedValue(new Error("db down"))
    await expect(run()).rejects.toThrow("db down")
    expect(mocks.chatAdd).not.toHaveBeenCalled()
  })

  test("ended poll card has no button", async () => {
    mocks.findUnscopedWithCandidates.mockResolvedValue(
      poll({
        startsAt: new Date(Date.now() - 2 * HOUR),
        endsAt: new Date(Date.now() - HOUR),
      }),
    )
    await run()
    const job = mocks.chatAdd.mock.calls[0]?.[1]
    expect(job.data.step.cards[0].buttons).toHaveLength(0)
  })

  test("channel outside REF_CAPABLE_CHANNELS is ignored", async () => {
    contactInbox.channel = "line"
    await run()
    expect(mocks.chatAdd).not.toHaveBeenCalled()
  })
})
