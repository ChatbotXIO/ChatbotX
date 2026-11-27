import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  castVote: vi.fn(),
  findUnscopedWithCandidates: vi.fn(),
  listRecent: vi.fn(),
  findWorkspace: vi.fn(),
  warn: vi.fn(),
  chatAdd: vi.fn(),
  integrationAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { findById: mocks.findWorkspace },
}))
vi.mock("@chatbotx.io/business/poll", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pollService: {
    findUnscopedWithCandidates: mocks.findUnscopedWithCandidates,
    listRecent: mocks.listRecent,
  },
  pollVoteService: { castVote: mocks.castVote },
}))
vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "channel",
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendFlowMessage: "sendFlowMessage" },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  chatQueue: { add: mocks.chatAdd },
  integrationQueue: { add: mocks.integrationAdd },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: mocks.warn, error: vi.fn() },
}))

const { handlePollTap } = await import(
  "../src/integration/handlers/poll/handle-tap"
)

const HOUR = 3_600_000
const conversation = {
  id: "conv-1",
  workspaceId: "w1",
  contactId: "contact-1",
} as never
const inbox = (channel: string) => ({ id: "ci-1", channel }) as never

const running = {
  id: "p1",
  workspaceId: "w1",
  name: "Best cat",
  imageUrl: "https://example.com/cat.png",
  startsAt: new Date(Date.now() - HOUR),
  endsAt: new Date(Date.now() + HOUR),
  afterVoteFlowId: "flow-9",
  candidates: [
    { id: "c1", name: "Tom", description: "A cat", imageUrl: null },
    { id: "c2", name: "Kit", description: null, imageUrl: null },
  ],
}
const ended = {
  ...running,
  id: "p2",
  startsAt: new Date(Date.now() - 3 * HOUR),
  endsAt: new Date(Date.now() - 2 * HOUR),
}

const vote = { type: "poll_vote", pollId: "p1", candidateId: "c1" } as const
const stepsOf = () => mocks.chatAdd.mock.calls.map(([, job]) => job.data)

describe("handlePollTap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspace.mockResolvedValue({ language: "en", timezone: "UTC" })
    mocks.findUnscopedWithCandidates.mockResolvedValue(running)
  })

  test("new vote sends the success message and then the after-vote flow", async () => {
    mocks.castVote.mockResolvedValue({
      result: "new",
      afterVoteFlowId: "flow-9",
      afterVoteFlowJobId: "poll-vote-flow-p1-contact-1-1",
    })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(mocks.castVote).toHaveBeenCalledWith({
      workspaceId: "w1",
      pollId: "p1",
      candidateId: "c1",
      contactId: "contact-1",
      contactInboxId: "ci-1",
    })
    expect(stepsOf()).toHaveLength(1)
    expect(stepsOf()[0].step.stepType).toBe("sendQuickReply")
    expect(mocks.integrationAdd).toHaveBeenCalledTimes(1)
    const [, job, opts] = mocks.integrationAdd.mock.calls[0] ?? []
    expect(job.data.flowId).toBe("flow-9")
    expect(job.data.conversationId).toBe("conv-1")
    expect(job.data.contactInboxId).toBe("ci-1")
    expect(opts.delay).toBeGreaterThan(0)
    expect(opts.jobId).toBe("poll-vote-flow-p1-contact-1-1")
  })

  test("a retried unchanged vote still re-attempts the after-vote flow", async () => {
    mocks.castVote.mockResolvedValue({
      result: "unchanged",
      afterVoteFlowId: "flow-9",
      afterVoteFlowJobId: "poll-vote-flow-p1-contact-1-1",
    })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    const [, , opts] = mocks.integrationAdd.mock.calls[0] ?? []
    expect(opts.jobId).toBe("poll-vote-flow-p1-contact-1-1")
  })

  test("the after-vote flow is enqueued even when the success message cannot be built", async () => {
    mocks.castVote.mockResolvedValue({
      result: "new",
      afterVoteFlowId: "flow-9",
      afterVoteFlowJobId: "poll-vote-flow-p1-contact-1-1",
    })
    mocks.findWorkspace.mockRejectedValue(new Error("db down"))
    await expect(
      handlePollTap({
        payload: vote,
        conversation,
        contactInbox: inbox("messenger"),
      }),
    ).rejects.toThrow("db down")
    expect(mocks.integrationAdd).toHaveBeenCalledTimes(1)
    expect(mocks.chatAdd).not.toHaveBeenCalled()
  })

  test("changed vote also runs the after-vote flow", async () => {
    mocks.castVote.mockResolvedValue({
      result: "changed",
      afterVoteFlowId: "flow-9",
      afterVoteFlowJobId: "poll-vote-flow-p1-contact-1-1",
    })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(mocks.integrationAdd).toHaveBeenCalledTimes(1)
  })

  test("unchanged vote sends the success message only", async () => {
    mocks.castVote.mockResolvedValue({
      result: "unchanged",
      afterVoteFlowId: null,
      afterVoteFlowJobId: null,
    })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(mocks.integrationAdd).not.toHaveBeenCalled()
  })

  test("new vote without a resolvable after-vote flow only sends the message", async () => {
    mocks.castVote.mockResolvedValue({
      result: "new",
      afterVoteFlowId: null,
      afterVoteFlowJobId: null,
    })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(mocks.integrationAdd).not.toHaveBeenCalled()
  })

  test("candidateNotFound resends the candidates without reloading the poll", async () => {
    mocks.castVote.mockResolvedValue({
      rejected: "candidateNotFound",
      poll: running,
    })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(stepsOf()[0].step.stepType).toBe("sendCarousel")
    expect(stepsOf()[0].step.cards).toHaveLength(2)
    expect(mocks.findUnscopedWithCandidates).not.toHaveBeenCalled()
  })

  test("notRunning resends the poll card", async () => {
    mocks.castVote.mockResolvedValue({ rejected: "notRunning", poll: ended })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(stepsOf()[0].step.cards).toHaveLength(1)
    expect(stepsOf()[0].step.cards[0].buttons).toHaveLength(0)
  })

  test("a deleted poll enqueues nothing", async () => {
    mocks.castVote.mockResolvedValue({ rejected: "pollNotFound" })
    await handlePollTap({
      payload: vote,
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(mocks.chatAdd).not.toHaveBeenCalled()
    expect(mocks.integrationAdd).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      { pollId: "p1" },
      "Poll tap: poll not found",
    )
  })

  test("poll_open on a running poll sends the candidates", async () => {
    await handlePollTap({
      payload: { type: "poll_open", pollId: "p1" },
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()[0].step.cards).toHaveLength(2)
  })

  test("poll_open on an ended poll sends the poll card", async () => {
    mocks.findUnscopedWithCandidates.mockResolvedValue(ended)
    await handlePollTap({
      payload: { type: "poll_open", pollId: "p2" },
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()[0].step.cards).toHaveLength(1)
    expect(stepsOf()[0].step.cards[0].buttons).toHaveLength(0)
  })

  test("poll_open for another workspace's poll enqueues nothing", async () => {
    mocks.findUnscopedWithCandidates.mockResolvedValue({
      ...running,
      workspaceId: "w2",
    })
    await handlePollTap({
      payload: { type: "poll_open", pollId: "p1" },
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(mocks.chatAdd).not.toHaveBeenCalled()
  })

  test("poll_list on WhatsApp asks the query for running polls only", async () => {
    mocks.listRecent.mockResolvedValue([running])
    await handlePollTap({
      payload: { type: "poll_list" },
      conversation,
      contactInbox: inbox("whatsapp"),
    })
    expect(mocks.listRecent).toHaveBeenCalledWith({
      workspaceId: "w1",
      limit: 10,
      runningAt: expect.any(Date),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(stepsOf()[0].step.cards).toHaveLength(1)
  })

  test("poll_list on WhatsApp shows an old running poll behind 10 newer ended ones", async () => {
    const olderRunning = { ...running, id: "p-old" }
    const newerEnded = Array.from({ length: 10 }, (_, i) => ({
      ...ended,
      id: `ended-${i}`,
    }))
    // Emulates the repository: the running filter applies BEFORE the limit.
    mocks.listRecent.mockImplementation(
      async (input: { limit: number; runningAt?: Date }) =>
        [...newerEnded, olderRunning]
          .filter((poll) =>
            input.runningAt
              ? poll.startsAt <= input.runningAt &&
                poll.endsAt > input.runningAt
              : true,
          )
          .slice(0, input.limit),
    )
    await handlePollTap({
      payload: { type: "poll_list" },
      conversation,
      contactInbox: inbox("whatsapp"),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(stepsOf()[0].step.cards).toHaveLength(1)
  })

  test("poll_list on WhatsApp with nothing running sends the noOpenPolls text", async () => {
    mocks.listRecent.mockResolvedValue([])
    await handlePollTap({
      payload: { type: "poll_list" },
      conversation,
      contactInbox: inbox("whatsapp"),
    })
    expect(stepsOf()).toHaveLength(1)
    expect(stepsOf()[0].step.stepType).toBe("sendText")
  })

  test("poll_list on Messenger shows ended polls too", async () => {
    mocks.listRecent.mockResolvedValue([running, ended])
    await handlePollTap({
      payload: { type: "poll_list" },
      conversation,
      contactInbox: inbox("messenger"),
    })
    expect(stepsOf()[0].step.cards).toHaveLength(2)
  })

  describe.each([
    "messenger",
    "instagram",
    "whatsapp",
    "telegram",
    "webchat",
  ])("channel %s", (channel) => {
    test("vote produces a success step with the Polls button payload", async () => {
      mocks.castVote.mockResolvedValue({
        result: "new",
        afterVoteFlowId: "flow-9",
        afterVoteFlowJobId: "poll-vote-flow-p1-contact-1-1",
      })
      await handlePollTap({
        payload: vote,
        conversation,
        contactInbox: inbox(channel),
      })
      const [data] = stepsOf()
      expect(data.step.stepType).toBe(
        channel === "whatsapp" ? "sendText" : "sendQuickReply",
      )
      const entries = Object.values(data.richResponse.buttonPayloads) as {
        payload: { type: string }
      }[]
      expect(entries.map((entry) => entry.payload.type)).toEqual(["poll_list"])
    })

    test("candidates carousel carries one vote payload per candidate", async () => {
      mocks.castVote.mockResolvedValue({
        rejected: "candidateNotFound",
        poll: running,
      })
      await handlePollTap({
        payload: vote,
        conversation,
        contactInbox: inbox(channel),
      })
      const [data] = stepsOf()
      expect(data.step.stepType).toBe("sendCarousel")
      const entries = Object.values(data.richResponse.buttonPayloads) as {
        payload: { type: string; candidateId: string }
      }[]
      expect(entries.map((entry) => entry.payload.candidateId)).toEqual([
        "c1",
        "c2",
      ])
    })
  })
})
