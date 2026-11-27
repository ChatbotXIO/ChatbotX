// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  resolveTenantSettings,
  listAllConnectedByWorkspace,
  pollRepository,
  flowRepository,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  resolveTenantSettings: vi.fn(),
  listAllConnectedByWorkspace: vi.fn(),
  pollRepository: {
    list: vi.fn(),
    findWithCandidates: vi.fn(),
    insertWithCandidates: vi.fn(),
    voteBreakdown: vi.fn(),
    voteCounts: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  flowRepository: { existsInWorkspace: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  resolveTenantSettings,
  inboxService: { listAllConnectedByWorkspace },
}))

// The real poll service runs against these repositories, so the candidate
// count rule and the response mapping are exercised end to end.
vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pollRepository,
  flowRepository,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("server-only", () => ({}))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { pollsPublicRouter } = await import("../src/features/polls/api/public")

const TOKEN = "cbx_ws_fixture"
const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})
const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const now = new Date("2026-01-01T00:00:00Z")
const poll = {
  id: "100",
  workspaceId: "ws-1",
  name: "Best cat",
  imageUrl: "https://x/y.png",
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: new Date("2099-01-01T00:00:00Z"),
  afterVoteFlowId: null,
  createdAt: now,
  updatedAt: now,
  candidates: [
    { id: "c1", position: 0, name: "Tom", description: null, imageUrl: null },
    { id: "c2", position: 1, name: "Kit", description: "d", imageUrl: null },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
  pollRepository.findWithCandidates.mockResolvedValue(poll)
  pollRepository.voteCounts.mockResolvedValue([])
})

describe("polls public API", () => {
  test("a token without the polls scope gets FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))
    await expect(invoke(pollsPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'polls' scope",
    })
    expect(pollRepository.list).not.toHaveBeenCalled()
  })

  test("a polls-scoped token can list, with ISO dates and votesCount", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["polls"]))
    pollRepository.list.mockResolvedValue({
      data: [{ ...poll, candidates: undefined, votesCount: 7 }],
      pageCount: 1,
    })
    const result = (await invoke(pollsPublicRouter.list)) as {
      data: Record<string, unknown>[]
    }
    expect(result.data[0]).toMatchObject({
      id: "100",
      votesCount: 7,
      startsAt: "2026-01-01T00:00:00.000Z",
      state: "running",
    })
  })

  test("create with 1 candidate is a 400 pollCandidateCount", async () => {
    await expect(
      invoke(pollsPublicRouter.create, {
        name: "P",
        imageUrl: "https://x/y.png",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-02-01T00:00:00Z",
        candidates: [{ name: "only" }],
      }),
    ).rejects.toMatchObject({ code: "pollCandidateCount", status: 400 })
    expect(pollRepository.insertWithCandidates).not.toHaveBeenCalled()
  })

  test("get attaches each candidate's votesCount", async () => {
    pollRepository.voteCounts.mockResolvedValue([
      { candidateId: "c1", votes: 3 },
    ])
    const result = (await invoke(pollsPublicRouter.get, { id: "100" })) as {
      candidates: { id: string; votesCount: number }[]
    }
    expect(result.candidates.map((c) => [c.id, c.votesCount])).toEqual([
      ["c1", 3],
      ["c2", 0],
    ])
  })

  test("getLinks keeps only ref-capable inboxes; WhatsApp carries /ref-pl_", async () => {
    resolveTenantSettings.mockResolvedValue({ appUrl: "https://app.test" })
    listAllConnectedByWorkspace.mockResolvedValue({
      data: [
        {
          id: "i1",
          workspaceId: "ws-1",
          channel: "whatsapp",
          name: "WA",
          sourceId: "s1",
          integrationWhatsapp: { displayPhoneNumber: "15551234567" },
        },
        {
          id: "i2",
          workspaceId: "ws-1",
          channel: "threads",
          name: "Th",
          sourceId: "s2",
        },
        {
          id: "i3",
          workspaceId: "ws-1",
          channel: "zalo",
          name: "Za",
          sourceId: "s3",
        },
      ],
    })
    const result = (await invoke(pollsPublicRouter.getLinks, {
      id: "100",
    })) as {
      omnichannelUrl: string
      links: { inboxId: string; url: string }[]
    }
    expect(result.omnichannelUrl).toBe("https://app.test/l/ws-1/p/100")
    expect(result.links.map((l) => l.inboxId)).toEqual(["i1"])
    expect(result.links[0]?.url).toContain("text=%2Fref-pl_")
  })

  test("getAnalytics returns totals, gender split and per-candidate shares", async () => {
    pollRepository.voteBreakdown.mockResolvedValue([
      { candidateId: "c1", gender: "male", votes: 3 },
      { candidateId: "c2", gender: "female", votes: 1 },
    ])
    const result = await invoke(pollsPublicRouter.getAnalytics, { id: "100" })
    expect(result).toMatchObject({
      poll: {
        id: poll.id,
        name: "Best cat",
        imageUrl: "https://x/y.png",
        startsAt: "2026-01-01T00:00:00.000Z",
      },
      totalVotes: 4,
      gender: { male: 3, female: 1, unknown: 0 },
      candidates: [
        { id: "c1", totalVotes: 3, totalPercent: 75, maleVotes: 3 },
        { id: "c2", totalVotes: 1, totalPercent: 25, femaleVotes: 1 },
      ],
    })
  })

  test("a read_only token cannot delete", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: { id: "t", permission: "read_only" as const, scopes: null },
    })
    await expect(
      invoke(pollsPublicRouter.delete, { id: "100" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(pollRepository.deleteMany).not.toHaveBeenCalled()
  })
})
