import { beforeEach, describe, expect, test, vi } from "vitest"

const resolvers = vi.hoisted(() => ({
  findManyByIds: vi.fn(),
  sequences: vi.fn(),
  broadcasts: vi.fn(),
  reflinks: vi.fn(),
  inboxes: vi.fn(),
  members: vi.fn(),
  inboxTeams: vi.fn(),
}))

vi.mock("../src/tag/service", () => ({
  tagService: { findManyByIds: resolvers.findManyByIds },
}))
vi.mock("../src/sequence/service", () => ({
  sequenceService: { listLabelsByIds: resolvers.sequences },
}))
vi.mock("../src/broadcast/service", () => ({
  broadcastService: { listLabelsByIds: resolvers.broadcasts },
}))
vi.mock("../src/reflink/service", () => ({
  reflinkService: { listLabelsByIds: resolvers.reflinks },
}))
vi.mock("../src/inbox/service", () => ({
  inboxService: { listLabelsByIds: resolvers.inboxes },
}))
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { listLabelsByUserIds: resolvers.members },
}))
vi.mock("../src/enterprise/inbox-team/service", () => ({
  inboxTeamService: { listLabelsByIds: resolvers.inboxTeams },
}))

const { resolveContactFilterValueLabels } = await import(
  "../src/contact/filter-value-labels"
)

describe("resolveContactFilterValueLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvers.findManyByIds.mockResolvedValue([])
    for (const resolver of [
      resolvers.sequences,
      resolvers.broadcasts,
      resolvers.reflinks,
      resolvers.inboxes,
      resolvers.members,
      resolvers.inboxTeams,
    ]) {
      resolver.mockResolvedValue([])
    }
  })

  test("routes each id type to its resolver within the workspace", async () => {
    resolvers.findManyByIds.mockResolvedValue([
      { id: "t1", name: "VIP", workspaceId: "ws-1" },
    ])
    resolvers.members.mockResolvedValue([{ id: "u1", name: "Alice" }])

    const labels = await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      ids: { tags: ["t1"], members: ["u1"], inboxTeams: ["team1"] },
    })

    expect(resolvers.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["t1"],
    })
    expect(resolvers.members).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userIds: ["u1"],
    })
    expect(resolvers.inboxTeams).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["team1"],
    })
    expect(labels.tags).toEqual([{ id: "t1", name: "VIP" }])
    expect(labels.members).toEqual([{ id: "u1", name: "Alice" }])
  })

  test("returns an empty list for every type that was not asked for", async () => {
    const labels = await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      ids: {},
    })

    expect(labels).toEqual({
      tags: [],
      sequences: [],
      broadcasts: [],
      reflinks: [],
      inboxes: [],
      members: [],
      inboxTeams: [],
    })
    expect(resolvers.sequences).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: [],
    })
  })

  test("de-duplicates ids before looking them up", async () => {
    await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      ids: { sequences: ["s1", "s1", "s2"] },
    })

    expect(resolvers.sequences).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["s1", "s2"],
    })
  })

  test("omits ids that no longer exist so the caller can flag them unknown", async () => {
    resolvers.broadcasts.mockResolvedValue([{ id: "b1", name: "Promo" }])

    const labels = await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      ids: { broadcasts: ["b1", "b-deleted"] },
    })

    expect(labels.broadcasts).toEqual([{ id: "b1", name: "Promo" }])
  })

  test("a failing lookup rejects instead of reporting every id as deleted", async () => {
    resolvers.inboxes.mockRejectedValue(new Error("db down"))

    await expect(
      resolveContactFilterValueLabels({
        workspaceId: "ws-1",
        ids: { inboxes: ["i1"] },
      }),
    ).rejects.toThrow("db down")
  })
})
