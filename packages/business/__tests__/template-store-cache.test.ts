// @vitest-environment node

import { TEMPLATE_STORE_MAX_LISTINGS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  versionRead: vi.fn(),
  readSnapshot: vi.fn(),
  readKeywordCollationSupport: vi.fn(),
  listPublishedCategories: vi.fn(),
  listPublishedTemplates: vi.fn(),
  hasPublishedTemplates: vi.fn(),
  resolveServingHost: vi.fn(),
  getOrLoad: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isForeignKeyViolationError: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  getInstallCounts: vi.fn(),
  templateRepository: {},
  cacheVersionRepository: { read: mocks.versionRead },
  templateStoreRepository: {
    readSnapshot: mocks.readSnapshot,
    readKeywordCollationSupport: mocks.readKeywordCollationSupport,
    listPublishedCategories: mocks.listPublishedCategories,
    listPublishedTemplates: mocks.listPublishedTemplates,
    hasPublishedTemplates: mocks.hasPublishedTemplates,
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: mocks.logError,
    warn: mocks.logWarn,
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))
// The cache primitive has its own tests; here it is a stand-in whose behaviour the test drives.
vi.mock("@chatbotx.io/redis", () => ({
  createReadCache: () => ({ getOrLoad: mocks.getOrLoad }),
}))
vi.mock("../src/platform/settings", () => ({
  resolveServingHost: mocks.resolveServingHost,
}))
vi.mock("../src/enterprise/tenant/admin-scope", () => ({
  resolveTenantAdminScope: vi.fn(),
}))

type Support = {
  isUtf8: boolean
  nameUsesDefaultDeterministicCollation: boolean
  publisherNameUsesDefaultDeterministicCollation: boolean
}
const SUPPORTED: Support = {
  isUtf8: true,
  nameUsesDefaultDeterministicCollation: true,
  publisherNameUsesDefaultDeterministicCollation: true,
}

const snapshotRow = (id: string, name = `n${id}`) => ({
  listingId: `l${id}`,
  templateId: id,
  name,
  description: null,
  imageUrl: null,
  publisherName: null,
  shareToken: `tok${id}`,
  categoryIds: [],
  languages: [],
  channels: [],
  shareExpiresAtMicros: null,
  searchName: name.toLowerCase(),
  searchPublisherName: null,
})

const snapshotOf = (
  rows: ReturnType<typeof snapshotRow>[],
  tenantId = "1",
) => ({
  tenantId,
  version: "3",
  loadedAtMicros: "1000",
  rows,
  categories: [],
})

/** A cache whose entry is already there: the loader is never called. */
const hit = (snapshot: ReturnType<typeof snapshotOf>) =>
  mocks.getOrLoad.mockResolvedValue({ version: "3", value: snapshot })

/** A cache with nothing stored: runs the loader. */
const miss = () =>
  mocks.getOrLoad.mockImplementation(
    async (input: { load: () => Promise<unknown> }) => await input.load(),
  )

const { templateStoreService: service } = await import(
  "../src/template/store.service"
)
const {
  canSearchKeywordOnSnapshot,
  readTemplateStoreSnapshot,
  resetTemplateStoreCacheStateForTests,
} = await import("../src/template/store-cache")

beforeEach(() => {
  vi.clearAllMocks()
  // The cache module memoises the collation check per process.
  resetTemplateStoreCacheStateForTests()
  mocks.versionRead.mockResolvedValue({
    version: "3",
    databaseNowMicros: "2000",
    lowercased: null,
  })
  mocks.readKeywordCollationSupport.mockResolvedValue(SUPPORTED)
  mocks.resolveServingHost.mockResolvedValue({
    tenantId: "1",
    appUrl: "https://app.example.test",
  })
  mocks.listPublishedCategories.mockResolvedValue([])
  mocks.listPublishedTemplates.mockResolvedValue([])
  mocks.hasPublishedTemplates.mockResolvedValue(false)
})

describe("readTemplateStoreSnapshot", () => {
  test("a hit costs one database round trip: the version read only", async () => {
    hit(snapshotOf([snapshotRow("1")]))

    const read = await readTemplateStoreSnapshot("1")

    expect(mocks.versionRead).toHaveBeenCalledTimes(1)
    expect(mocks.versionRead).toHaveBeenCalledWith({
      namespace: "template-store",
      scopeId: "1",
      lowercase: undefined,
    })
    expect(mocks.readSnapshot).not.toHaveBeenCalled()
    expect(mocks.readKeywordCollationSupport).not.toHaveBeenCalled()
    expect(read.requestNowMicros).toBe("2000")
    expect(read.keywordLiteral).toBeNull()
    expect(mocks.getOrLoad).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "1", entry: "snapshot", version: "3" }),
    )
  })

  test("a miss loads the snapshot from the database for that tenant", async () => {
    miss()
    mocks.readSnapshot.mockResolvedValue(snapshotOf([snapshotRow("1")]))

    const read = await readTemplateStoreSnapshot("1")

    expect(mocks.readSnapshot).toHaveBeenCalledWith("1")
    expect(read.snapshot.rows).toHaveLength(1)
  })

  test("asks the database to lower the full escaped pattern and unescapes the result", async () => {
    hit(snapshotOf([]))
    mocks.versionRead.mockResolvedValue({
      version: "3",
      databaseNowMicros: "2000",
      lowercased: "%50\\%\\_\\\\x%",
    })

    const read = await readTemplateStoreSnapshot("1", "  50%_\\X ")

    expect(mocks.versionRead).toHaveBeenCalledWith(
      expect.objectContaining({ lowercase: "%50\\%\\_\\\\X%" }),
    )
    expect(read.keywordLiteral).toBe("50%_\\x")
  })

  test("a blank keyword is no keyword and skips the collation check", async () => {
    hit(snapshotOf([]))

    const read = await readTemplateStoreSnapshot("1", "   ")

    expect(mocks.readKeywordCollationSupport).not.toHaveBeenCalled()
    expect(mocks.versionRead).toHaveBeenCalledWith(
      expect.objectContaining({ lowercase: undefined }),
    )
    expect(read.keywordLiteral).toBeNull()
  })

  test("the collation check runs once per process and a failed check is retried", async () => {
    hit(snapshotOf([]))
    mocks.readKeywordCollationSupport.mockRejectedValueOnce(new Error("down"))

    await expect(canSearchKeywordOnSnapshot("a")).resolves.toBe(false)
    await canSearchKeywordOnSnapshot("a")
    await canSearchKeywordOnSnapshot("b")

    expect(mocks.readKeywordCollationSupport).toHaveBeenCalledTimes(2)
  })

  test("a failed collation read falls back to SQL for that call, logs the error and is not memoized", async () => {
    const failure = new Error("down")
    mocks.readKeywordCollationSupport.mockRejectedValueOnce(failure)

    expect(await canSearchKeywordOnSnapshot("a")).toBe(false)
    expect(mocks.logError).toHaveBeenCalledWith(
      { err: failure },
      expect.any(String),
    )
    expect(await canSearchKeywordOnSnapshot("a")).toBe(true)
    expect(mocks.readKeywordCollationSupport).toHaveBeenCalledTimes(2)
  })

  test("listPublished falls back to the SQL queries when the collation read fails", async () => {
    mocks.readKeywordCollationSupport.mockRejectedValueOnce(new Error("down"))

    await service.listPublished({ tenantId: "1", keyword: "shop" })

    expect(mocks.listPublishedTemplates).toHaveBeenCalled()
    expect(mocks.versionRead).not.toHaveBeenCalled()
  })

  test("an unsupported database reports it for a keyword and logs once", async () => {
    mocks.readKeywordCollationSupport.mockResolvedValue({
      ...SUPPORTED,
      isUtf8: false,
    })

    expect(await canSearchKeywordOnSnapshot("a")).toBe(false)
    expect(await canSearchKeywordOnSnapshot("b")).toBe(false)

    expect(mocks.logError).toHaveBeenCalledTimes(1)
  })

  test("no keyword, or a blank one, is always searchable without a collation check", async () => {
    mocks.readKeywordCollationSupport.mockResolvedValue({
      ...SUPPORTED,
      isUtf8: false,
    })

    expect(await canSearchKeywordOnSnapshot()).toBe(true)
    expect(await canSearchKeywordOnSnapshot("  ")).toBe(true)
    expect(mocks.readKeywordCollationSupport).not.toHaveBeenCalled()
  })

  test("a nondeterministic collation on either column is unsupported", async () => {
    hit(snapshotOf([]))
    mocks.readKeywordCollationSupport.mockResolvedValue({
      ...SUPPORTED,
      publisherNameUsesDefaultDeterministicCollation: false,
    })

    expect(await canSearchKeywordOnSnapshot("a")).toBe(false)
  })

  test("the cache is told to reject a snapshot of another tenant, once, and reload it", async () => {
    const foreign = snapshotOf([snapshotRow("9", "foreign")], "2")
    const own = snapshotOf([snapshotRow("1")], "1")
    // A stand-in with the primitive's accept contract: a rejected cached value is a miss.
    mocks.getOrLoad.mockImplementation(
      async (input: {
        accept: (value: unknown) => boolean
        load: () => Promise<unknown>
      }) =>
        input.accept(foreign)
          ? { version: "3", value: foreign }
          : await input.load(),
    )
    mocks.readSnapshot.mockResolvedValue(own)

    const read = await readTemplateStoreSnapshot("1")

    expect(read.snapshot.tenantId).toBe("1")
    expect(read.snapshot.rows.map((row) => row.name)).toEqual(["n1"])
    expect(mocks.readSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.logError).toHaveBeenCalledTimes(1)
  })

  test("a malformed same-tenant cached value is rejected by accept and repaired by a reload", async () => {
    const own = snapshotOf([snapshotRow("1")], "1")
    const malformed = [
      { tenantId: "1" },
      { ...own, version: "03" },
      { ...own, loadedAtMicros: 5 },
      { ...own, rows: undefined },
      { ...own, categories: "x" },
    ]
    mocks.getOrLoad.mockImplementation(
      async (input: {
        accept: (value: unknown) => boolean
        load: () => Promise<unknown>
      }) => {
        for (const value of malformed) {
          expect(input.accept(value)).toBe(false)
        }
        expect(input.accept(own)).toBe(true)
        return await input.load()
      },
    )
    mocks.readSnapshot.mockResolvedValue(own)

    const read = await readTemplateStoreSnapshot("1")

    expect(read.snapshot.rows).toHaveLength(1)
    expect(mocks.readSnapshot).toHaveBeenCalledTimes(1)
  })

  test("accept passes the tenant's own snapshot without logging", async () => {
    const own = snapshotOf([], "1")
    mocks.getOrLoad.mockImplementation(
      (input: { accept: (value: unknown) => boolean }) => {
        expect(input.accept(own)).toBe(true)
        return Promise.resolve({ version: "3", value: own })
      },
    )

    await readTemplateStoreSnapshot("1")

    expect(mocks.logError).not.toHaveBeenCalled()
  })

  test("PostgreSQL down fails the request: nothing is served without a version", async () => {
    mocks.versionRead.mockRejectedValue(new Error("pg down"))

    await expect(readTemplateStoreSnapshot("1")).rejects.toThrow("pg down")
    expect(mocks.getOrLoad).not.toHaveBeenCalled()
  })

  test("a Redis outage inside the cache still serves: the stand-in falls back to the loader", async () => {
    miss()
    mocks.readSnapshot.mockResolvedValue(snapshotOf([snapshotRow("1")]))

    const read = await readTemplateStoreSnapshot("1")

    expect(read.snapshot.rows).toHaveLength(1)
  })
})

describe("templateStoreService on the cache", () => {
  test("listPublished on a hit runs no store query and resolves the host every request", async () => {
    hit(snapshotOf([snapshotRow("1")]))

    const first = await service.listPublished({ tenantId: "1" })
    await service.listPublished({ tenantId: "1" })

    expect(first.templates.map((template) => template.templateId)).toEqual([
      "1",
    ])
    expect(first.templates[0].shareUrl).toContain("https://app.example.test/")
    expect(mocks.resolveServingHost).toHaveBeenCalledTimes(2)
    expect(mocks.readSnapshot).not.toHaveBeenCalled()
    expect(mocks.listPublishedTemplates).not.toHaveBeenCalled()
    expect(mocks.listPublishedCategories).not.toHaveBeenCalled()
  })

  test("listPublished uses the host's url for the links, so another tenant host changes them", async () => {
    hit(snapshotOf([snapshotRow("1")]))
    mocks.resolveServingHost.mockResolvedValue({
      tenantId: "1",
      appUrl: "https://other.example.test",
    })

    const { templates } = await service.listPublished({ tenantId: "1" })

    expect(templates[0].shareUrl).toContain("https://other.example.test/")
  })

  test("hasPublished never resolves the host, and a failure there cannot affect it", async () => {
    hit(snapshotOf([snapshotRow("1")]))
    mocks.resolveServingHost.mockRejectedValue(new Error("host down"))

    await expect(service.hasPublished({ tenantId: "1" })).resolves.toBe(true)
    expect(mocks.resolveServingHost).not.toHaveBeenCalled()
    expect(mocks.hasPublishedTemplates).not.toHaveBeenCalled()
  })

  test("hasPublished is false when every share has expired at the database clock", async () => {
    hit(snapshotOf([{ ...snapshotRow("1"), shareExpiresAtMicros: "1500" }]))

    await expect(service.hasPublished({ tenantId: "1" })).resolves.toBe(false)
  })

  test("a failing host fails listPublished as it does today", async () => {
    hit(snapshotOf([snapshotRow("1")]))
    mocks.resolveServingHost.mockRejectedValue(new Error("host down"))

    await expect(service.listPublished({ tenantId: "1" })).rejects.toThrow(
      "host down",
    )
  })

  describe("over the listing cap", () => {
    const overCap = () =>
      snapshotOf(
        Array.from({ length: TEMPLATE_STORE_MAX_LISTINGS + 1 }, (_, i) =>
          snapshotRow(String(i + 1)),
        ),
      )

    test("listPublished runs only the two list queries", async () => {
      hit(overCap())

      mocks.listPublishedTemplates.mockResolvedValue([
        { ...snapshotRow("1"), languages: ["en"], channels: ["zalo"] },
      ])

      const result = await service.listPublished({
        tenantId: "1",
        categoryId: "5",
        keyword: "shop",
        language: "vi",
        channel: "zalo",
        viewerLocale: "vi",
      })

      expect(mocks.listPublishedCategories).toHaveBeenCalledWith("1")
      expect(mocks.listPublishedTemplates).toHaveBeenCalledWith({
        tenantId: "1",
        categoryId: "5",
        keyword: "shop",
        language: "vi",
        channel: "zalo",
      })
      expect(result.templates.map((template) => template.section)).toEqual([
        "hidden",
      ])
      expect(mocks.hasPublishedTemplates).not.toHaveBeenCalled()
      expect(mocks.logWarn).not.toHaveBeenCalled()
    })

    test("the over-cap warning is logged once per snapshot load, with the tenant", async () => {
      miss()
      mocks.readSnapshot.mockResolvedValue(overCap())

      await readTemplateStoreSnapshot("1")

      expect(mocks.logWarn).toHaveBeenCalledTimes(1)
      expect(mocks.logWarn).toHaveBeenCalledWith(
        { tenantId: "1" },
        expect.any(String),
      )
    })

    test("listPublished with an invalid category id skips the template query like today", async () => {
      hit(overCap())

      await service.listPublished({ tenantId: "1", categoryId: "abc" })

      expect(mocks.listPublishedCategories).toHaveBeenCalled()
      expect(mocks.listPublishedTemplates).not.toHaveBeenCalled()
    })

    test("hasPublished runs only the probe", async () => {
      hit(overCap())
      mocks.hasPublishedTemplates.mockResolvedValue(true)

      await expect(service.hasPublished({ tenantId: "1" })).resolves.toBe(true)

      expect(mocks.hasPublishedTemplates).toHaveBeenCalledWith("1")
      expect(mocks.listPublishedCategories).not.toHaveBeenCalled()
      expect(mocks.listPublishedTemplates).not.toHaveBeenCalled()
    })
  })

  test("an unsupported database sends keyword search to the SQL queries", async () => {
    hit(snapshotOf([snapshotRow("1")]))
    mocks.readKeywordCollationSupport.mockResolvedValue({
      ...SUPPORTED,
      isUtf8: false,
    })

    mocks.listPublishedTemplates.mockResolvedValue([
      { ...snapshotRow("1"), languages: ["en"] },
    ])

    const result = await service.listPublished({
      tenantId: "1",
      categoryId: "5",
      keyword: "shop",
      language: "vi",
      channel: "zalo",
      viewerLocale: "vi",
    })

    expect(mocks.listPublishedTemplates).toHaveBeenCalledWith({
      tenantId: "1",
      categoryId: "5",
      keyword: "shop",
      language: "vi",
      channel: "zalo",
    })
    expect(result.templates.map((template) => template.section)).toEqual([
      "hidden",
    ])
    expect(mocks.listPublishedCategories).toHaveBeenCalledWith("1")
    // The snapshot is neither version-read nor loaded.
    expect(mocks.versionRead).not.toHaveBeenCalled()
    expect(mocks.readSnapshot).not.toHaveBeenCalled()
  })

  test("a keyword on a supported database filters the snapshot with the lowered literal", async () => {
    hit(snapshotOf([snapshotRow("1", "Shop Bot"), snapshotRow("2", "Other")]))
    mocks.versionRead.mockResolvedValue({
      version: "3",
      databaseNowMicros: "2000",
      lowercased: "%shop%",
    })

    const { templates } = await service.listPublished({
      tenantId: "1",
      keyword: "SHOP",
    })

    expect(templates.map((template) => template.templateId)).toEqual(["1"])
    expect(mocks.listPublishedTemplates).not.toHaveBeenCalled()
  })
})
