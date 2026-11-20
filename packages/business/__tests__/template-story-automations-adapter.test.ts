// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertInTx: vi.fn(),
  listAutomationAccounts: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { igStoryAutomationModel: { findMany: mocks.findMany } } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({ igStoryAutomationModel: {} }))
vi.mock("../src/comment-automation/account-scope", () => ({
  listAutomationAccounts: (...args: unknown[]) =>
    mocks.listAutomationAccounts(...args),
}))
vi.mock("../src/ig-story-automation/service", () => ({
  igStoryAutomationService: {
    insertInTx: (...args: unknown[]) => mocks.insertInTx(...args),
  },
}))

const { STORY_AUTOMATION_COLUMNS, storyAutomationsAdapter } = await import(
  "../src/template/adapters/story-automations"
)

const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "src-story",
  name: "Story replies",
  type: "instagram",
  trigger: "storyReply",
  isActive: true,
  startTime: null,
  endTime: null,
  story: { type: "all", value: [] },
  reply: { type: "text", value: "Thanks!" },
  includeKeywords: { type: "all", value: [] },
  folderId: null,
  inboxSourceId: "src-inbox",
  ...overrides,
})

const BOUND = { inbox: new Map([["src-inbox", "tgt-inbox"]]) }

const install = async (
  entryOverrides: Record<string, unknown>,
  idMaps: Record<string, Map<string, string>> = BOUND,
) => {
  const warnings: { entityKind: string; path: string }[] = []
  const tracked: unknown[] = []
  await storyAutomationsAdapter.insert(
    {
      tx: { tag: "tx" },
      workspaceId: "ws-1",
      installationId: "inst-1",
      idMaps,
      track: (row: unknown) => tracked.push(row),
      warn: (warning: { entityKind: string; path: string }) =>
        warnings.push(warning),
    } as never,
    [entry(entryOverrides)] as never,
  )
  const call = mocks.insertInTx.mock.calls[0]
  return {
    tx: call?.[0],
    input: call?.[1] as {
      workspaceId: string
      type: string
      trigger: string
      data: Record<string, unknown>
    },
    warnings,
    tracked,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertInTx.mockResolvedValue({ id: "created" })
  mocks.listAutomationAccounts.mockResolvedValue([
    { inboxId: "tgt-inbox", name: "My account" },
  ])
})

describe("story automations adapter: install", () => {
  test("a bound account of the automation's type scopes it and keeps it active", async () => {
    const { tx, input, warnings, tracked } = await install({})

    expect(tx).toEqual({ tag: "tx" })
    expect(input).toMatchObject({
      workspaceId: "ws-1",
      type: "instagram",
      trigger: "storyReply",
      data: { inboxId: "tgt-inbox", isActive: true, name: "Story replies" },
    })
    expect(warnings).toEqual([])
    expect(mocks.listAutomationAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", type: "instagram" }),
    )
    expect(tracked).toEqual([
      expect.objectContaining({
        category: "storyAutomations",
        resourceKind: "storyAutomation",
        resourceId: "created",
        sourceResourceId: "src-story",
      }),
    ])
  })

  test("a scoped automation with no bound inbox installs unscoped-by-id, off, never widened", async () => {
    const { input, warnings } = await install({}, {})

    expect(input.data).toMatchObject({ inboxId: null, isActive: false })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "inboxBindingRequired" }),
    ])
  })

  test("a bound inbox that is not an account of this connection type is treated as unbound", async () => {
    mocks.listAutomationAccounts.mockResolvedValue([])

    const { input, warnings } = await install({ type: "instagramFacebook" })

    expect(input.data).toMatchObject({ inboxId: null, isActive: false })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "inboxBindingRequired" }),
    ])
    expect(mocks.listAutomationAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ type: "instagramFacebook" }),
    )
  })

  test("an automation for every account stays so but installs off", async () => {
    const { input, warnings } = await install({ inboxSourceId: null })

    expect(input.data).toMatchObject({ inboxId: null, isActive: false })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "inboxBindingRequired" }),
    ])
    expect(mocks.listAutomationAccounts).not.toHaveBeenCalled()
  })

  test("an every-account automation that was off is not nagged about", async () => {
    const { input, warnings } = await install({
      inboxSourceId: null,
      isActive: false,
    })

    expect(input.data).toMatchObject({ inboxId: null, isActive: false })
    expect(warnings).toEqual([])
  })

  test("a story selection (ids already cleared at collect) installs off and asks for the stories", async () => {
    const { input, warnings } = await install({
      story: { type: "storyIds", value: [] },
    })

    expect(input.data).toMatchObject({
      story: { type: "storyIds", value: [] },
      isActive: false,
      inboxId: "tgt-inbox",
    })
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "storySelectionRequired" }),
    ])
  })

  test("a flow reply is re-pointed at the copy", async () => {
    const { input, warnings } = await install(
      { reply: { type: "flow", value: "src-flow" } },
      { ...BOUND, flow: new Map([["src-flow", "tgt-flow"]]) },
    )

    expect(input.data).toMatchObject({
      reply: { type: "flow", value: "tgt-flow" },
      isActive: true,
    })
    expect(warnings).toEqual([])
  })

  test("an AI agent reply is re-pointed at the copy", async () => {
    const { input } = await install(
      { reply: { type: "AIAgent", value: "src-agent" } },
      { ...BOUND, aiAgent: new Map([["src-agent", "tgt-agent"]]) },
    )

    expect(input.data).toMatchObject({
      reply: { type: "AIAgent", value: "tgt-agent" },
      isActive: true,
    })
  })

  test("a reply whose flow did not come along is cleared, warned, and the automation is off", async () => {
    const { input, warnings } = await install({
      reply: { type: "flow", value: "src-flow" },
    })

    expect(input.data).toMatchObject({
      reply: { type: "flow", value: null },
      isActive: false,
    })
    expect(warnings).toEqual([expect.objectContaining({ entityKind: "flow" })])
  })

  test("a text reply and a 'none' reply pass through", async () => {
    const text = await install({})
    expect(text.input.data.reply).toEqual({ type: "text", value: "Thanks!" })

    vi.clearAllMocks()
    mocks.insertInTx.mockResolvedValue({ id: "created" })
    mocks.listAutomationAccounts.mockResolvedValue([
      { inboxId: "tgt-inbox", name: "My account" },
    ])
    const none = await install({ reply: { type: "none", value: null } })
    expect(none.input.data.reply).toEqual({ type: "none", value: null })
    expect(none.input.data.isActive).toBe(true)
  })

  test("a story-mention automation passes its trigger so the service pins the filters", async () => {
    const { input, warnings } = await install({
      trigger: "storyMention",
      includeKeywords: { type: "contain", value: ["hi"] },
    })

    expect(input.trigger).toBe("storyMention")
    expect(input.data).toMatchObject({
      story: { type: "all", value: [] },
      includeKeywords: { type: "contain", value: ["hi"] },
      isActive: true,
    })
    expect(warnings).toEqual([])
  })

  test("the schedule is copied as it is", async () => {
    const { input } = await install({
      startTime: "2099-01-01T00:00:00.000Z",
      endTime: "2099-02-01T00:00:00.000Z",
    })

    expect(input.data).toMatchObject({
      startTime: "2099-01-01T00:00:00.000Z",
      endTime: "2099-02-01T00:00:00.000Z",
    })
  })

  test("a folder is resolved through the folder map", async () => {
    const { input } = await install(
      { folderId: "src-folder" },
      { ...BOUND, folder: new Map([["src-folder", "tgt-folder"]]) },
    )

    expect(input.data.folderId).toBe("tgt-folder")
  })
})

describe("story automations adapter: collect", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "1",
    name: "Story replies",
    type: "instagram",
    trigger: "storyReply",
    isActive: true,
    startTime: null,
    endTime: null,
    repliesCount: 42,
    story: { type: "storyIds", value: ["story-1", "story-2"] },
    reply: { type: "flow", value: "10" },
    includeKeywords: { type: "all", value: [] },
    folderId: "5",
    inboxId: "7",
    ...overrides,
  })

  test("ships the configuration, never the story ids or the counter, and reports what it needs", async () => {
    mocks.findMany.mockResolvedValue([row()])

    const result = await storyAutomationsAdapter.collector.collect("ws-1", [
      "1",
    ])

    expect(result.entries).toEqual([
      {
        sourceId: "1",
        name: "Story replies",
        type: "instagram",
        trigger: "storyReply",
        isActive: true,
        startTime: null,
        endTime: null,
        story: { type: "storyIds", value: [] },
        reply: { type: "flow", value: "10" },
        includeKeywords: { type: "all", value: [] },
        folderId: "5",
        inboxSourceId: "7",
      },
    ])
    expect(result.folderIds).toEqual(["5"])
    expect(result.inboxIds).toEqual(["7"])
    expect(result.hardDependencies).toEqual([
      { category: "flows", sourceId: "10" },
    ])
  })

  test("an AI agent reply is a hard dependency on the agents", async () => {
    mocks.findMany.mockResolvedValue([
      row({
        story: { type: "all", value: [] },
        reply: { type: "AIAgent", value: "11" },
      }),
    ])

    const result = await storyAutomationsAdapter.collector.collect("ws-1", [
      "1",
    ])

    expect(result.hardDependencies).toEqual([
      { category: "aiAgents", sourceId: "11" },
    ])
    expect(result.entries[0]).toMatchObject({
      story: { type: "all", value: [] },
    })
  })
})

describe("story automations adapter: column classification", () => {
  test("repliesCount is reset and the account is re-bound; story ids never copy as they are", () => {
    expect(STORY_AUTOMATION_COLUMNS.repliesCount).toBe("reset")
    expect(STORY_AUTOMATION_COLUMNS.inboxId).toBe("rebind")
    expect(STORY_AUTOMATION_COLUMNS.reply).toBe("reference")
    expect(STORY_AUTOMATION_COLUMNS.story).not.toBe("copy")
  })
})
