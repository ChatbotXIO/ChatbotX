// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listLockedIds: vi.fn() }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  inboxRepository: { listIdentitiesByIds: vi.fn().mockResolvedValue([]) },
  templateSnapshotRepository: {
    findTags: vi.fn().mockResolvedValue([]),
    findCustomFields: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock("@chatbotx.io/flow-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/flow-config")>()),
  parseTemplateExport: (payload: unknown) => ({ ok: true, data: payload }),
}))
vi.mock("../src/template/installed-resource.service", () => ({
  listLockedIds: mocks.listLockedIds,
}))

// A keyword the publisher owns that fires a flow: the flow travels with it.
const collector = (own: "keywords" | "flows") => ({
  resolveIds: vi.fn().mockResolvedValue([]),
  verifyOwnership: vi.fn(async (_ws: string, ids: readonly string[]) => [
    ...ids,
  ]),
  collect: vi.fn(async (_ws: string, ids: readonly string[]) => ({
    entries: ids.map((id) => ({ sourceId: id })),
    folderIds: [],
    productCategoryIds: [],
    hardDependencies:
      own === "keywords" && ids.length > 0
        ? [{ category: "flows" as const, sourceId: "f-locked" }]
        : [],
  })),
})

vi.mock("../src/template/adapters/registry", () => ({
  templateAdapterRegistry: {
    keywords: {
      trackedKind: "automatedResponse",
      collector: collector("keywords"),
    },
    flows: { trackedKind: "flow", collector: collector("flows") },
    // Settings carries saved replies AND bot fields under one category.
    settings: { trackedKind: null, collector: collector("flows") },
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

const snapshot = (selection: Record<string, unknown>) =>
  buildTemplateSnapshot({
    workspaceId: "ws-1",
    tenantId: "1",
    selection: selection as never,
  })

// Re-publishing a View-only copy would hand its content out editable: the
// same bypass duplicate and export refuse.
describe("buildTemplateSnapshot refuses View-only copies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("a View-only copy selected directly is refused", async () => {
    mocks.listLockedIds.mockImplementation(
      async (input: { resourceIds: readonly string[] }) =>
        input.resourceIds.filter((id) => id === "f-locked"),
    )

    await expect(
      snapshot({ flows: { mode: "ids", ids: ["f-locked"] } }),
    ).rejects.toMatchObject({ code: "templateIncludesViewOnlyCopy" })
  })

  test("a View-only copy pulled in as a dependency is refused too", async () => {
    mocks.listLockedIds.mockImplementation(
      async (input: { resourceIds: readonly string[] }) =>
        input.resourceIds.filter((id) => id === "f-locked"),
    )

    await expect(
      snapshot({ keywords: { mode: "ids", ids: ["k1"] } }),
    ).rejects.toMatchObject({ code: "templateIncludesViewOnlyCopy" })
    expect(mocks.listLockedIds).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "flow",
        resourceIds: ["f-locked"],
      }),
    )
  })

  test("a View-only bot field under settings is refused, not only saved replies", async () => {
    mocks.listLockedIds.mockImplementation(
      async (input: {
        resourceKind: string
        resourceIds: readonly string[]
      }) => (input.resourceKind === "botField" ? [...input.resourceIds] : []),
    )

    await expect(
      snapshot({ settings: { mode: "ids", ids: ["bf-locked"] } }),
    ).rejects.toMatchObject({ code: "templateIncludesViewOnlyCopy" })
  })

  test("resources nobody locked are snapshotted as before", async () => {
    mocks.listLockedIds.mockResolvedValue([])

    const { payload } = await snapshot({
      keywords: { mode: "ids", ids: ["k1"] },
    })

    expect(payload.resources.flows).toHaveLength(1)
  })
})
