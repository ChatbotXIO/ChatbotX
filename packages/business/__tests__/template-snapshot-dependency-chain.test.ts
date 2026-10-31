// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ chainLength: 0 }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: { findMany: vi.fn().mockResolvedValue([]) },
      customFieldModel: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  inboxRepository: { listIdentitiesByIds: vi.fn().mockResolvedValue([]) },
}))
vi.mock("@chatbotx.io/flow-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/flow-config")>()),
  parseTemplateExport: (payload: unknown) => ({ ok: true, data: payload }),
}))

// A flow needs the sequence with its number, whose step sends the next flow:
// f0 -> s0 -> f1 -> s1 -> ... one hop per pass, far more than the number of
// categories.
const makeCollector = (
  own: "flows" | "sequences",
  dependsOn: "flows" | "sequences",
) => ({
  resolveIds: vi.fn().mockResolvedValue([]),
  verifyOwnership: vi.fn(async (_ws: string, ids: readonly string[]) => [
    ...ids,
  ]),
  collect: vi.fn(async (_ws: string, ids: readonly string[]) => ({
    entries: ids.map((id) => ({ sourceId: id, own })),
    folderIds: [],
    productCategoryIds: [],
    hardDependencies: ids.flatMap((id) => {
      const n = Number(id.slice(1))
      const next = own === "flows" ? n : n + 1
      return next < mocks.chainLength
        ? [
            {
              category: dependsOn,
              sourceId: `${dependsOn === "flows" ? "f" : "s"}${next}`,
            },
          ]
        : []
    }),
  })),
})

vi.mock("../src/template/adapters/registry", () => ({
  templateAdapterRegistry: {
    flows: makeCollectorHolder("flows", "sequences"),
    sequences: makeCollectorHolder("sequences", "flows"),
  },
}))

function makeCollectorHolder(
  own: "flows" | "sequences",
  dependsOn: "flows" | "sequences",
) {
  return { collector: makeCollector(own, dependsOn) }
}

vi.mock("../src/template/adapters/manifests/collect-hierarchies", () => ({
  collectFolderAncestry: vi.fn().mockResolvedValue({}),
  collectProductCategoryAncestry: vi.fn().mockResolvedValue({}),
}))
vi.mock("../src/template/adapters/manifests/collect-pipelines", () => ({
  collectPipelineManifest: vi.fn().mockResolvedValue({}),
}))

const { templateAdapterRegistry } = await import(
  "../src/template/adapters/registry"
)
const { buildTemplateSnapshot } = await import(
  "../src/template/snapshot.service"
)

const snapshot = () =>
  buildTemplateSnapshot({
    workspaceId: "ws-1",
    tenantId: "1",
    selection: { flows: { mode: "ids", ids: ["f0"] } },
  })

describe("buildTemplateSnapshot — dependency chains between categories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("follows a flow -> sequence -> flow chain longer than the number of categories", async () => {
    mocks.chainLength = 8

    const { payload } = await snapshot()

    // f0, then s0 -> f1 -> s1 -> ... : every link is collected, none dropped.
    expect(payload.resources.flows).toHaveLength(8)
    expect(payload.resources.sequences).toHaveLength(8)
  })

  test("stops a chain that outgrows the template size cap instead of looping", async () => {
    mocks.chainLength = 10_000

    await expect(snapshot()).rejects.toMatchObject({
      code: "templatePayloadTooLarge",
    })
  })

  test("refuses an over-cap mode:all selection before collecting any category", async () => {
    mocks.chainLength = 0
    const flows = templateAdapterRegistry.flows.collector
    flows.resolveIds.mockResolvedValueOnce(
      Array.from({ length: 201 }, (_, i) => `f${i}`),
    )

    await expect(
      buildTemplateSnapshot({
        workspaceId: "ws-1",
        tenantId: "1",
        selection: { flows: { mode: "all" } },
      }),
    ).rejects.toMatchObject({ code: "templatePayloadTooLarge" })

    expect(flows.resolveIds).toHaveBeenCalledWith("ws-1", 201)
    expect(flows.collect).not.toHaveBeenCalled()
  })
})
