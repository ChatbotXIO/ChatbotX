// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  readTemplateStoreSnapshot: vi.fn(),
  canSearchKeywordOnSnapshot: vi.fn(),
  resolveServingHost: vi.fn(),
  listPublishedCategories: vi.fn(),
  listPublishedTemplates: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isForeignKeyViolationError: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  getInstallCounts: vi.fn(),
  templateRepository: {},
  templateStoreRepository: {
    listPublishedCategories: mocks.listPublishedCategories,
    listPublishedTemplates: mocks.listPublishedTemplates,
  },
}))
vi.mock("../src/template/store-cache", () => ({
  readTemplateStoreSnapshot: mocks.readTemplateStoreSnapshot,
  canSearchKeywordOnSnapshot: mocks.canSearchKeywordOnSnapshot,
}))
vi.mock("../src/platform/settings", () => ({
  resolveServingHost: mocks.resolveServingHost,
}))
vi.mock("../src/enterprise/tenant/admin-scope", () => ({
  resolveTenantAdminScope: vi.fn(),
}))

const { templateStoreService } = await import("../src/template/store.service")

const snapshotRow = (id: string, channels: string[]) => ({
  listingId: `l${id}`,
  templateId: `t${id}`,
  name: "Shop",
  description: null,
  imageUrl: null,
  publisherName: null,
  shareToken: "tok",
  categoryIds: [],
  languages: [],
  channels,
  shareExpiresAtMicros: null,
  searchName: "shop",
  searchPublisherName: null,
})

/** The cache read of a tenant whose store holds these rows. */
const snapshotOf = (rows: ReturnType<typeof snapshotRow>[]) => ({
  snapshot: {
    tenantId: "1",
    version: "1",
    loadedAtMicros: "1000",
    rows,
    categories: [],
  },
  requestNowMicros: "1000",
  keywordLiteral: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.canSearchKeywordOnSnapshot.mockResolvedValue(true)
  mocks.resolveServingHost.mockResolvedValue({
    tenantId: "1",
    appUrl: "https://app.example.test",
  })
})

describe("templateStoreService.listPublished with a keyword the database cannot search on a snapshot", () => {
  test("skips the snapshot and answers from the SQL queries with every filter", async () => {
    mocks.canSearchKeywordOnSnapshot.mockResolvedValue(false)
    mocks.listPublishedCategories.mockResolvedValue([{ id: "5", name: "Shop" }])
    mocks.listPublishedTemplates.mockResolvedValue([
      { ...snapshotRow("1", ["telegram"]), languages: ["en"] },
    ])

    const result = await templateStoreService.listPublished({
      tenantId: "1",
      categoryId: "5",
      keyword: "shop",
      language: "en",
      channel: "telegram",
    })

    expect(mocks.canSearchKeywordOnSnapshot).toHaveBeenCalledWith("shop")
    expect(mocks.readTemplateStoreSnapshot).not.toHaveBeenCalled()
    expect(mocks.listPublishedTemplates).toHaveBeenCalledWith({
      tenantId: "1",
      categoryId: "5",
      keyword: "shop",
      language: "en",
      channel: "telegram",
    })
    expect(mocks.listPublishedCategories).toHaveBeenCalledWith("1")
    expect(mocks.resolveServingHost).toHaveBeenCalledWith("1")
    expect(result.categories).toEqual([{ id: "5", name: "Shop" }])
    expect(result.templates).toHaveLength(1)
    expect(result.templates[0]).toMatchObject({
      templateId: "t1",
      name: "Shop",
      channels: ["telegram"],
      languages: ["en"],
      shareToken: "tok",
    })
    expect(result.templates[0]?.shareUrl).toContain("https://app.example.test")
  })
})

describe("templateStoreService.listPublished channels", () => {
  test("returns each listing's channels", async () => {
    mocks.readTemplateStoreSnapshot.mockResolvedValue(
      snapshotOf([
        snapshotRow("1", ["whatsapp", "line"]),
        snapshotRow("2", []),
      ]),
    )

    const { templates } = await templateStoreService.listPublished({
      tenantId: "1",
    })

    expect(templates.map((template) => template.channels)).toEqual([
      ["whatsapp", "line"],
      [],
    ])
  })

  test("drops a stored channel the product no longer lists", async () => {
    mocks.readTemplateStoreSnapshot.mockResolvedValue(
      snapshotOf([
        snapshotRow("1", ["whatsapp", "fax", "omnichannel", "telegram"]),
      ]),
    )

    const { templates } = await templateStoreService.listPublished({
      tenantId: "1",
    })

    expect(templates[0]?.channels).toEqual(["whatsapp", "telegram"])
  })

  test("keeps listings of the filtered channel and those naming no known channel", async () => {
    mocks.readTemplateStoreSnapshot.mockResolvedValue(
      snapshotOf([
        snapshotRow("1", ["telegram"]),
        snapshotRow("2", ["whatsapp"]),
        snapshotRow("3", []),
        snapshotRow("4", ["fax"]),
      ]),
    )

    const { templates } = await templateStoreService.listPublished({
      tenantId: "1",
      channel: "telegram",
    })

    expect(templates.map((template) => template.templateId)).toEqual([
      "t1",
      "t3",
      "t4",
    ])
  })
})
