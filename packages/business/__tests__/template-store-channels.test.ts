// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
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
vi.mock("../src/platform/settings", () => ({
  resolveServingHost: async () => ({
    tenantId: "1",
    appUrl: "https://app.example.test",
  }),
}))
vi.mock("../src/enterprise/tenant/admin-scope", () => ({
  resolveTenantAdminScope: vi.fn(),
}))

const { templateStoreService } = await import("../src/template/store.service")

const publishedRow = (channels: string[]) => ({
  listingId: "l1",
  templateId: "t1",
  name: "Shop",
  description: null,
  imageUrl: null,
  publisherName: null,
  shareToken: "tok",
  categoryIds: [],
  languages: [],
  channels,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listPublishedCategories.mockResolvedValue([])
})

describe("templateStoreService.listPublished channels", () => {
  test("returns each listing's channels", async () => {
    mocks.listPublishedTemplates.mockResolvedValue([
      publishedRow(["whatsapp", "line"]),
      publishedRow([]),
    ])

    const { templates } = await templateStoreService.listPublished({
      tenantId: "1",
    })

    expect(templates.map((template) => template.channels)).toEqual([
      ["whatsapp", "line"],
      [],
    ])
  })

  test("drops a stored channel the product no longer lists", async () => {
    mocks.listPublishedTemplates.mockResolvedValue([
      publishedRow(["whatsapp", "fax", "omnichannel", "telegram"]),
    ])

    const { templates } = await templateStoreService.listPublished({
      tenantId: "1",
    })

    expect(templates[0]?.channels).toEqual(["whatsapp", "telegram"])
  })

  test("forwards the channel filter to the repository", async () => {
    mocks.listPublishedTemplates.mockResolvedValue([])

    await templateStoreService.listPublished({
      tenantId: "1",
      channel: "telegram",
    })

    expect(mocks.listPublishedTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "1", channel: "telegram" }),
    )
  })
})
