// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  tagFindMany: vi.fn(),
  customFieldFindMany: vi.fn(),
  flowsCollect: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: { findMany: mocks.tagFindMany },
      customFieldModel: { findMany: mocks.customFieldFindMany },
    },
  },
}))

// The reference walker is real; only the strict envelope parse is bypassed,
// since these hand-built flow nodes are not full valid graphs.
vi.mock("@chatbotx.io/flow-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/flow-config")>()),
  parseTemplateExport: (payload: unknown) => ({ ok: true, data: payload }),
}))

vi.mock("../src/template/adapters/registry", () => ({
  templateAdapterRegistry: {
    flows: {
      collector: {
        resolveIds: vi.fn().mockResolvedValue([]),
        verifyOwnership: vi.fn().mockResolvedValue(["flow-1"]),
        collect: mocks.flowsCollect,
      },
    },
  },
}))
vi.mock("../src/template/adapters/manifests/collect-hierarchies", () => ({
  collectFolderAncestry: vi.fn().mockResolvedValue({}),
  collectProductCategoryAncestry: vi.fn().mockResolvedValue({}),
}))
vi.mock("../src/template/adapters/manifests/collect-pipelines", () => ({
  collectPipelineManifest: vi.fn().mockResolvedValue({}),
}))

const { buildTemplateSnapshot } = await import(
  "../src/template/snapshot.service"
)

const flowWith = (steps: Record<string, unknown>[]) => ({
  sourceId: "flow-1",
  name: "Welcome",
  active: true,
  enableInInbox: true,
  startNodeId: "n1",
  nodes: [{ id: "n1", data: { details: { steps } } }],
  edges: [],
  folderId: null,
})

const snapshot = () =>
  buildTemplateSnapshot({
    workspaceId: "ws-1",
    tenantId: "1",
    selection: { flows: { mode: "ids", ids: ["flow-1"] } },
  })

describe("buildTemplateSnapshot — referenced tags and custom fields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagFindMany.mockResolvedValue([])
    mocks.customFieldFindMany.mockResolvedValue([])
  })

  test("ships a tag a flow Condition uses although the tags category was not selected", async () => {
    mocks.flowsCollect.mockResolvedValue({
      entries: [
        flowWith([{ id: "s1", stepType: "addContactTag", tagIds: ["678679"] }]),
      ],
      folderIds: [],
      productCategoryIds: [],
      hardDependencies: [],
    })
    mocks.tagFindMany.mockResolvedValue([{ id: "678679", name: "zz_tpl_test" }])

    const { payload, categoryCounts } = await snapshot()

    expect(payload.manifests.tags).toEqual({
      "678679": { name: "zz_tpl_test" },
    })
    expect(categoryCounts.tags).toBe(1)
  })

  test("drops a referenced tag that is deleted or belongs to another workspace", async () => {
    mocks.flowsCollect.mockResolvedValue({
      entries: [
        flowWith([
          {
            id: "s1",
            stepType: "condition",
            conditions: [{ field: "tags", operator: "in", value: ["999"] }],
          },
        ]),
      ],
      folderIds: [],
      productCategoryIds: [],
      hardDependencies: [],
    })
    // The row query only returns this workspace's live tags.
    mocks.tagFindMany.mockResolvedValue([])

    const { payload } = await snapshot()

    expect(payload.manifests.tags).toEqual({})
    expect(mocks.tagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          deletedAt: { isNull: true },
        }),
      }),
    )
  })

  test("ships a custom field used only through a {{name}} token", async () => {
    mocks.flowsCollect.mockResolvedValue({
      entries: [
        flowWith([
          { id: "s1", stepType: "sendText", text: "Size {{shoe_size}}" },
        ]),
      ],
      folderIds: [],
      productCategoryIds: [],
      hardDependencies: [],
    })
    mocks.customFieldFindMany.mockImplementation(
      async ({ where }: { where: { name?: unknown; id?: unknown } }) =>
        where.name
          ? [{ id: "42", name: "shoe_size" }]
          : [{ id: "42", name: "shoe_size", type: "text" }],
    )

    const { payload } = await snapshot()

    expect(payload.manifests.customFields).toEqual({
      "42": { name: "shoe_size", type: "text" },
    })
  })

  test("skips a token name shared by two fields of different types", async () => {
    mocks.flowsCollect.mockResolvedValue({
      entries: [
        flowWith([{ id: "s1", stepType: "sendText", text: "{{size}}" }]),
      ],
      folderIds: [],
      productCategoryIds: [],
      hardDependencies: [],
    })
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "1", name: "size" },
      { id: "2", name: "size" },
    ])

    const { payload } = await snapshot()

    expect(payload.manifests.customFields).toEqual({})
  })
})
