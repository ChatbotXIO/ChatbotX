// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  tagFindMany: vi.fn(),
  customFieldFindMany: vi.fn(),
  flowsCollect: vi.fn(),
  triggersCollect: vi.fn(),
  productsCollect: vi.fn(),
  pipelineManifest: vi.fn(),
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
    triggers: {
      collector: {
        resolveIds: vi.fn().mockResolvedValue([]),
        verifyOwnership: vi.fn().mockResolvedValue(["trigger-1"]),
        collect: mocks.triggersCollect,
      },
    },
    products: {
      collector: {
        resolveIds: vi.fn().mockResolvedValue([]),
        verifyOwnership: vi.fn().mockResolvedValue(["15"]),
        collect: mocks.productsCollect,
      },
    },
  },
}))
vi.mock("../src/template/adapters/manifests/collect-hierarchies", () => ({
  collectFolderAncestry: vi.fn().mockResolvedValue({}),
  collectProductCategoryAncestry: vi.fn().mockResolvedValue({}),
}))
vi.mock("../src/template/adapters/manifests/collect-pipelines", () => ({
  collectPipelineManifest: mocks.pipelineManifest,
}))

const { buildTemplateSnapshot } = await import(
  "../src/template/snapshot.service"
)

const emptyCollect = {
  entries: [],
  folderIds: [],
  productCategoryIds: [],
  hardDependencies: [],
}
const flowEntry = {
  sourceId: "flow-1",
  name: "Welcome",
  active: true,
  enableInInbox: true,
  startNodeId: "n1",
  nodes: [],
  edges: [],
  folderId: null,
}
const snapshot = (selection: Record<string, unknown>) =>
  buildTemplateSnapshot({
    workspaceId: "ws-1",
    tenantId: "1",
    selection: selection as never,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tagFindMany.mockResolvedValue([])
  mocks.customFieldFindMany.mockResolvedValue([])
  mocks.pipelineManifest.mockResolvedValue({})
  mocks.flowsCollect.mockResolvedValue(emptyCollect)
  mocks.triggersCollect.mockResolvedValue(emptyCollect)
  mocks.productsCollect.mockResolvedValue(emptyCollect)
})

describe("buildTemplateSnapshot: droppedReferenceCount", () => {
  const flowWithTags = (tagIds: string[]) => ({
    ...flowEntry,
    nodes: [
      {
        id: "n1",
        data: {
          details: { steps: [{ id: "s1", stepType: "addContactTag", tagIds }] },
        },
      },
    ],
  })

  test("counts referenced tags that no longer exist and leaves them out of the manifest", async () => {
    mocks.flowsCollect.mockResolvedValue({
      ...emptyCollect,
      entries: [flowWithTags(["678", "999"])],
    })
    mocks.tagFindMany.mockResolvedValue([{ id: "678", name: "kept" }])

    const { payload, droppedReferenceCount } = await snapshot({
      flows: { mode: "ids", ids: ["flow-1"] },
    })

    expect(payload.manifests.tags).toEqual({ "678": { name: "kept" } })
    expect(droppedReferenceCount).toBe(1)
  })

  test("is zero when every reference resolves", async () => {
    mocks.flowsCollect.mockResolvedValue({
      ...emptyCollect,
      entries: [flowWithTags(["678"])],
    })
    mocks.tagFindMany.mockResolvedValue([{ id: "678", name: "kept" }])

    const { droppedReferenceCount } = await snapshot({
      flows: { mode: "ids", ids: ["flow-1"] },
    })
    expect(droppedReferenceCount).toBe(0)
  })
})

describe("buildTemplateSnapshot: trigger condition rows", () => {
  const row = (
    type: string,
    sourceId: string | null,
    value: unknown = null,
  ) => ({
    type,
    sourceId,
    operator: null,
    value,
  })
  const triggerWith = (conditions: ReturnType<typeof row>[]) => ({
    sourceId: "trigger-1",
    name: "T",
    active: true,
    folderId: null,
    actions: [],
    conditions,
  })
  const withTrigger = (conditions: ReturnType<typeof row>[]) => {
    mocks.triggersCollect.mockResolvedValue({
      ...emptyCollect,
      entries: [triggerWith(conditions)],
    })
  }
  const triggerSnapshot = () =>
    snapshot({ triggers: { mode: "ids", ids: ["trigger-1"] } })

  test("a deleted tag named by several rows is counted once, not once more for the rows", async () => {
    withTrigger([row("tagApplied", "999"), row("tagRemoved", "999")])

    const { droppedReferenceCount } = await triggerSnapshot()

    expect(droppedReferenceCount).toBe(1)
  })

  test("a row pinned to a product the template does not carry counts as dropped", async () => {
    withTrigger([row("productOrdered", "15")])

    expect((await triggerSnapshot()).droppedReferenceCount).toBe(1)
  })

  test("a selected product, a shipped pipeline and its stage are carried", async () => {
    mocks.productsCollect.mockResolvedValue({
      ...emptyCollect,
      entries: [{ sourceId: "15", name: "P" }],
    })
    mocks.pipelineManifest.mockResolvedValue({
      "17": { name: "Sales", stages: [{ sourceId: "18", name: "Won" }] },
    })
    withTrigger([
      row("productOrdered", "15"),
      row("pipelineItemMovedToStage", "17", { stageId: "18" }),
    ])

    const { droppedReferenceCount } = await snapshot({
      triggers: { mode: "ids", ids: ["trigger-1"] },
      products: { mode: "ids", ids: ["15"] },
    })

    expect(droppedReferenceCount).toBe(0)
  })

  test("a stage the shipped pipeline does not have counts as dropped", async () => {
    mocks.pipelineManifest.mockResolvedValue({
      "17": { name: "Sales", stages: [{ sourceId: "18", name: "Won" }] },
    })
    withTrigger([row("pipelineItemMovedToStage", "17", { stageId: "77" })])

    expect((await triggerSnapshot()).droppedReferenceCount).toBe(1)
  })

  test("the rows' pipeline ids reach the pipeline manifest collection", async () => {
    const rows = [row("pipelineItemCreated", "17")]
    withTrigger(rows)

    await triggerSnapshot()

    expect(mocks.pipelineManifest).toHaveBeenCalledWith("ws-1", [], rows)
  })
})
