// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByWorkspaceId: vi.fn(),
  findByWorkspaceIdOrFail: vi.fn(),
  resolveAuth: vi.fn(),
  failImport: vi.fn(),
  startImport: vi.fn(),
  startPush: vi.fn(),
  runList: vi.fn(),
  runFail: vi.fn(),
  queueAdd: vi.fn(),
  getCatalog: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationMetaCatalogService: {
    findByWorkspaceId: mocks.findByWorkspaceId,
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
    resolveAuth: mocks.resolveAuth,
    failImport: mocks.failImport,
  },
  metaCatalogOperationService: {
    startImport: mocks.startImport,
    startPush: mocks.startPush,
  },
  metaCatalogSyncRunService: { list: mocks.runList, fail: mocks.runFail },
}))
vi.mock("@chatbotx.io/integration-meta-catalog", () => ({
  createCatalog: vi.fn(),
  getCatalog: mocks.getCatalog,
  listBusinesses: vi.fn(),
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    importMetaCatalogProducts: "importMetaCatalogProducts",
    submitMetaCatalogSync: "submitMetaCatalogSync",
  },
  defaultQueue: { add: mocks.queueAdd },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const {
  ENGLISH_META_CATALOG_REASONS,
  getMetaCatalogState,
  selectMetaCatalog,
  syncProductsToMetaCatalog,
} = await import("@/features/products/lib/meta-catalog-operations")
const { metaCatalogStatePublicResponse } = await import(
  "@/features/products/schema/public"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByWorkspaceIdOrFail.mockResolvedValue({ id: "c1", catalogId: "9" })
  mocks.resolveAuth.mockResolvedValue({ accessToken: "t", version: "v23.0" })
  mocks.getCatalog.mockResolvedValue({ id: "9", name: "Shop", businessId: "b" })
  mocks.startImport.mockResolvedValue({
    connection: { id: "c1", updatedAt: new Date() },
    run: { id: "r1" },
  })
  mocks.startPush.mockResolvedValue({ id: "r2" })
  mocks.queueAdd.mockResolvedValue(undefined)
})

describe("meta catalog state", () => {
  test("never carries the encrypted credential", async () => {
    mocks.findByWorkspaceId.mockResolvedValue({
      id: "c1",
      encryptedAuth: { secret: "x" },
    })
    mocks.runList.mockResolvedValue([])

    const state = await getMetaCatalogState("ws-1")

    expect(JSON.stringify(state)).not.toContain("secret")
    expect(state.connection).not.toHaveProperty("encryptedAuth")
  })

  test("the public response schema drops credential and bookkeeping columns", () => {
    const shape = metaCatalogStatePublicResponse.shape.connection.unwrap().shape
    expect(shape).not.toHaveProperty("encryptedAuth")
    expect(shape).not.toHaveProperty("workspaceId")
  })
})

describe("selectMetaCatalog", () => {
  test("a run of the other direction is a 409 with the caller's sentence", async () => {
    mocks.startImport.mockRejectedValue(
      new ChatbotXException("x", "metaCatalogSyncAlreadyRunning"),
    )

    await expect(
      selectMetaCatalog({
        workspaceId: "ws-1",
        catalogId: "9",
        reasons: { ...ENGLISH_META_CATALOG_REASONS, alreadyRunning: "busy" },
      }),
    ).rejects.toMatchObject({ message: "busy", httpStatusCode: 409 })
  })

  test("a queue failure fails the run and the import so they cannot block later syncs", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))

    await expect(
      selectMetaCatalog({
        workspaceId: "ws-1",
        catalogId: "9",
        reasons: ENGLISH_META_CATALOG_REASONS,
      }),
    ).rejects.toThrow("redis down")
    expect(mocks.failImport).toHaveBeenCalledWith(
      "c1",
      ENGLISH_META_CATALOG_REASONS.queueImport,
    )
    expect(mocks.runFail).toHaveBeenCalledWith(
      "r1",
      ENGLISH_META_CATALOG_REASONS.queueImport,
    )
  })
})

describe("syncProductsToMetaCatalog", () => {
  test("verifies a new destination catalog with Meta; the stored one costs no roundtrip", async () => {
    await syncProductsToMetaCatalog({
      workspaceId: "ws-1",
      sync: { scope: "all", catalogId: "9" },
      reasons: ENGLISH_META_CATALOG_REASONS,
    })
    expect(mocks.getCatalog).not.toHaveBeenCalled()

    await syncProductsToMetaCatalog({
      workspaceId: "ws-1",
      sync: { scope: "all", catalogId: "10" },
      reasons: ENGLISH_META_CATALOG_REASONS,
    })
    expect(mocks.getCatalog).toHaveBeenCalledTimes(1)
  })

  test("without catalogId, pushes to the bound catalog", async () => {
    await syncProductsToMetaCatalog({
      workspaceId: "ws-1",
      sync: { scope: "all" },
      reasons: ENGLISH_META_CATALOG_REASONS,
    })

    expect(mocks.getCatalog).not.toHaveBeenCalled()
    expect(mocks.startPush).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", catalogId: "9" }),
    )
  })

  test("without catalogId and no bound catalog, asks for one (422)", async () => {
    mocks.findByWorkspaceIdOrFail.mockResolvedValueOnce({
      id: "c1",
      catalogId: null,
    })

    await expect(
      syncProductsToMetaCatalog({
        workspaceId: "ws-1",
        sync: { scope: "all" },
        reasons: ENGLISH_META_CATALOG_REASONS,
      }),
    ).rejects.toMatchObject({ code: "validation", field: "catalogId" })
    expect(mocks.startPush).not.toHaveBeenCalled()
  })

  test("a queue failure marks the run failed", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))

    await expect(
      syncProductsToMetaCatalog({
        workspaceId: "ws-1",
        sync: { scope: "all", catalogId: "9" },
        reasons: ENGLISH_META_CATALOG_REASONS,
      }),
    ).rejects.toThrow("redis down")
    expect(mocks.runFail).toHaveBeenCalledWith(
      "r2",
      ENGLISH_META_CATALOG_REASONS.queueSync,
    )
  })
})
