import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWithCandidates: vi.fn(),
  insertWithCandidates: vi.fn(),
  update: vi.fn(),
  updateCandidate: vi.fn(),
  insertCandidates: vi.fn(),
  deleteCandidates: vi.fn(),
  deleteMany: vi.fn(),
  voteCounts: vi.fn(),
  existsInWorkspace: vi.fn(),
  tx: { __tx: true },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mocks.tx)),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  pollRepository: {
    findWithCandidates: mocks.findWithCandidates,
    insertWithCandidates: mocks.insertWithCandidates,
    update: mocks.update,
    updateCandidate: mocks.updateCandidate,
    insertCandidates: mocks.insertCandidates,
    deleteCandidates: mocks.deleteCandidates,
    deleteMany: mocks.deleteMany,
    voteCounts: mocks.voteCounts,
  },
  flowRepository: { existsInWorkspace: mocks.existsInWorkspace },
}))

const { pollService } = await import("../src/poll/service")

const base = {
  workspaceId: "w1",
  name: "Poll",
  imageUrl: "https://x/y.png",
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: new Date("2026-01-02T00:00:00Z"),
}
const cands = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `c${i}` }))

describe("pollService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsInWorkspace.mockResolvedValue(true)
    mocks.insertWithCandidates.mockImplementation(async (i) => ({
      id: "p1",
      ...i,
    }))
  })

  test("rejects 1 candidate", async () => {
    await expect(
      pollService.create({ ...base, candidates: cands(1) }),
    ).rejects.toMatchObject({ code: "pollCandidateCount" })
  })

  test("rejects 11 candidates", async () => {
    await expect(
      pollService.create({ ...base, candidates: cands(11) }),
    ).rejects.toMatchObject({ code: "pollCandidateCount" })
  })

  test("rejects endsAt === startsAt", async () => {
    await expect(
      pollService.create({
        ...base,
        endsAt: base.startsAt,
        candidates: cands(2),
      }),
    ).rejects.toMatchObject({ code: "pollInvalidDateRange" })
  })

  test("rejects an unknown afterVoteFlowId", async () => {
    mocks.existsInWorkspace.mockResolvedValue(false)
    await expect(
      pollService.create({
        ...base,
        afterVoteFlowId: "f9",
        candidates: cands(2),
      }),
    ).rejects.toMatchObject({ code: "pollFlowNotFound" })
  })

  test("create inserts poll with candidates", async () => {
    await pollService.create({ ...base, candidates: cands(2) })
    expect(mocks.insertWithCandidates).toHaveBeenCalledTimes(1)
  })

  test("create runs inside a transaction and passes the tx to the repository", async () => {
    await pollService.create({ ...base, candidates: cands(2) })
    expect(mocks.insertWithCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
      mocks.tx,
    )
  })

  describe("update", () => {
    const existing = {
      ...base,
      id: "p1",
      afterVoteFlowId: null,
      candidates: [
        { id: "c1", name: "a", position: 0 },
        { id: "c2", name: "b", position: 1 },
      ],
    }
    beforeEach(() => {
      mocks.findWithCandidates.mockResolvedValue(existing)
      mocks.update.mockResolvedValue(existing)
    })

    test("keeps c1, deletes c2, inserts the new one", async () => {
      await pollService.update({
        workspaceId: "w1",
        id: "p1",
        data: { candidates: [{ id: "c1", name: "a2" }, { name: "new" }] },
      })
      // The first read locks the poll row so concurrent edits serialize.
      expect(mocks.findWithCandidates).toHaveBeenNthCalledWith(
        1,
        { workspaceId: "w1", id: "p1", forUpdate: true },
        mocks.tx,
      )
      expect(mocks.deleteCandidates).toHaveBeenCalledWith(
        { workspaceId: "w1", pollId: "p1", ids: ["c2"] },
        mocks.tx,
      )
      expect(mocks.updateCandidate).toHaveBeenCalledTimes(1)
      expect(mocks.updateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c1", position: 0 }),
        mocks.tx,
      )
      expect(mocks.insertCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          candidates: [expect.objectContaining({ name: "new", position: 1 })],
        }),
        mocks.tx,
      )
    })

    test("ignores keys set to undefined (no empty .set())", async () => {
      await pollService.update({
        workspaceId: "w1",
        id: "p1",
        data: {
          name: undefined,
          startsAt: undefined,
          afterVoteFlowId: undefined,
        },
      })
      expect(mocks.update).not.toHaveBeenCalled()
    })

    test("passes only defined fields to the repository", async () => {
      await pollService.update({
        workspaceId: "w1",
        id: "p1",
        data: { name: "New", endsAt: undefined },
      })
      expect(mocks.update).toHaveBeenCalledWith(
        { workspaceId: "w1", id: "p1", data: { name: "New" } },
        mocks.tx,
      )
    })

    test("rejects a candidate id from another poll", async () => {
      await expect(
        pollService.update({
          workspaceId: "w1",
          id: "p1",
          data: { candidates: [{ id: "zzz", name: "a" }, { name: "b" }] },
        }),
      ).rejects.toMatchObject({ code: "pollCandidateNotInPoll" })
    })

    test("validates the merged date range", async () => {
      await expect(
        pollService.update({
          workspaceId: "w1",
          id: "p1",
          data: { endsAt: new Date("2025-01-01T00:00:00Z") },
        }),
      ).rejects.toMatchObject({ code: "pollInvalidDateRange" })
    })

    test("404 when the poll is missing", async () => {
      mocks.findWithCandidates.mockResolvedValue(undefined)
      await expect(
        pollService.update({ workspaceId: "w1", id: "nope", data: {} }),
      ).rejects.toMatchObject({ code: "notFound" })
    })
  })

  test("bulkDelete returns the deleted count", async () => {
    mocks.deleteMany.mockResolvedValue(2)
    await expect(
      pollService.bulkDelete({ workspaceId: "w1", ids: ["a", "b"] }),
    ).resolves.toEqual({ deleted: 2 })
  })

  test("findWithVoteCounts attaches each candidate's vote count", async () => {
    mocks.findWithCandidates.mockResolvedValue({
      ...base,
      id: "p1",
      candidates: [
        { id: "c1", name: "a", position: 0 },
        { id: "c2", name: "b", position: 1 },
      ],
    })
    mocks.voteCounts.mockResolvedValue([
      { candidateId: "c1", votes: 5 },
      { candidateId: "zz", votes: 9 },
    ])
    const poll = await pollService.findWithVoteCounts({
      workspaceId: "w1",
      id: "p1",
    })
    expect(poll.candidates.map((c) => [c.id, c.votesCount])).toEqual([
      ["c1", 5],
      ["c2", 0],
    ])
  })
})
