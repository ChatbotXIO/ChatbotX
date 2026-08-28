// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateFromImport,
  mockFlowModelFindMany,
  mockFindPublished,
  mockFindDraft,
} = vi.hoisted(() => ({
  mockCreateFromImport: vi.fn(),
  mockFlowModelFindMany: vi.fn(),
  mockFindPublished: vi.fn(),
  mockFindDraft: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { flowModel: { findMany: mockFlowModelFindMany } } },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowVersionModel: { table: "FlowVersion" },
}))

vi.mock("../src/flow", () => ({
  flowService: { createFromImport: mockCreateFromImport },
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: {
    findPublished: mockFindPublished,
    findDraft: mockFindDraft,
  },
}))

const { flowsAdapter } = await import("../src/template/adapters/flows")

const buildContext = (idMaps: Record<string, Map<string, string>> = {}) => ({
  tx: {} as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

const buildStep = (overrides: Record<string, unknown> = {}) => ({
  id: "s1",
  stepType: "setCustomField",
  operation: "O01",
  value: "42",
  ...overrides,
})

const buildFlowNode = (inputFieldId: string) => ({
  id: "1",
  data: {
    details: { steps: [buildStep({ inputFieldId })] },
  },
})

describe("flowsAdapter", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("declares botField as a consumed (non-deferred) kind", () => {
    expect(flowsAdapter.consumesKinds).toContain("botField")
    expect(flowsAdapter.deferredKinds).not.toContain("botField")
  })

  test("insert remaps a bot_field token against ctx.idMaps.botField", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    const ctx = buildContext({
      botField: new Map([["7", "77"]]),
    })

    await flowsAdapter.insert(ctx, [
      {
        sourceId: "src-flow",
        name: "Onboarding",
        active: true,
        enableInInbox: true,
        startNodeId: "1",
        nodes: [buildFlowNode("bot_field:7")],
        edges: [],
        folderId: null,
      },
    ])

    expect(mockCreateFromImport).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [buildFlowNode("bot_field:77")],
      }),
    )
  })

  test("insert leaves an unmapped bot_field token untouched and warns", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    const ctx = buildContext()

    await flowsAdapter.insert(ctx, [
      {
        sourceId: "src-flow",
        name: "Onboarding",
        active: true,
        enableInInbox: true,
        startNodeId: "1",
        nodes: [buildFlowNode("bot_field:999")],
        edges: [],
        folderId: null,
      },
    ])

    expect(mockCreateFromImport).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [buildFlowNode("bot_field:999")],
      }),
    )
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "botField",
        value: "999",
      }),
    )
  })

  describe("collect", () => {
    test("reports a referenced bot field as a settings-category hard dependency", async () => {
      mockFlowModelFindMany.mockResolvedValue([
        {
          id: "flow-1",
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
      ])
      mockFindPublished.mockResolvedValue({
        startNodeId: "1",
        nodes: [buildFlowNode("bot_field:7")],
        edges: [],
      })
      mockFindDraft.mockResolvedValue(undefined)

      const result = await flowsAdapter.collector.collect("ws-1", ["flow-1"])

      expect(result.hardDependencies).toEqual([
        { category: "settings", sourceId: "7" },
      ])
    })

    test("dedupes the same bot field referenced from multiple flows", async () => {
      mockFlowModelFindMany.mockResolvedValue([
        {
          id: "flow-1",
          name: "Flow A",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
        {
          id: "flow-2",
          name: "Flow B",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
      ])
      mockFindDraft.mockResolvedValue(undefined)
      mockFindPublished
        .mockResolvedValueOnce({
          startNodeId: "1",
          nodes: [buildFlowNode("bot_field:7")],
          edges: [],
        })
        .mockResolvedValueOnce({
          startNodeId: "1",
          nodes: [buildFlowNode("bot_field:7")],
          edges: [],
        })

      const result = await flowsAdapter.collector.collect("ws-1", [
        "flow-1",
        "flow-2",
      ])

      expect(result.hardDependencies).toEqual([
        { category: "settings", sourceId: "7" },
      ])
    })

    test("reports no hard dependency when no flow references a bot field", async () => {
      mockFlowModelFindMany.mockResolvedValue([
        {
          id: "flow-1",
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
      ])
      mockFindDraft.mockResolvedValue(undefined)
      mockFindPublished.mockResolvedValue({
        startNodeId: "1",
        nodes: [buildFlowNode("42")],
        edges: [],
      })

      const result = await flowsAdapter.collector.collect("ws-1", ["flow-1"])

      expect(result.hardDependencies).toEqual([])
    })

    test("returns an empty result without a hard dependency for an empty id list", async () => {
      const result = await flowsAdapter.collector.collect("ws-1", [])

      expect(result).toEqual({
        entries: [],
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      })
      expect(mockFlowModelFindMany).not.toHaveBeenCalled()
    })
  })
})
