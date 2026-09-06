// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListFlows, mockListTags, mockListKeywords, mockListSettings } =
  vi.hoisted(() => ({
    mockListFlows: vi.fn(),
    mockListTags: vi.fn(),
    mockListKeywords: vi.fn(),
    mockListSettings: vi.fn(),
  }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateSelectableResourceRepository: {
    listFlows: mockListFlows,
    listTags: mockListTags,
    listCustomFields: vi.fn(),
    listProducts: vi.fn(),
    listAIFunctions: vi.fn(),
    listAIAgents: vi.fn(),
    listCalendars: vi.fn(),
    listWebchats: vi.fn(),
    listTriggers: vi.fn(),
    listFbCommentAutomations: vi.fn(),
    listKeywords: mockListKeywords,
    listEntryPointLinks: vi.fn(),
    listSettings: mockListSettings,
  },
}))

const { listSelectableResources } = await import(
  "../src/features/templates/queries/list-selectable-resources"
)

const WS = "ws-1"

describe("listSelectableResources — switch dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("dispatches 'flows' to templateSelectableResourceRepository.listFlows", async () => {
    mockListFlows.mockResolvedValue({
      rows: [{ id: "flow-1", name: "Flow 1" }],
      total: 1,
      allIds: ["flow-1"],
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "flows",
    })

    expect(mockListFlows).toHaveBeenCalledWith({
      workspaceId: WS,
      keyword: undefined,
      offset: 0,
      limit: 100,
    })
    expect(result.items).toEqual([{ id: "flow-1", name: "Flow 1" }])
    expect(result.total).toBe(1)
    expect(result.allIds).toEqual(["flow-1"])
  })

  test("dispatches 'tags' to templateSelectableResourceRepository.listTags", async () => {
    mockListTags.mockResolvedValue({ rows: [], total: 0 })

    await listSelectableResources({ workspaceId: WS, category: "tags" })

    expect(mockListTags).toHaveBeenCalled()
  })

  test("returns an empty result for an unknown category", async () => {
    const result = await listSelectableResources({
      workspaceId: WS,
      category: "unknownCategory" as never,
    })

    expect(result).toEqual({ items: [], nextCursor: null, total: 0 })
  })
})

describe("listSelectableResources — pagination math", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("computes nextCursor as offset + limit when more rows remain", async () => {
    mockListFlows.mockResolvedValue({
      rows: [{ id: "flow-1", name: "Flow 1" }],
      total: 150,
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "flows",
      limit: 100,
    })

    expect(result.nextCursor).toBe("100")
  })

  test("returns null nextCursor when the page reaches the total", async () => {
    mockListFlows.mockResolvedValue({
      rows: [{ id: "flow-1", name: "Flow 1" }],
      total: 1,
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "flows",
    })

    expect(result.nextCursor).toBeNull()
  })

  test("parses the cursor into an offset for the next page", async () => {
    mockListFlows.mockResolvedValue({ rows: [], total: 0 })

    await listSelectableResources({
      workspaceId: WS,
      category: "flows",
      cursor: "100",
    })

    expect(mockListFlows).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 100 }),
    )
  })

  test("uses the custom limit when provided", async () => {
    mockListFlows.mockResolvedValue({ rows: [], total: 0 })

    await listSelectableResources({
      workspaceId: WS,
      category: "flows",
      limit: 25,
    })

    expect(mockListFlows).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    )
  })
})

describe("listSelectableResources — allIds passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("passes through allIds when the repository includes them", async () => {
    mockListFlows.mockResolvedValue({
      rows: [{ id: "flow-1", name: "Flow 1" }],
      total: 1,
      allIds: ["flow-1"],
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "flows",
    })

    expect(result.allIds).toEqual(["flow-1"])
  })

  test("omits allIds when the repository does not include them (offset > 0 or over the cap)", async () => {
    mockListFlows.mockResolvedValue({
      rows: [{ id: "flow-1", name: "Flow 1" }],
      total: 2000,
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "flows",
      cursor: "100",
    })

    expect(result.allIds).toBeUndefined()
  })
})

describe("listSelectableResources — keywords toLabel fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("the repository's projected 'name' already carries the toLabel fallback for keywords", async () => {
    mockListKeywords.mockResolvedValue({
      rows: [
        { id: "kw-1", name: "hello" },
        { id: "kw-2", name: "bye, later" },
        { id: "kw-3", name: "(untitled)" },
      ],
      total: 3,
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "keywords",
    })

    expect(result.items).toEqual([
      { id: "kw-1", name: "hello" },
      { id: "kw-2", name: "bye, later" },
      { id: "kw-3", name: "(untitled)" },
    ])
  })
})

describe("listSelectableResources — settings merge/sort/paginate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("merges saved replies and bot fields, sorts by name, and paginates in memory", async () => {
    mockListSettings.mockResolvedValue({
      savedReplies: [
        { id: "sr-1", shortcut: "zeta" },
        { id: "sr-2", shortcut: "alpha" },
      ],
      botFields: [{ id: "bf-1", name: "middle" }],
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "settings",
      limit: 2,
    })

    expect(result.items).toEqual([
      { id: "sr-2", name: "alpha" },
      { id: "bf-1", name: "middle" },
    ])
    expect(result.total).toBe(3)
    expect(result.nextCursor).toBe("2")
  })

  test("filters settings by keyword case-insensitively", async () => {
    mockListSettings.mockResolvedValue({
      savedReplies: [{ id: "sr-1", shortcut: "Hello World" }],
      botFields: [{ id: "bf-1", name: "Age" }],
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "settings",
      keyword: "hello",
    })

    expect(result.items).toEqual([{ id: "sr-1", name: "Hello World" }])
    expect(result.total).toBe(1)
  })

  test("returns allIds for settings when under the cap at offset 0", async () => {
    mockListSettings.mockResolvedValue({
      savedReplies: [{ id: "sr-1", shortcut: "alpha" }],
      botFields: [],
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "settings",
    })

    expect(result.allIds).toEqual(["sr-1"])
  })
})
