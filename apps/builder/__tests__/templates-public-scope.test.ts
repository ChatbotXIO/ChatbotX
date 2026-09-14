// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const templateService = {
  list: vi.fn(),
  listSelectableResources: vi.fn(),
  listInstallations: vi.fn(),
  createOrUpdate: vi.fn(),
  enqueueInstallation: vi.fn(),
  findByIdOrFail: vi.fn(),
  softDelete: vi.fn(),
  updateShareSettings: vi.fn(),
  updateInstallationAutoUpdate: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  templateService,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { templatesPublicRouter } = await import(
  "../src/features/templates/api/public"
)

const TOKEN = "cbx_ws_fixture"
const timestamp = new Date("2026-01-01T00:00:00.000Z")

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const template = {
  id: "1",
  workspaceId: "publisher-workspace",
  tenantId: "publisher-tenant",
  createdBy: "user-1",
  payload: { formatVersion: 1 },
  name: "Welcome template",
  description: "A reusable welcome flow",
  imageUrl: null,
  publisherName: null,
  youtubeVideoId: null,
  testLink: null,
  shareEnabled: true,
  shareToken: "share-token",
  shareExpiresAt: null,
  categoryCounts: {
    flows: 1,
    products: 0,
    aiFunctions: 0,
    aiAgents: 0,
    calendars: 0,
    webchats: 0,
    keywords: 0,
    entryPointLinks: 0,
    triggers: 0,
    fbCommentAutomations: 0,
    settings: 0,
    customFields: 0,
    tags: 0,
    productCategories: 0,
  },
  createInstallFolder: true,
  defaultAutoUpdate: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const installation = {
  id: "2",
  workspaceId: "ws-1",
  templateId: "1",
  templateName: "Welcome template",
  status: "pending",
  warningCount: 0,
  errorMessage: null,
  resourceCount: 0,
  installFolderId: null,
  autoUpdate: false,
  sourceUpdatedAt: null,
  completedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const templateInput = {
  name: "Welcome template",
  description: "A reusable welcome flow",
  selection: { flows: { mode: "all" } },
  defaultPermissions: { allowEdit: true, allowDelete: false },
  createInstallFolder: true,
  defaultAutoUpdate: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: templates public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/templates route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(templatesPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'workspace' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/templates route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    templateService.list.mockResolvedValue([template])

    await expect(invoke(templatesPublicRouter.list)).resolves.toMatchObject({
      data: [expect.objectContaining({ id: "1" })],
      pageCount: 1,
    })
  })

  test.each([
    [
      "POST /v1/templates",
      () => invoke(templatesPublicRouter.create, templateInput),
    ],
    [
      "POST /v1/templates/installations",
      () =>
        invoke(templatesPublicRouter.install, { shareToken: "share-token" }),
    ],
    [
      "PATCH /v1/templates/{id}",
      () =>
        invoke(templatesPublicRouter.update, {
          id: "1",
          ...templateInput,
        }),
    ],
    [
      "DELETE /v1/templates/{id}",
      () => invoke(templatesPublicRouter.delete, { id: "1" }),
    ],
    [
      "PATCH /v1/templates/{id}/share-settings",
      () =>
        invoke(templatesPublicRouter.updateShareSettings, {
          id: "1",
          shareEnabled: true,
        }),
    ],
    [
      "PATCH /v1/templates/installations/{id}/auto-update",
      () =>
        invoke(templatesPublicRouter.updateInstallationAutoUpdate, {
          id: "2",
          autoUpdate: true,
        }),
    ],
  ])("a read_only token is denied %s before any service call", async (_label, run) => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(templateService.createOrUpdate).not.toHaveBeenCalled()
    expect(templateService.enqueueInstallation).not.toHaveBeenCalled()
    expect(templateService.softDelete).not.toHaveBeenCalled()
    expect(templateService.updateShareSettings).not.toHaveBeenCalled()
    expect(templateService.updateInstallationAutoUpdate).not.toHaveBeenCalled()
  })

  describe("cross-workspace isolation: workspaceId always comes from the token", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
      templateService.list.mockResolvedValue([template])
      templateService.listSelectableResources.mockResolvedValue({
        items: [{ id: "100", name: "Welcome flow" }],
        nextCursor: null,
        total: 1,
      })
      templateService.listInstallations.mockResolvedValue([installation])
      templateService.createOrUpdate.mockResolvedValue(template)
      templateService.enqueueInstallation.mockResolvedValue(installation)
      templateService.findByIdOrFail.mockResolvedValue(template)
      templateService.softDelete.mockResolvedValue(undefined)
      templateService.updateShareSettings.mockResolvedValue(template)
      templateService.updateInstallationAutoUpdate.mockResolvedValue(undefined)
    })

    test("scopes every templates service call to the authenticated workspace, not path ids", async () => {
      await invoke(templatesPublicRouter.list)
      await invoke(templatesPublicRouter.listSelectableResources, {
        category: "flows",
        keyword: "Welcome",
        cursor: "10",
        limit: 20,
      })
      await invoke(templatesPublicRouter.listInstallations)
      await invoke(templatesPublicRouter.create, templateInput)
      await invoke(templatesPublicRouter.install, { shareToken: "share-token" })
      await invoke(templatesPublicRouter.get, { id: "999999" })
      await invoke(templatesPublicRouter.update, {
        id: "999999",
        ...templateInput,
      })
      await invoke(templatesPublicRouter.delete, {
        id: "999999",
      })
      await invoke(templatesPublicRouter.updateShareSettings, {
        id: "999999",
        shareEnabled: true,
      })
      await invoke(templatesPublicRouter.updateInstallationAutoUpdate, {
        id: "888888",
        autoUpdate: true,
      })

      expect(templateService.list).toHaveBeenCalledWith("ws-1")
      expect(templateService.listSelectableResources).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        category: "flows",
        keyword: "Welcome",
        cursor: "10",
        limit: 20,
      })
      expect(templateService.listInstallations).toHaveBeenCalledWith("ws-1")
      expect(templateService.createOrUpdate).toHaveBeenNthCalledWith(1, {
        ...templateInput,
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        createdBy: null,
      })
      expect(templateService.enqueueInstallation).toHaveBeenCalledWith({
        shareToken: "share-token",
        workspaceId: "ws-1",
        installedBy: null,
      })
      expect(templateService.findByIdOrFail).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        templateId: "999999",
      })
      expect(templateService.createOrUpdate).toHaveBeenNthCalledWith(2, {
        ...templateInput,
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        createdBy: null,
        existingTemplateId: "999999",
      })
      expect(templateService.softDelete).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        templateId: "999999",
      })
      expect(templateService.updateShareSettings).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        templateId: "999999",
        shareEnabled: true,
        shareExpiresAt: null,
      })
      expect(templateService.updateInstallationAutoUpdate).toHaveBeenCalledWith(
        {
          workspaceId: "ws-1",
          installationId: "888888",
          autoUpdate: true,
        },
      )
    })
  })
})
