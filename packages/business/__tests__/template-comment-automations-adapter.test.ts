// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  listAutomationAccounts: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/schema", () => ({
  commentAutomationModel: { table: "commentAutomation" },
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "new-automation" }))
vi.mock("../src/comment-automation/account-scope", () => ({
  listAutomationAccounts: (...args: unknown[]) =>
    mocks.listAutomationAccounts(...args),
}))

const { commentAutomationsAdapter } = await import(
  "../src/template/adapters/comment-automations"
)

const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "src-auto",
  name: "Welcome comments",
  type: "messenger",
  isActive: true,
  startTime: null,
  endTime: null,
  post: { type: "all", value: [] },
  privateReply: { type: "none", value: null },
  publicReply: { type: "none", value: null },
  includeKeywords: { type: "all", keywords: [] },
  excludeKeywords: [],
  options: {},
  hideComments: {},
  replyAfter: {},
  folderId: null,
  inboxSourceId: null,
  ...overrides,
})

const install = async (
  entryOverrides: Record<string, unknown>,
  idMaps: Record<string, Map<string, string>> = {},
) => {
  const warnings: { entityKind: string }[] = []
  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.insertValues(values)
        return { returning: () => Promise.resolve([{ id: "created" }]) }
      },
    }),
  }
  await commentAutomationsAdapter.insert(
    {
      tx,
      workspaceId: "ws-1",
      installationId: "inst-1",
      idMaps,
      track: vi.fn(),
      warn: (warning: { entityKind: string }) => warnings.push(warning),
    } as never,
    [entry(entryOverrides)],
  )
  return { inserted: mocks.insertValues.mock.calls[0]?.[0], warnings }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAutomationAccounts.mockResolvedValue([
    { inboxId: "tgt-1", name: "My page" },
  ])
})

describe("comment automations adapter: inbox scope and posts", () => {
  test("an automation that was never scoped stays unscoped and active", async () => {
    const { inserted, warnings } = await install({})

    expect(inserted).toMatchObject({ inboxId: null, isActive: true })
    expect(warnings).toEqual([])
    expect(mocks.listAutomationAccounts).not.toHaveBeenCalled()
  })

  test("a bound inbox that is an account of the automation's channel scopes it and keeps it active", async () => {
    const { inserted, warnings } = await install(
      { inboxSourceId: "src-inbox" },
      { inbox: new Map([["src-inbox", "tgt-1"]]) },
    )

    expect(inserted).toMatchObject({ inboxId: "tgt-1", isActive: true })
    expect(warnings).toEqual([])
    expect(mocks.listAutomationAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", type: "messenger" }),
    )
  })

  test("a scoped automation with no bound inbox installs inactive, not widened to every account", async () => {
    const { inserted, warnings } = await install({
      inboxSourceId: "src-inbox",
    })

    expect(inserted).toMatchObject({ inboxId: null, isActive: false })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "inboxBindingRequired" }),
    ])
  })

  test("a bound inbox that is not an account of this automation's channel is treated as unbound", async () => {
    // e.g. a Facebook-login Instagram account for an Instagram-login automation
    mocks.listAutomationAccounts.mockResolvedValue([])

    const { inserted, warnings } = await install(
      { inboxSourceId: "src-inbox", type: "instagram" },
      { inbox: new Map([["src-inbox", "tgt-1"]]) },
    )

    expect(inserted).toMatchObject({ inboxId: null, isActive: false })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "inboxBindingRequired" }),
    ])
  })

  test("a chosen-posts automation loses the source's post ids and installs inactive", async () => {
    const { inserted, warnings } = await install({
      post: { type: "postIds", value: ["123_456", "123_789"] },
    })

    expect(inserted).toMatchObject({
      post: { type: "postIds", value: [] },
      isActive: false,
    })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "postSelectionRequired" }),
    ])
  })

  test("AI moderation on an AI Router connection installs off, without the source's connection", async () => {
    const hideComments = {
      all: false,
      hasPhoneNumber: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      keywords: [],
      showCommentsAfter: "none" as const,
      aiModeration: {
        enabled: true,
        engine: "decision" as const,
        aiAgentId: null,
        decisionConnectionId: "source-connection",
        decisionModel: "jev-1.13.0",
        categories: ["hate" as const],
        action: "hide" as const,
      },
    }

    const { inserted, warnings } = await install({ hideComments })

    expect(inserted).toMatchObject({
      hideComments: {
        aiModeration: {
          enabled: false,
          engine: "decision",
          decisionConnectionId: null,
          decisionModel: "jev-1.13.0",
        },
      },
    })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "credentialRequired" }),
    ])
  })

  const agentModeration = (aiAgentId: string) => ({
    all: false,
    hasPhoneNumber: false,
    hasImage: false,
    hasVideo: false,
    hasLink: false,
    hasKeywords: false,
    keywords: [],
    showCommentsAfter: "none" as const,
    aiModeration: {
      enabled: true,
      engine: "aiAgent" as const,
      aiAgentId,
      categories: ["hate" as const],
      action: "hide" as const,
    },
  })

  test("AI moderation on an AI agent is remapped to the copied agent", async () => {
    const { inserted, warnings } = await install(
      { hideComments: agentModeration("src-agent") },
      { aiAgent: new Map([["src-agent", "tgt-agent"]]) },
    )

    expect(inserted).toMatchObject({
      hideComments: { aiModeration: { enabled: true, aiAgentId: "tgt-agent" } },
    })
    expect(warnings).toEqual([])
  })

  test("AI moderation whose agent did not come along installs off, never with the source's agent id", async () => {
    const { inserted, warnings } = await install({
      hideComments: agentModeration("src-agent"),
    })

    expect(inserted).toMatchObject({
      hideComments: { aiModeration: { enabled: false, aiAgentId: null } },
    })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "aiAgent" }),
    ])
  })

  test("an automation covering all posts keeps its post setting", async () => {
    const { inserted } = await install({
      post: { type: "published", value: [] },
    })

    expect(inserted).toMatchObject({
      post: { type: "published", value: [] },
      isActive: true,
    })
  })

  test("a hashtag automation keeps its hashtags and stays on", async () => {
    const { inserted, warnings } = await install({
      post: { type: "hashtags", value: ["vip", "sale"] },
    })

    expect(inserted).toMatchObject({
      post: { type: "hashtags", value: ["vip", "sale"] },
      isActive: true,
    })
    expect(warnings).toEqual([])
  })

  test("an automation that was switched off stays off even when fully bound", async () => {
    const { inserted } = await install(
      { isActive: false, inboxSourceId: "src-inbox" },
      { inbox: new Map([["src-inbox", "tgt-1"]]) },
    )

    expect(inserted).toMatchObject({ inboxId: "tgt-1", isActive: false })
  })
})

describe("comment automations adapter: collection", () => {
  test("the AI agent that moderates comments ships with the automation", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    const row = {
      ...entry(),
      id: "src-auto",
      folderId: null,
      inboxId: null,
      hideComments: {
        aiModeration: {
          enabled: true,
          engine: "aiAgent",
          aiAgentId: "agent-1",
        },
      },
    }
    ;(db as unknown as { query: unknown }).query = {
      commentAutomationModel: { findMany: () => Promise.resolve([row]) },
    }

    const collected = await commentAutomationsAdapter.collector.collect(
      "ws-1",
      ["src-auto"],
    )

    expect(collected.hardDependencies).toContainEqual({
      category: "aiAgents",
      sourceId: "agent-1",
    })
  })
})
