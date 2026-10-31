// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  requestTemplateInstall,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  requestTemplateInstall: vi.fn(),
}))

const templateService = {
  list: vi.fn(),
  listPage: vi.fn(),
  createOrUpdate: vi.fn(),
  getDetailOrFail: vi.fn(),
  softDelete: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  templateService,
  templateInstallationRequestService: {},
  resolveTenantSettings: vi.fn(),
}))

vi.mock("../src/features/templates/lib/request-install", () => ({
  requestTemplateInstall,
  enqueueInstall: vi.fn(),
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

// Same stub as the other public-scope suites: the session auth stack is
// irrelevant here and unsafe to initialize in a unit test.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { templatesPublicRouter, templateInstallationsPublicRouter } =
  await import("../src/features/templates/api/public")

const TOKEN = "cbx_ws_fixture"

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
  apiToken: { id: "token-1", permission, scopes },
})

const context = {
  context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
}

const savedTemplate = {
  id: "101",
  name: "Welcome",
  description: null,
  imageUrl: null,
  publisherName: null,
  youtubeVideoId: null,
  testLink: null,
  selection: {},
  defaultPermissions: { allowEdit: true, allowDelete: true },
  createInstallFolder: false,
  defaultAutoUpdate: false,
  shareEnabled: false,
  shareExpiresAt: null,
  categoryCounts: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const createInput = {
  name: "Welcome",
  selection: {},
  defaultPermissions: { allowEdit: true, allowDelete: true },
  createInstallFolder: false,
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
  test("a contacts-scoped token is denied GET /v1/templates with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      call(templatesPublicRouter.list, {}, context),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'templates' scope",
    })
  })

  test("a contacts-scoped token is denied POST /v1/template-installations", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      call(
        templateInstallationsPublicRouter.install,
        { shareToken: "abc" },
        context,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(requestTemplateInstall).not.toHaveBeenCalled()
  })

  test("an unrestricted token lists templates without the snapshot or selection", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    templateService.listPage.mockResolvedValue({
      items: [{ ...savedTemplate, installCount: 3, payload: { secret: true } }],
      nextCursor: null,
    })

    const result = await call(templatesPublicRouter.list, {}, context)

    expect(result.nextCursor).toBeNull()
    expect(result.items[0]).toMatchObject({ id: "101", installCount: 3 })
    expect(result.items[0]).not.toHaveProperty("payload")
    expect(result.items[0]).not.toHaveProperty("selection")
  })
})

describe("real router: templates public API acts as the token", () => {
  test("a full token saves a template as an API-token actor with no creator", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null, "full"))
    templateService.createOrUpdate.mockResolvedValue({ id: "101" })
    templateService.getDetailOrFail.mockResolvedValue(savedTemplate)

    await call(templatesPublicRouter.create, createInput, context)

    expect(templateService.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        createdBy: null,
        actor: { kind: "apiToken", permission: "full" },
      }),
    )
  })

  test("a read-only token cannot save a template", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null, "read_only"))

    await expect(
      call(templatesPublicRouter.create, createInput, context),
    ).rejects.toThrow("Read-only token cannot perform this operation")
    expect(templateService.createOrUpdate).not.toHaveBeenCalled()
  })

  test("installing records no installer user and forwards allowDuplicate", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    requestTemplateInstall.mockResolvedValue({ installationId: "201" })

    await expect(
      call(
        templateInstallationsPublicRouter.install,
        { shareToken: "abc", allowDuplicate: true },
        context,
      ),
    ).resolves.toEqual({ installationId: "201" })

    expect(requestTemplateInstall).toHaveBeenCalledWith({
      shareToken: "abc",
      targetWorkspaceId: "ws-1",
      installedBy: null,
      actor: { kind: "apiToken", permission: "full" },
      allowDuplicate: true,
    })
  })
})
