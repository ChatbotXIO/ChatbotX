// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateFromImport,
  mockFlowModelFindMany,
  mockFindDraft,
  mockFindPreferred,
  mockFindExistingIds,
  mockSanitizeOverride,
} = vi.hoisted(() => ({
  mockSanitizeOverride: vi.fn(),
  mockFindExistingIds: vi.fn(),
  mockCreateFromImport: vi.fn(),
  mockFlowModelFindMany: vi.fn(),
  mockFindDraft: vi.fn(),
  mockFindPreferred: vi.fn(),
}))

// The fixtures below are partial nodes; structural validation has its own test.
vi.mock("@chatbotx.io/flow-config", async (importOriginal) => {
  const { z } = await import("zod")
  return {
    ...(await importOriginal<typeof import("@chatbotx.io/flow-config")>()),
    flowVersionSchema: z.unknown(),
  }
})
// Delegates to the real sanitizer unless a test installs an override.
vi.mock("../src/template/reference-sanitizer", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/template/reference-sanitizer")>()
  return {
    ...original,
    sanitizeFlowGraphReferences: (
      ...args: Parameters<typeof original.sanitizeFlowGraphReferences>
    ) =>
      // Only the deferred patch passes `removeKinds`.
      (args[0].removeKinds ? mockSanitizeOverride() : undefined) ??
      original.sanitizeFlowGraphReferences(...args),
  }
})
vi.mock("../src/decision/profile-service", () => ({
  decisionProfileService: { assertFlowReferencesPublishable: vi.fn() },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { flowModel: { findMany: mockFlowModelFindMany } } },
  eq: vi.fn(),
  and: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowVersionModel: { table: "FlowVersion" },
  flowModel: { table: "Flow" },
}))

vi.mock("../src/flow", () => ({
  flowService: { createFromImport: mockCreateFromImport },
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: { findDraft: mockFindDraft },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  flowVersionRepository: { findPreferredByFlowIds: mockFindPreferred },
  referenceExistenceRepository: { findExistingIds: mockFindExistingIds },
  isVerifiableReferenceKind: (kind: string) => kind === "inbox",
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
    mockSanitizeOverride.mockReset()
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
        validatePublishable: false,
      }),
    )
  })

  test("insert skips the flow whose step has a required bot field that is unmapped (never leaves a foreign id, never drops the step) and warns", async () => {
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

    expect(mockCreateFromImport).not.toHaveBeenCalled()
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "flowSkippedRequiredReference" }),
    )
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "botField",
        value: "999",
      }),
    )
  })

  test("insert installs a published, fully resolved flow as draft plus published version", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    const ctx = buildContext()
    await flowsAdapter.insert(ctx, [
      {
        sourceId: "src-flow",
        name: "Live",
        active: true,
        published: true,
        enableInInbox: true,
        startNodeId: "1",
        nodes: [],
        edges: [],
        folderId: null,
      },
    ])
    const call = mockCreateFromImport.mock.calls[0]?.[0] as {
      active: boolean
      publishedToo: boolean
    }
    expect(call.publishedToo).toBe(true)
    expect(call.active).toBe(true)
    expect(ctx.warn).not.toHaveBeenCalled()
  })

  test("insert keeps a never-published flow as an inactive draft and says so", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    const ctx = buildContext()
    await flowsAdapter.insert(ctx, [
      {
        sourceId: "src-flow",
        name: "Draft",
        active: true,
        enableInInbox: true,
        startNodeId: "1",
        nodes: [],
        edges: [],
        folderId: null,
      },
    ])
    expect(mockCreateFromImport).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, publishedToo: false }),
    )
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "flowNotPublished",
        value: "src-flow",
      }),
    )
  })

  describe("deferred patch decides publication", () => {
    const run = async (sanitized: { removed: string[] } | undefined) => {
      mockCreateFromImport.mockResolvedValue("new-flow-id")
      mockFindDraft.mockResolvedValue({ id: "draft-1", nodes: [], edges: [] })
      mockSanitizeOverride.mockReturnValue(
        sanitized
          ? Promise.resolve({
              value: { nodes: [], edges: [] },
              removed: sanitized.removed,
              droppedElements: [],
              blocked: [],
            })
          : undefined,
      )
      const chain = { set: vi.fn(), where: vi.fn() }
      chain.set.mockReturnValue(chain)
      chain.where.mockResolvedValue(undefined)
      const tx = {
        update: vi.fn().mockReturnValue(chain),
        delete: vi.fn().mockReturnValue({ where: vi.fn() }),
        query: {
          flowModel: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ currentVersionId: "v-live" }),
          },
        },
      }
      const ctx = buildContext()
      const tasks = await flowsAdapter.insert(ctx, [
        {
          sourceId: "src-flow",
          name: "Live",
          active: true,
          enableInInbox: true,
          startNodeId: "1",
          nodes: [],
          edges: [],
          folderId: null,
          published: true,
        },
      ])
      const patchCtx = {
        ...buildContext(),
        tx,
        publishedFlows: [] as { flowId: string; versionId: string }[],
      }
      for (const task of tasks) {
        await task.apply(patchCtx as never)
      }
      return { tx, chain, patchCtx }
    }

    test("a clean patch keeps the flow live and reports it for after-publish", async () => {
      const { tx, patchCtx } = await run(undefined)

      expect(tx.delete).not.toHaveBeenCalled()
      expect(patchCtx.publishedFlows).toEqual([
        { flowId: "new-flow-id", versionId: "v-live" },
      ])
      expect(patchCtx.warn).not.toHaveBeenCalled()
    })

    test("a patch that removed a reference demotes the live flow to a draft with a warning", async () => {
      const { tx, chain, patchCtx } = await run({ removed: ["nodes.1.flow"] })

      expect(chain.set).toHaveBeenCalledWith({
        currentVersionId: null,
        active: false,
      })
      expect(tx.delete).toHaveBeenCalledTimes(1)
      expect(patchCtx.publishedFlows).toEqual([])
      expect(patchCtx.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          entityKind: "flowNotPublished",
          // Keyed by the source id, the same shape the insert path warns with.
          path: "flows.src-flow",
          value: "src-flow",
        }),
      )
      // Reference warnings are keyed by the source id too, never "new-flow-id".
      expect(patchCtx.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          entityKind: "referenceRemoved",
          path: "flows.src-flow.nodes.1.flow",
          value: "src-flow",
        }),
      )
    })
  })

  const tagStepFlow = (tagIds: string[]) => ({
    sourceId: "src-flow",
    name: "Tagger",
    active: true,
    enableInInbox: true,
    startNodeId: "1",
    nodes: [
      {
        id: "1",
        data: {
          details: { steps: [{ id: "s1", stepType: "addContactTag", tagIds }] },
        },
      },
    ],
    edges: [],
    folderId: null,
  })

  test("insert drops an unresolved tag id from the array and keeps the resolved one", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    const ctx = buildContext({ tag: new Map([["1", "91"]]) })

    await flowsAdapter.insert(ctx, [tagStepFlow(["1", "2"])])

    const { nodes } = mockCreateFromImport.mock.calls[0]?.[0] as {
      nodes: { data: { details: { steps: { tagIds: string[] }[] } } }[]
    }
    expect(nodes[0]?.data.details.steps[0]?.tagIds).toEqual(["91"])
  })

  test("insert keeps a verifyInTarget id that exists in the target and removes one that does not", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    mockFindExistingIds.mockResolvedValue(new Set(["500"]))
    const ctx = buildContext()
    const entry = {
      ...tagStepFlow([]),
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "a", stepType: "sendWaTemplateMessage", inboxId: "500" },
                { id: "b", stepType: "sendWaTemplateMessage", inboxId: "600" },
              ],
            },
          },
        },
      ],
    }

    await flowsAdapter.insert(ctx, [entry])

    const { nodes } = mockCreateFromImport.mock.calls[0]?.[0] as {
      nodes: { data: { details: { steps: { inboxId: string | null }[] } } }[]
    }
    expect(nodes[0]?.data.details.steps.map((step) => step.inboxId)).toEqual([
      "500",
      null,
    ])
    expect(mockFindExistingIds).toHaveBeenCalledTimes(1)
  })

  test("insert registers an identity flowNode map for every installed node", async () => {
    mockCreateFromImport.mockResolvedValue("new-flow-id")
    const ctx = buildContext({ botField: new Map([["7", "70"]]) })

    await flowsAdapter.insert(ctx, [
      {
        sourceId: "src-flow",
        name: "Onboarding",
        active: true,
        enableInInbox: true,
        startNodeId: "1",
        nodes: [
          buildFlowNode("bot_field:7"),
          { ...buildFlowNode("x"), id: "2" },
        ],
        edges: [],
        folderId: null,
      },
    ])

    expect(ctx.idMaps.flowNode).toEqual(
      new Map([
        ["1", "1"],
        ["2", "2"],
      ]),
    )
  })

  describe("collect", () => {
    test("leaves bot-field dependencies to the snapshot, which reads every category", async () => {
      mockFlowModelFindMany.mockResolvedValue([
        {
          id: "flow-1",
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
      ])
      mockFindPreferred.mockResolvedValue([
        {
          flowId: "flow-1",
          startNodeId: "1",
          nodes: [buildFlowNode("bot_field:7")],
          edges: [],
        },
      ])

      const result = await flowsAdapter.collector.collect("ws-1", ["flow-1"])

      expect(result.hardDependencies).toEqual([])
    })

    test("reports a sequence a flow subscribes to as a sequences hard dependency", async () => {
      mockFlowModelFindMany.mockResolvedValue([
        {
          id: "flow-1",
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
      ])
      const node = buildFlowNode("42") as {
        data: { details: { steps: Record<string, unknown>[] } }
      }
      node.data.details.steps = [
        { id: "40", stepType: "subscribeSequence", sequenceId: "55" },
        { id: "41", stepType: "subscribeSequence", sequenceId: "55" },
      ]
      mockFindPreferred.mockResolvedValue([
        { flowId: "flow-1", startNodeId: "1", nodes: [node], edges: [] },
      ])

      const result = await flowsAdapter.collector.collect("ws-1", ["flow-1"])

      expect(result.hardDependencies).toEqual([
        { category: "sequences", sourceId: "55" },
      ])
    })

    test("reports no bot-field dependency per flow (the snapshot collects them for every category)", async () => {
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
      mockFindPreferred.mockResolvedValue(
        ["flow-1", "flow-2"].map((flowId) => ({
          flowId,
          startNodeId: "1",
          nodes: [buildFlowNode("bot_field:7")],
          edges: [],
        })),
      )

      const result = await flowsAdapter.collector.collect("ws-1", [
        "flow-1",
        "flow-2",
      ])

      expect(result.hardDependencies).toEqual([])
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
      mockFindPreferred.mockResolvedValue([
        {
          flowId: "flow-1",
          startNodeId: "1",
          nodes: [buildFlowNode("42")],
          edges: [],
        },
      ])

      const result = await flowsAdapter.collector.collect("ws-1", ["flow-1"])

      expect(result.hardDependencies).toEqual([])
    })

    test("loads every flow's version in one repository call", async () => {
      mockFlowModelFindMany.mockResolvedValue(
        ["flow-1", "flow-2", "flow-3"].map((id) => ({
          id,
          name: id,
          active: true,
          enableInInbox: true,
          folderId: null,
        })),
      )
      mockFindPreferred.mockResolvedValue([
        { flowId: "flow-1", startNodeId: "1", nodes: [], edges: [] },
        { flowId: "flow-3", startNodeId: "1", nodes: [], edges: [] },
      ])

      const result = await flowsAdapter.collector.collect("ws-1", [
        "flow-1",
        "flow-2",
        "flow-3",
      ])

      expect(mockFindPreferred).toHaveBeenCalledTimes(1)
      expect(mockFindPreferred).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        flowIds: ["flow-1", "flow-2", "flow-3"],
      })
      expect(result.entries.map((entry) => entry.sourceId)).toEqual([
        "flow-1",
        "flow-3",
      ])
    })

    test("reports the product categories a sendCollection filters by so they are shipped", async () => {
      mockFlowModelFindMany.mockResolvedValue([
        {
          id: "flow-1",
          name: "Shop",
          active: true,
          enableInInbox: true,
          folderId: null,
        },
      ])
      mockFindPreferred.mockResolvedValue([
        {
          flowId: "flow-1",
          startNodeId: "1",
          nodes: [
            {
              id: "1",
              data: {
                details: {
                  steps: [
                    {
                      id: "s1",
                      stepType: "sendCollection",
                      conditions: { categoryId: "321", subcategoryId: "654" },
                    },
                  ],
                },
              },
            },
          ],
          edges: [],
        },
      ])

      const result = await flowsAdapter.collector.collect("ws-1", ["flow-1"])

      expect([...result.productCategoryIds].sort()).toEqual(["321", "654"])
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
