import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type HomeTemplateStore,
  type HomeTemplatesRequest,
  resolveHomeTemplatesView,
} from "@/features/workspaces/lib/home-templates-view"

const mocks = vi.hoisted(() => ({
  hasPublished: vi.fn(),
  findPublicByShareToken: vi.fn(),
  loadStoreCatalog: vi.fn(),
  getTenantSettings: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@chatbotx.io/business", () => ({
  templateStoreService: { hasPublished: mocks.hasPublished },
  templateService: { findPublicByShareToken: mocks.findPublicByShareToken },
}))
vi.mock("@/features/template-store/queries/load-store-catalog", () => ({
  loadStoreCatalog: mocks.loadStoreCatalog,
  resolveTemplateCoverUrl: (
    imageUrl: string | null,
    branding: { storageUrl: string; faviconUrl: string },
  ) => (imageUrl ? `${branding.storageUrl}/${imageUrl}` : branding.faviconUrl),
}))
vi.mock("@/features/tenant/utils", () => ({
  getTenantSettings: mocks.getTenantSettings,
}))
vi.mock("@/lib/log", () => ({ logger: { error: mocks.loggerError } }))

import { loadHomeTemplateStore } from "@/features/workspaces/lib/load-home-template-store"

const catalog = { tenantName: "Acme", categories: [], templates: [] }
const publicTemplate = {
  id: "11",
  name: "Welcome flow",
  imageUrl: "cover.png",
} as unknown as NonNullable<HomeTemplateStore["openedTemplate"]>["template"]
const openedTemplate = {
  template: publicTemplate,
  shareToken: "tok-11",
  imageUrl: "https://files.test/cover.png",
}

const store = (overrides: Partial<HomeTemplateStore>): HomeTemplateStore => ({
  status: "ready",
  hasTemplates: false,
  catalog: null,
  openedTemplate: null,
  ...overrides,
})

const request = (
  tab: HomeTemplatesRequest["tab"],
  templateKey: string | null = null,
): HomeTemplatesRequest => ({ tab, templateKey })

describe("resolveHomeTemplatesView", () => {
  test.each([
    {
      name: "workspaces tab, store has templates: offer the tab",
      request: request("workspaces"),
      store: store({ hasTemplates: true }),
      expected: {
        activeTab: "workspaces",
        showTemplatesTab: true,
        panel: "none",
        redirectToHome: false,
      },
    },
    {
      name: "workspaces tab, empty store: hide the tab",
      request: request("workspaces"),
      store: store({ hasTemplates: false }),
      expected: {
        activeTab: "workspaces",
        showTemplatesTab: false,
        panel: "none",
        redirectToHome: false,
      },
    },
    {
      name: "workspaces tab, store not readable: hide the tab",
      request: request("workspaces"),
      store: store({ status: "failed", hasTemplates: true }),
      expected: {
        activeTab: "workspaces",
        showTemplatesTab: false,
        panel: "none",
        redirectToHome: false,
      },
    },
    {
      name: "templates tab with templates: show the catalog",
      request: request("templates"),
      store: store({ hasTemplates: true, catalog }),
      expected: {
        activeTab: "templates",
        showTemplatesTab: true,
        panel: "catalog",
        redirectToHome: false,
      },
    },
    {
      name: "templates tab, nothing published (stale link): back to the plain URL",
      request: request("templates"),
      store: store({ hasTemplates: false, catalog }),
      expected: {
        activeTab: "workspaces",
        showTemplatesTab: false,
        panel: "none",
        redirectToHome: true,
      },
    },
    {
      name: "templates tab, store not readable: keep the tab and say so",
      request: request("templates"),
      store: store({ status: "failed" }),
      expected: {
        activeTab: "templates",
        showTemplatesTab: true,
        panel: "failed",
        redirectToHome: false,
      },
    },
    {
      name: "a template opened in the tab: show it to install, inside the tab",
      request: request("templates", "tok-11"),
      store: store({ hasTemplates: true, openedTemplate }),
      expected: {
        activeTab: "templates",
        showTemplatesTab: true,
        panel: "template",
        redirectToHome: false,
      },
    },
    {
      name: "an unknown or disabled key: say so inside the tab, no redirect",
      request: request("templates", "gone"),
      store: store({ hasTemplates: true, openedTemplate: null }),
      expected: {
        activeTab: "templates",
        showTemplatesTab: true,
        panel: "templateUnavailable",
        redirectToHome: false,
      },
    },
    {
      name: "a template opened but the read failed: the failure wins",
      request: request("templates", "tok-11"),
      store: store({ status: "failed" }),
      expected: {
        activeTab: "templates",
        showTemplatesTab: true,
        panel: "failed",
        redirectToHome: false,
      },
    },
    {
      name: "a key on the workspaces tab is ignored",
      request: request("workspaces", "tok-11"),
      store: store({ hasTemplates: true }),
      expected: {
        activeTab: "workspaces",
        showTemplatesTab: true,
        panel: "none",
        redirectToHome: false,
      },
    },
  ])("$name", ({ request: input, store: state, expected }) => {
    expect(resolveHomeTemplatesView(input, state)).toEqual(expected)
  })
})

describe("loadHomeTemplateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTenantSettings.mockResolvedValue({
      storageUrl: "https://files.test",
      faviconUrl: "https://app.test/favicon.png",
    })
  })

  test("the workspaces tab asks the store one cheap question and loads nothing else", async () => {
    mocks.hasPublished.mockResolvedValue(true)

    const result = await loadHomeTemplateStore({
      tab: "workspaces",
      templateKey: "tok-11",
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(mocks.hasPublished).toHaveBeenCalledTimes(1)
    expect(mocks.hasPublished).toHaveBeenCalledWith({ tenantId: "tenant-7" })
    expect(mocks.loadStoreCatalog).not.toHaveBeenCalled()
    expect(mocks.findPublicByShareToken).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: "ready",
      hasTemplates: true,
      catalog: null,
      openedTemplate: null,
    })
  })

  test("the templates tab loads the catalog with cards that open inside the tab", async () => {
    mocks.loadStoreCatalog.mockResolvedValue({
      ...catalog,
      templates: [{ templateId: "1" }],
    })

    const result = await loadHomeTemplateStore({
      tab: "templates",
      templateKey: null,
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(mocks.loadStoreCatalog).toHaveBeenCalledTimes(1)
    const [tenantId, buildHref] = mocks.loadStoreCatalog.mock.calls[0]
    expect(tenantId).toBe("tenant-7")
    expect(buildHref({ templateId: "1", shareToken: "tok 1" })).toBe(
      "/?tab=templates&key=tok+1",
    )
    expect(mocks.hasPublished).not.toHaveBeenCalled()
    expect(mocks.findPublicByShareToken).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: "ready",
      hasTemplates: true,
      openedTemplate: null,
    })
  })

  test("an empty catalog is a ready store with nothing in it", async () => {
    mocks.loadStoreCatalog.mockResolvedValue(catalog)

    const result = await loadHomeTemplateStore({
      tab: "templates",
      templateKey: null,
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(result).toEqual({
      status: "ready",
      hasTemplates: false,
      catalog,
      openedTemplate: null,
    })
  })

  test("a template opened in the tab is read by its share key, with its cover", async () => {
    mocks.findPublicByShareToken.mockResolvedValue(publicTemplate)

    const result = await loadHomeTemplateStore({
      tab: "templates",
      templateKey: "tok-11",
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(mocks.findPublicByShareToken).toHaveBeenCalledWith("tok-11")
    expect(mocks.loadStoreCatalog).not.toHaveBeenCalled()
    expect(result.openedTemplate).toEqual({
      template: publicTemplate,
      shareToken: "tok-11",
      imageUrl: "https://files.test/cover.png",
    })
  })

  test("an unknown or disabled share key opens nothing", async () => {
    mocks.findPublicByShareToken.mockResolvedValue(undefined)

    const result = await loadHomeTemplateStore({
      tab: "templates",
      templateKey: "gone",
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(result).toMatchObject({ status: "ready", openedTemplate: null })
  })

  test.each([
    {
      name: "the probe fails",
      tab: "workspaces" as const,
      templateKey: null,
      arrange: () => mocks.hasPublished.mockRejectedValue(new Error("db down")),
    },
    {
      name: "the catalog load fails",
      tab: "templates" as const,
      templateKey: null,
      arrange: () =>
        mocks.loadStoreCatalog.mockRejectedValue(new Error("db down")),
    },
    {
      name: "the opened template read fails",
      tab: "templates" as const,
      templateKey: "tok-11",
      arrange: () =>
        mocks.findPublicByShareToken.mockRejectedValue(new Error("db down")),
    },
  ])("never rejects when $name: logs it and reports a failed store", async ({
    tab,
    templateKey,
    arrange,
  }) => {
    arrange()

    const result = await loadHomeTemplateStore({
      tab,
      templateKey,
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(result).toEqual({
      status: "failed",
      hasTemplates: false,
      catalog: null,
      openedTemplate: null,
    })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0][0]).toMatchObject({
      err: expect.any(Error),
      tab,
    })
  })

  test("a failing tenant lookup is not the store's failure: it rejects and logs nothing", async () => {
    const tenantId = Promise.reject(new Error("no tenant"))
    // The page awaits the same promise; mark it handled here as it would be there.
    tenantId.catch(() => undefined)

    await expect(
      loadHomeTemplateStore({ tab: "workspaces", templateKey: null, tenantId }),
    ).rejects.toThrow("no tenant")
    expect(mocks.hasPublished).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })
})
