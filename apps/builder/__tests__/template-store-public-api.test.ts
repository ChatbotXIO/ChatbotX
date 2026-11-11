// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import type { z } from "zod"
import type { listTemplateStorePublicRequest } from "../src/features/templates/schema/store"

const {
  findWorkspaceByTokenHash,
  listPublished,
  resolveTenantSettings,
  getAccessState,
  isAtLimit,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  listPublished: vi.fn(),
  resolveTenantSettings: vi.fn(),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  templateStoreService: { listPublished },
  resolveTenantSettings,
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))
vi.mock("@/lib/rate-limit/api-rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit/api-rate-limit")>()),
  assertApiNotRateLimited: () => Promise.resolve(),
}))

const { call } = await import("@orpc/server")
const { templateStorePublicRouter } = await import(
  "../src/features/templates/api/public/store"
)

const authResult = (permission: "full" | "read_only") => ({
  workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "7" },
  apiToken: { id: "token-1", permission, scopes: null },
})

type StoreListInput = z.input<typeof listTemplateStorePublicRequest>

// Tests also send keys and values the schema must reject or ignore, hence `object`.
const invoke = (input: object) =>
  call(templateStorePublicRouter.list, input as StoreListInput, {
    context: {
      headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }),
      resHeaders: new Headers(),
    },
  })

const storedTemplate = (imageUrl: string | null) => ({
  templateId: "11",
  name: "Welcome",
  description: null,
  publisherName: "Acme",
  imageUrl,
  categoryIds: ["3"],
  shareToken: "key-1",
  shareUrl: "https://app.example.test/t/template?id=11&key=key-1",
})

describe("template store public API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))
    resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example.test",
      faviconUrl: "https://app.example.test/favicon.png",
    })
    listPublished.mockResolvedValue({
      categories: [{ id: "3", name: "Flows" }],
      templates: [storedTemplate("covers/a.png"), storedTemplate(null)],
    })
  })

  test("lists the store of the token workspace's tenant, never one taken from input", async () => {
    await invoke({ categoryId: "3", keyword: "welc", tenantId: "999" })

    expect(listPublished).toHaveBeenCalledTimes(1)
    expect(listPublished).toHaveBeenCalledWith({
      tenantId: "7",
      categoryId: "3",
      keyword: "welc",
    })
    expect(resolveTenantSettings).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("returns absolute cover urls with the store icon as fallback", async () => {
    const result = await invoke({})

    expect(result.categories).toEqual([{ id: "3", name: "Flows" }])
    expect(result.templates.map((template) => template.imageUrl)).toEqual([
      "https://files.example.test/covers/a.png",
      "https://app.example.test/favicon.png",
    ])
    expect(result.templates[0]).toMatchObject({
      templateId: "11",
      shareToken: "key-1",
      shareUrl: "https://app.example.test/t/template?id=11&key=key-1",
    })
  })

  test("a read-only token may read the store", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    await expect(invoke({})).resolves.toMatchObject({
      templates: expect.any(Array),
    })
  })

  test("rejects a category id that is not a number or a keyword that is too long", async () => {
    await expect(invoke({ categoryId: "abc" })).rejects.toThrow()
    await expect(invoke({ keyword: "x".repeat(101) })).rejects.toThrow()
    expect(listPublished).not.toHaveBeenCalled()
  })
})
