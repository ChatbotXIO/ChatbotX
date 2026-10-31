// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  folders: vi.fn(),
  customFields: vi.fn(),
  tags: vi.fn(),
  productCategories: vi.fn(),
  pipelines: vi.fn(),
  inboxes: vi.fn(),
  rebuild: vi.fn(),
  findFirst: vi.fn(),
  insertReturning: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({
  folderModel: {},
  templateInstalledResourceModel: {},
}))
vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "new-root" }))
vi.mock("../src/template/adapters/registry", () => ({
  folderTypeToCategory: (type: string) =>
    type === "sequence" ? "sequences" : "flows",
}))
vi.mock("../src/template/sync-pipeline-mapping", () => ({
  rebuildPipelineChildMappings: mocks.rebuild,
}))
vi.mock("../src/template/adapters/manifests/folders", () => ({
  resolveFolderManifest: mocks.folders,
}))
vi.mock("../src/template/adapters/manifests/custom-fields", () => ({
  resolveCustomFieldManifest: mocks.customFields,
}))
vi.mock("../src/template/adapters/manifests/tags", () => ({
  resolveTagManifest: mocks.tags,
}))
vi.mock("../src/template/adapters/manifests/product-categories", () => ({
  resolveProductCategoryManifest: mocks.productCategories,
}))
vi.mock("../src/template/adapters/manifests/pipelines", () => ({
  resolvePipelineManifest: mocks.pipelines,
}))
vi.mock("../src/template/adapters/manifests/inboxes", () => ({
  resolveInboxManifest: mocks.inboxes,
}))

const { resolveManifests } = await import(
  "../src/template/adapters/manifests/resolve"
)
const { isManifestKind, isLabelledManifestKind, SHARED_KINDS } = await import(
  "../src/template/adapters/manifests/kinds"
)

const folder = (name: string, parentSourceId: string | null = null) => ({
  name,
  folderType: "flow",
  parentSourceId,
})

const manifests = (overrides: Record<string, unknown> = {}) =>
  ({
    folders: {},
    customFields: { cf1: { name: "a", type: "text" } },
    tags: { t1: { name: "vip" } },
    productCategories: { pc1: { name: "Shoes" } },
    pipelines: {},
    inboxes: {},
    ...overrides,
  }) as never

const makeCtx = (idMaps: Record<string, Map<string, string>> = {}) => ({
  tx: {
    query: { folderModel: { findFirst: mocks.findFirst } },
    insert: () => ({
      values: () => ({ returning: mocks.insertReturning }),
    }),
  },
  workspaceId: "ws-1",
  installationId: "inst-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

const allowAll = () => true

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertReturning.mockResolvedValue([{ id: "new-root" }])
})

describe("resolveManifests", () => {
  test("an install resolves every manifest, folders included", async () => {
    const ctx = makeCtx()

    await resolveManifests(
      ctx as never,
      manifests({ folders: { f1: folder("A") } }),
      { skipMapped: false, mayUse: allowAll },
    )

    expect(mocks.folders).toHaveBeenCalledWith(
      ctx,
      { f1: folder("A") },
      "flows",
    )
    expect(mocks.customFields).toHaveBeenCalled()
    expect(mocks.tags).toHaveBeenCalled()
    expect(mocks.productCategories).toHaveBeenCalled()
    expect(mocks.rebuild).not.toHaveBeenCalled()
  })

  test("a sync resolves only what is unmapped, and rebuilds mapped pipelines' children", async () => {
    const ctx = makeCtx({
      folder: new Map([["f1", "t-f1"]]),
      tag: new Map([["t1", "t-t1"]]),
      pipeline: new Map([["p1", "t-p1"]]),
    })
    const pipelines = { p1: { name: "P1" }, p2: { name: "P2" } }

    await resolveManifests(
      ctx as never,
      manifests({
        folders: { f1: folder("A"), f2: folder("B") },
        pipelines,
      }),
      { skipMapped: true, mayUse: allowAll },
    )

    expect(mocks.folders).toHaveBeenCalledWith(
      ctx,
      { f2: folder("B") },
      "flows",
    )
    expect(mocks.tags).toHaveBeenCalledWith(
      ctx,
      {},
      { installFolder: undefined },
    )
    expect(mocks.rebuild).toHaveBeenCalledWith(
      ctx,
      { p1: pipelines.p1 },
      ctx.tx,
    )
    expect(mocks.pipelines).toHaveBeenCalledWith(ctx, { p2: pipelines.p2 })
  })

  test("a manifest the actor may not create is skipped and reported", async () => {
    const ctx = makeCtx()

    const result = await resolveManifests(ctx as never, manifests(), {
      skipMapped: true,
      mayUse: (category) => category !== "productCategories",
    })

    expect(mocks.productCategories).not.toHaveBeenCalled()
    expect(mocks.tags).toHaveBeenCalled()
    expect([...result.denied]).toEqual(["productCategories"])
  })

  test("a pipeline is created only for an actor who may use flows", async () => {
    const ctx = makeCtx()

    const result = await resolveManifests(
      ctx as never,
      manifests({ pipelines: { p1: { name: "Sales" } } }),
      {
        skipMapped: true,
        mayUse: (category) => category !== "flows",
      },
    )

    expect(mocks.pipelines).not.toHaveBeenCalled()
    expect([...result.denied]).toContain("pipelines")
  })

  test("a denied manifest with nothing left to create is not reported", async () => {
    const ctx = makeCtx({ productCategory: new Map([["pc1", "t-pc1"]]) })

    const result = await resolveManifests(ctx as never, manifests(), {
      skipMapped: true,
      mayUse: (category) => category !== "productCategories",
    })

    expect(result.denied.size).toBe(0)
  })

  test("an install folder nests top-level folders under a fresh root per namespace", async () => {
    const ctx = makeCtx()

    const result = await resolveManifests(
      ctx as never,
      manifests({
        folders: { f1: folder("A"), f2: folder("B", "f1") },
      }),
      {
        skipMapped: false,
        mayUse: allowAll,
        installFolder: { templateName: "Shop", mode: "create" },
      },
    )

    expect(result.installFolderId).toBe("new-root")
    expect(ctx.idMaps.folder.get("__installRoot:flow")).toBe("new-root")
    const [, group] = mocks.folders.mock.calls[0]
    expect(group.f1.parentSourceId).toBe("__installRoot:flow")
    expect(group.f2.parentSourceId).toBe("f1")
  })

  test("a sync reuses the install's existing root instead of creating another", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing-root" })
    const ctx = makeCtx()

    const result = await resolveManifests(
      ctx as never,
      manifests({ folders: { f1: folder("A") } }),
      {
        skipMapped: true,
        mayUse: allowAll,
        installFolder: { templateName: "Shop", mode: "reuse" },
      },
    )

    expect(result.installFolderId).toBe("existing-root")
    expect(mocks.insertReturning).not.toHaveBeenCalled()
  })

  test("folders of a category the actor may not use are left alone", async () => {
    const ctx = makeCtx()

    await resolveManifests(
      ctx as never,
      manifests({
        folders: {
          f1: folder("A"),
          s1: { ...folder("S"), folderType: "sequence" },
        },
      }),
      {
        skipMapped: false,
        mayUse: (category) => category !== "sequences",
      },
    )

    expect(mocks.folders).toHaveBeenCalledTimes(1)
    expect(mocks.folders.mock.calls[0][2]).toBe("flows")
  })
})

describe("manifest kinds", () => {
  test("one table answers manifest, labelled and shared questions", () => {
    expect(isManifestKind("tag")).toBe(true)
    expect(isManifestKind("flow")).toBe(false)
    expect(isLabelledManifestKind("inbox")).toBe(false)
    expect(isLabelledManifestKind("folder")).toBe(true)
    expect(SHARED_KINDS.has("inbox")).toBe(true)
    expect(SHARED_KINDS.has("flow")).toBe(false)
  })
})

describe("resolveManifests — install folder for tags and custom fields", () => {
  const inserted: Record<string, unknown>[] = []
  const ctxWithInsertSpy = (
    idMaps: Record<string, Map<string, string>> = {},
  ) => ({
    ...makeCtx(idMaps),
    tx: {
      query: { folderModel: { findFirst: mocks.findFirst } },
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values)
          return { returning: mocks.insertReturning }
        },
      }),
    },
  })

  beforeEach(() => {
    inserted.length = 0
  })

  test("without an install folder neither manifest is given a placement", async () => {
    const ctx = ctxWithInsertSpy()
    await resolveManifests(ctx as never, manifests(), {
      skipMapped: false,
      mayUse: allowAll,
    })
    expect(mocks.tags).toHaveBeenCalledWith(ctx, expect.anything(), {
      installFolder: undefined,
    })
    expect(inserted).toHaveLength(0)
  })

  test("the root is made lazily, once per namespace, and only when something is created", async () => {
    const ctx = ctxWithInsertSpy()
    const result = await resolveManifests(ctx as never, manifests(), {
      skipMapped: false,
      mayUse: allowAll,
      installFolder: { templateName: "Starter", mode: "create" },
    })
    // Nothing asked for the folder yet: no empty folder is left behind.
    expect(inserted).toHaveLength(0)
    expect(result.installFolderId).toBeNull()

    const tagsOptions = mocks.tags.mock.calls[0][2] as {
      installFolder: () => Promise<string>
    }
    const fieldOptions = mocks.customFields.mock.calls[0][2] as {
      installFolder: () => Promise<string>
    }
    await tagsOptions.installFolder()
    await tagsOptions.installFolder()
    await fieldOptions.installFolder()

    expect(inserted.map((row) => [row.folderType, row.name])).toEqual([
      ["tag", "Starter"],
      ["customField", "Starter"],
    ])
  })

  test("a sync reuses the root the install made", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing-root" })
    const ctx = ctxWithInsertSpy()
    await resolveManifests(ctx as never, manifests(), {
      skipMapped: true,
      mayUse: allowAll,
      installFolder: { templateName: "Starter", mode: "reuse" },
    })
    const { installFolder } = mocks.tags.mock.calls[0][2] as {
      installFolder: () => Promise<string>
    }
    expect(await installFolder()).toBe("existing-root")
    expect(inserted).toHaveLength(0)
  })
})
