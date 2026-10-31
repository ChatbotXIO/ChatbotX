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

const { templateService } = await import("@chatbotx.io/business")

type ListInput = Omit<
  Parameters<typeof templateService.listSelectableResources>[0],
  "actor"
>

const listSelectableResources = (input: ListInput) =>
  templateService.listSelectableResources({
    ...input,
    actor: { kind: "member", permissions: { superAdmin: true } },
  })

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

const NUMERIC_CURSOR = /^\d+$/

describe("listSelectableResources — pagination math", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("issues an opaque keyset cursor from the last row when more rows remain", async () => {
    mockListFlows.mockResolvedValue({
      rows: [{ id: "10", name: "Flow 1" }],
      total: 150,
      hasMore: true,
      lastKey: "Flow 1",
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "flows",
      limit: 100,
    })

    expect(result.nextCursor).toBeTruthy()
    expect(result.nextCursor).not.toMatch(NUMERIC_CURSOR)
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

  test("a legacy numeric cursor still resolves to an offset", async () => {
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

describe("listSelectableResources — settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Search, ordering and paging run in SQL; the real-database coverage lives in
  // packages/business/__tests__/integration/template-selectable-resources-db.test.ts.
  test("delegates settings to the repository with the decoded keyset", async () => {
    mockListSettings.mockResolvedValue({
      rows: [{ id: "1", name: "alpha" }],
      total: 1,
      allIds: ["1"],
      hasMore: false,
    })

    const result = await listSelectableResources({
      workspaceId: WS,
      category: "settings",
      keyword: "hello",
      limit: 2,
    })

    expect(mockListSettings).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "hello", limit: 2, offset: 0 }),
    )
    expect(result).toEqual({
      items: [{ id: "1", name: "alpha" }],
      total: 1,
      allIds: ["1"],
      nextCursor: null,
    })
  })
})

describe("listSelectableResources — authorization", () => {
  test("rejects a member without the flows permission", async () => {
    await expect(
      templateService.listSelectableResources({
        workspaceId: WS,
        category: "flows",
        actor: { kind: "member", permissions: { ecommerce: true } },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mockListFlows).not.toHaveBeenCalled()
  })

  test("rejects a category the member lacks the permission for", async () => {
    await expect(
      templateService.listSelectableResources({
        workspaceId: WS,
        category: "products",
        actor: { kind: "member", permissions: { flows: true } },
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })
})
