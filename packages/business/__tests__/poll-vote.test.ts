import { DrizzleQueryError } from "drizzle-orm"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWithCandidates: vi.fn(),
  upsertVote: vi.fn(),
  existsInWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  pollRepository: {
    findWithCandidates: mocks.findWithCandidates,
    upsertVote: mocks.upsertVote,
  },
  flowRepository: { existsInWorkspace: mocks.existsInWorkspace },
}))

const { pollVoteService } = await import("../src/poll/vote.service")

const running = {
  id: "p1",
  startsAt: new Date(Date.now() - 60_000),
  endsAt: new Date(Date.now() + 60_000),
  candidates: [{ id: "c1" }, { id: "c2" }],
}
const input = {
  workspaceId: "w1",
  pollId: "p1",
  candidateId: "c1",
  contactId: "ct1",
  contactInboxId: "ci1",
}

const votedAt = new Date()
const voted = (result: string, at: Date | null = votedAt) => ({
  result,
  votedAt: at,
})
const jobId = `poll-vote-flow-p1-ct1-${votedAt.getTime()}`

describe("pollVoteService.castVote", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWithCandidates.mockResolvedValue(running)
  })

  test("passes through unchanged", async () => {
    mocks.upsertVote.mockResolvedValue(voted("unchanged"))
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      result: "unchanged",
      afterVoteFlowId: null,
      afterVoteFlowJobId: null,
    })
    expect(mocks.upsertVote).toHaveBeenCalledWith(input)
  })

  test("unchanged vote right after the vote re-offers the flow (job retry)", async () => {
    mocks.findWithCandidates.mockResolvedValue({
      ...running,
      afterVoteFlowId: "f1",
    })
    mocks.upsertVote.mockResolvedValue(voted("unchanged"))
    mocks.existsInWorkspace.mockResolvedValue(true)
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      result: "unchanged",
      afterVoteFlowId: "f1",
      afterVoteFlowJobId: jobId,
    })
  })

  test("unchanged vote long after the vote does not rerun the flow", async () => {
    mocks.findWithCandidates.mockResolvedValue({
      ...running,
      afterVoteFlowId: "f1",
    })
    mocks.upsertVote.mockResolvedValue(
      voted("unchanged", new Date(Date.now() - 10 * 60_000)),
    )
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      result: "unchanged",
      afterVoteFlowId: null,
      afterVoteFlowJobId: null,
    })
    expect(mocks.existsInWorkspace).not.toHaveBeenCalled()
  })

  test("unchanged vote racing a concurrent first vote leaves the flow to it", async () => {
    mocks.findWithCandidates.mockResolvedValue({
      ...running,
      afterVoteFlowId: "f1",
    })
    mocks.upsertVote.mockResolvedValue(voted("unchanged", null))
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      result: "unchanged",
      afterVoteFlowId: null,
      afterVoteFlowJobId: null,
    })
  })

  test("new vote returns the after-vote flow when it still exists", async () => {
    mocks.findWithCandidates.mockResolvedValue({
      ...running,
      afterVoteFlowId: "f1",
    })
    mocks.upsertVote.mockResolvedValue(voted("new"))
    mocks.existsInWorkspace.mockResolvedValue(true)
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      result: "new",
      afterVoteFlowId: "f1",
      afterVoteFlowJobId: jobId,
    })
    expect(mocks.existsInWorkspace).toHaveBeenCalledWith({
      workspaceId: "w1",
      id: "f1",
    })
  })

  test("deleted after-vote flow resolves to null", async () => {
    mocks.findWithCandidates.mockResolvedValue({
      ...running,
      afterVoteFlowId: "f1",
    })
    mocks.upsertVote.mockResolvedValue(voted("changed"))
    mocks.existsInWorkspace.mockResolvedValue(false)
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      result: "changed",
      afterVoteFlowId: null,
      afterVoteFlowJobId: null,
    })
  })

  test("ended poll is rejected without upsert", async () => {
    const ended = {
      ...running,
      startsAt: new Date(Date.now() - 120_000),
      endsAt: new Date(Date.now() - 60_000),
    }
    mocks.findWithCandidates.mockResolvedValue(ended)
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      rejected: "notRunning",
      poll: ended,
    })
    expect(mocks.upsertVote).not.toHaveBeenCalled()
  })

  test("candidate from another poll is rejected", async () => {
    await expect(
      pollVoteService.castVote({ ...input, candidateId: "other" }),
    ).resolves.toEqual({ rejected: "candidateNotFound", poll: running })
    expect(mocks.upsertVote).not.toHaveBeenCalled()
  })

  test("missing poll is rejected", async () => {
    mocks.findWithCandidates.mockResolvedValue(undefined)
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      rejected: "pollNotFound",
    })
  })

  const fkError = (constraint: string) =>
    new DrizzleQueryError(
      "insert into PollVote",
      [],
      Object.assign(new Error("fk"), { code: "23503", constraint }),
    )

  test("candidate FK violation reloads the poll and becomes candidateNotFound", async () => {
    const reloaded = { ...running, candidates: [{ id: "c2" }] }
    mocks.findWithCandidates
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(reloaded)
    mocks.upsertVote.mockRejectedValue(
      fkError("PollVote_candidateId_PollCandidate_id_fkey"),
    )
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      rejected: "candidateNotFound",
      poll: reloaded,
    })
  })

  test("candidate FK violation with the poll gone becomes pollNotFound", async () => {
    mocks.findWithCandidates
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(undefined)
    mocks.upsertVote.mockRejectedValue(
      fkError("PollVote_candidateId_PollCandidate_id_fkey"),
    )
    await expect(pollVoteService.castVote(input)).resolves.toEqual({
      rejected: "pollNotFound",
    })
  })

  test("other FK violations (e.g. a deleted contact) propagate", async () => {
    const error = fkError("PollVote_contactId_Contact_id_fkey")
    mocks.upsertVote.mockRejectedValue(error)
    await expect(pollVoteService.castVote(input)).rejects.toBe(error)
  })

  test("other upsert errors propagate", async () => {
    mocks.upsertVote.mockRejectedValue(new Error("boom"))
    await expect(pollVoteService.castVote(input)).rejects.toThrow("boom")
  })
})
