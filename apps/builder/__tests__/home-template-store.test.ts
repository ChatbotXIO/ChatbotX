import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type HomeTemplateStore,
  resolveHomeTemplatesView,
} from "@/features/workspaces/lib/home-templates-view"

const mocks = vi.hoisted(() => ({
  hasPublished: vi.fn(),
  loadStoreCatalog: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@chatbotx.io/business", () => ({
  templateStoreService: { hasPublished: mocks.hasPublished },
}))
vi.mock("@/features/template-store/queries/load-store-catalog", () => ({
  loadStoreCatalog: mocks.loadStoreCatalog,
}))
vi.mock("@/lib/log", () => ({ logger: { error: mocks.loggerError } }))

import { loadHomeTemplateStore } from "@/features/workspaces/lib/load-home-template-store"

const catalog = { tenantName: "Acme", categories: [], templates: [] }

const store = (overrides: Partial<HomeTemplateStore>): HomeTemplateStore => ({
  status: "ready",
  hasTemplates: false,
  catalog: null,
  ...overrides,
})

describe("resolveHomeTemplatesView", () => {
  test.each([
    {
      name: "workspaces tab, store has templates: offer the tab",
      tab: "workspaces" as const,
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
      tab: "workspaces" as const,
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
      tab: "workspaces" as const,
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
      tab: "templates" as const,
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
      tab: "templates" as const,
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
      tab: "templates" as const,
      store: store({ status: "failed" }),
      expected: {
        activeTab: "templates",
        showTemplatesTab: true,
        panel: "failed",
        redirectToHome: false,
      },
    },
  ])("$name", ({ tab, store: input, expected }) => {
    expect(resolveHomeTemplatesView(tab, input)).toEqual(expected)
  })
})

describe("loadHomeTemplateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("the workspaces tab asks the store one cheap question and loads no catalog", async () => {
    mocks.hasPublished.mockResolvedValue(true)

    const result = await loadHomeTemplateStore({
      tab: "workspaces",
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(mocks.hasPublished).toHaveBeenCalledTimes(1)
    expect(mocks.hasPublished).toHaveBeenCalledWith({ tenantId: "tenant-7" })
    expect(mocks.loadStoreCatalog).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: "ready",
      hasTemplates: true,
      catalog: null,
    })
  })

  test("the templates tab loads the catalog and answers from it, without the probe", async () => {
    mocks.loadStoreCatalog.mockResolvedValue({
      ...catalog,
      templates: [{ templateId: "1" }],
    })

    const result = await loadHomeTemplateStore({
      tab: "templates",
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(mocks.loadStoreCatalog).toHaveBeenCalledWith("tenant-7")
    expect(mocks.hasPublished).not.toHaveBeenCalled()
    expect(result.status).toBe("ready")
    expect(result.hasTemplates).toBe(true)
    expect(result.catalog?.templates).toHaveLength(1)
  })

  test("an empty catalog is a ready store with nothing in it", async () => {
    mocks.loadStoreCatalog.mockResolvedValue(catalog)

    const result = await loadHomeTemplateStore({
      tab: "templates",
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(result).toEqual({ status: "ready", hasTemplates: false, catalog })
  })

  test.each([
    {
      name: "the probe fails",
      tab: "workspaces" as const,
      arrange: () => mocks.hasPublished.mockRejectedValue(new Error("db down")),
    },
    {
      name: "the catalog load fails",
      tab: "templates" as const,
      arrange: () =>
        mocks.loadStoreCatalog.mockRejectedValue(new Error("db down")),
    },
  ])("never rejects when $name: logs it and reports a failed store", async ({
    tab,
    arrange,
  }) => {
    arrange()

    const result = await loadHomeTemplateStore({
      tab,
      tenantId: Promise.resolve("tenant-7"),
    })

    expect(result).toEqual({
      status: "failed",
      hasTemplates: false,
      catalog: null,
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
      loadHomeTemplateStore({ tab: "workspaces", tenantId }),
    ).rejects.toThrow("no tenant")
    expect(mocks.hasPublished).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })
})
