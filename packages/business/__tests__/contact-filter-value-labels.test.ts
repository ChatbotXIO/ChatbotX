import { beforeEach, describe, expect, test, vi } from "vitest"

const resolvers = vi.hoisted(() => ({
  findManyByIds: vi.fn(),
  sequences: vi.fn(),
  broadcasts: vi.fn(),
  reflinks: vi.fn(),
  inboxes: vi.fn(),
  members: vi.fn(),
  inboxTeams: vi.fn(),
  flows: vi.fn(),
  flowNodes: vi.fn(),
  keywords: vi.fn(),
  whatsappFlows: vi.fn(),
  emailTopics: vi.fn(),
  pipelines: vi.fn(),
  pipelineStages: vi.fn(),
  listKeywordOptions: vi.fn(),
  listWhatsappFlows: vi.fn(),
  listEmailTopics: vi.fn(),
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
vi.mock("../src/flow/service", () => ({
  flowService: {
    listLabelsByIds: resolvers.flows,
    listNodeLabelsByIds: resolvers.flowNodes,
  },
}))
vi.mock("../src/automated-response/service", () => ({
  automatedResponseService: {
    listKeywordOptions: resolvers.listKeywordOptions,
    listKeywordLabelsByIds: resolvers.keywords,
  },
}))
vi.mock("../src/whatsapp-flow/service", () => ({
  whatsappFlowService: {
    list: resolvers.listWhatsappFlows,
    listLabelsByIds: resolvers.whatsappFlows,
  },
}))
vi.mock("../src/pipeline/service", () => ({
  pipelineService: {
    listLabelsByIds: resolvers.pipelines,
    listStageLabelsByIds: resolvers.pipelineStages,
  },
}))
vi.mock("../src/email-topic/service", () => ({
  emailTopicService: {
    list: resolvers.listEmailTopics,
    listLabelsByIds: resolvers.emailTopics,
  },
}))

const { listContactActivityValueOptions, resolveContactFilterValueLabels } =
  await import("../src/contact/filter-value-labels")

const MEMBER_SCOPE = {
  kind: "member",
  workspaceMemberId: "m1",
  isWorkspaceAdmin: false,
  canViewContactEmailAndPhone: true,
} as const

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
      resolvers.flows,
      resolvers.flowNodes,
      resolvers.keywords,
      resolvers.whatsappFlows,
      resolvers.emailTopics,
      resolvers.pipelines,
      resolvers.pipelineStages,
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
      pipelineScope: MEMBER_SCOPE,
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
      pipelineScope: MEMBER_SCOPE,
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
      flows: [],
      flowNodes: [],
      keywords: [],
      whatsappFlows: [],
      emailTopics: [],
      pipelines: [],
      pipelineStages: [],
    })
    expect(resolvers.sequences).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: [],
    })
  })

  test("routes pipeline and stage ids to their own resolvers", async () => {
    resolvers.pipelines.mockResolvedValue([{ id: "p1", name: "Sales" }])
    resolvers.pipelineStages.mockResolvedValue([{ id: "s1", name: "Lead" }])

    const labels = await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      pipelineScope: MEMBER_SCOPE,
      ids: { pipelines: ["p1", "p1"], pipelineStages: ["s1", "s-deleted"] },
    })

    // Pipeline names are ACL data: the caller's scope reaches both lookups.
    expect(resolvers.pipelines).toHaveBeenCalledWith({
      scope: MEMBER_SCOPE,
      workspaceId: "ws-1",
      ids: ["p1"],
    })
    expect(resolvers.pipelineStages).toHaveBeenCalledWith({
      scope: MEMBER_SCOPE,
      workspaceId: "ws-1",
      ids: ["s1", "s-deleted"],
    })
    expect(labels.pipelines).toEqual([{ id: "p1", name: "Sales" }])
    expect(labels.pipelineStages).toEqual([{ id: "s1", name: "Lead" }])
  })

  test("de-duplicates ids before looking them up", async () => {
    await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      pipelineScope: MEMBER_SCOPE,
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
      pipelineScope: MEMBER_SCOPE,
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

describe("resolveContactFilterValueLabels for activity-backed fields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const resolver of [
      resolvers.findManyByIds,
      resolvers.sequences,
      resolvers.broadcasts,
      resolvers.reflinks,
      resolvers.inboxes,
      resolvers.members,
      resolvers.inboxTeams,
      resolvers.flows,
      resolvers.flowNodes,
      resolvers.keywords,
      resolvers.whatsappFlows,
      resolvers.emailTopics,
      resolvers.pipelines,
      resolvers.pipelineStages,
    ]) {
      resolver.mockResolvedValue([])
    }
  })

  test("routes flows, nodes, keywords, WhatsApp flows and email topics to their resolvers", async () => {
    resolvers.flowNodes.mockResolvedValue([
      { id: "7:9", name: "Flow A · Welcome" },
    ])

    const labels = await resolveContactFilterValueLabels({
      workspaceId: "ws-1",
      pipelineScope: MEMBER_SCOPE,
      ids: {
        flows: ["7"],
        flowNodes: ["7:9", "7:9"],
        keywords: ["4"],
        whatsappFlows: ["5"],
        emailTopics: ["12"],
      },
    })

    expect(resolvers.flows).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["7"],
    })
    expect(resolvers.flowNodes).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["7:9"],
    })
    expect(resolvers.keywords).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["4"],
    })
    expect(resolvers.whatsappFlows).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["5"],
    })
    expect(resolvers.emailTopics).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["12"],
    })
    expect(labels.flowNodes).toEqual([{ id: "7:9", name: "Flow A · Welcome" }])
  })
})

describe("listContactActivityValueOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("keywords: lists contact rules by their keywords, searched on the server", async () => {
    resolvers.listKeywordOptions.mockResolvedValue([
      { id: "4", keywords: ["hi", "hello"] },
      { id: "5", keywords: ["bye"] },
    ])

    const options = await listContactActivityValueOptions({
      workspaceId: "ws-1",
      source: "keywords",
      search: "  hi ",
    })

    expect(resolvers.listKeywordOptions).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      search: "hi",
      limit: 50,
    })
    expect(options).toEqual([
      { value: "4", label: "hi, hello" },
      { value: "5", label: "bye" },
    ])
  })

  test("keywords: no search means no keyword filter", async () => {
    resolvers.listKeywordOptions.mockResolvedValue([])

    await listContactActivityValueOptions({
      workspaceId: "ws-1",
      source: "keywords",
    })

    expect(resolvers.listKeywordOptions.mock.calls[0]?.[0].search).toBe("")
  })

  test("WhatsApp flows: bounded, name-filtered and workspace-scoped", async () => {
    resolvers.listWhatsappFlows.mockResolvedValue([
      { id: "5", name: "Lead form" },
    ])

    const options = await listContactActivityValueOptions({
      workspaceId: "ws-1",
      source: "whatsappFlows",
      search: "lead",
    })

    expect(resolvers.listWhatsappFlows).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", name: "lead" },
      limit: 50,
    })
    expect(options).toEqual([{ value: "5", label: "Lead form" }])
  })

  test("email topics: bounded and name-filtered", async () => {
    resolvers.listEmailTopics.mockResolvedValue({
      data: [{ id: "12", name: "Newsletter" }],
      pageCount: 1,
    })

    const options = await listContactActivityValueOptions({
      workspaceId: "ws-1",
      source: "emailTopics",
      search: "news",
    })

    expect(resolvers.listEmailTopics).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "news",
      page: 1,
      perPage: 50,
    })
    expect(options).toEqual([{ value: "12", label: "Newsletter" }])
  })

  test("a failing lookup rejects instead of looking like an empty list", async () => {
    resolvers.listEmailTopics.mockRejectedValue(new Error("db down"))

    await expect(
      listContactActivityValueOptions({
        workspaceId: "ws-1",
        source: "emailTopics",
      }),
    ).rejects.toThrow("db down")
  })
})
