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
  listInstallationsPage: vi.fn(),
  listPublisherInstallations: vi.fn(),
}
const templateInstallationRequestService = { getDetail: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  templateService,
  templateInstallationRequestService,
  resolveTenantSettings: vi.fn(),
}))

const templateUninstallService = {
  uninstallAsPublisher: vi.fn(),
  uninstallAsInstaller: vi.fn(),
}
vi.mock("@chatbotx.io/business/template-uninstall", () => ({
  templateUninstallService,
}))

vi.mock("../src/features/templates/lib/request-install", () => ({
  requestTemplateInstall: vi.fn(),
  enqueueInstall: vi.fn(),
  enqueueSync: vi.fn(),
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { templatesPublicRouter, templateInstallationsPublicRouter } =
  await import("../src/features/templates/api/public")
const { IDEMPOTENCY_EXEMPT_READ_PATHS } = await import(
  "../src/lib/idempotency/constants"
)

const context = {
  context: { headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }) },
}

const installationRow = {
  id: "201",
  templateName: "Welcome",
  status: "failed" as const,
  errorCode: "templateInstallFailed",
  resourceCount: 0,
  warningCount: 0,
  autoUpdate: false,
  createdAt: new Date(),
  completedAt: null,
  updateAvailable: false,
  uninstalledByKind: null,
  uninstallCounts: null,
  uninstallState: "none" as const,
  activeSync: false,
  // Fields that must never leave the service layer.
  errorMessage: "ECONNREFUSED 10.0.0.5:5432 secret-internal-detail",
  permissions: { allowEdit: false },
  claimToken: "claim-secret",
  claimedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  findWorkspaceByTokenHash.mockResolvedValue({
    workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
    apiToken: { id: "token-1", permission: "full", scopes: null },
  })
})

describe("template installations never leak internals", () => {
  test("the list drops errorMessage, permissions and claim fields", async () => {
    templateService.listInstallationsPage.mockResolvedValue({
      items: [installationRow],
      nextCursor: null,
    })

    const result = await call(
      templateInstallationsPublicRouter.list,
      {},
      context,
    )

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("secret-internal-detail")
    expect(serialized).not.toContain("claim-secret")
    expect(result.items[0]).not.toHaveProperty("errorMessage")
    expect(result.items[0]).not.toHaveProperty("permissions")
    expect(result.items[0]).toMatchObject({
      errorCode: "templateInstallFailed",
      updateAvailable: false,
      uninstalledBy: null,
    })
  })

  test("the detail drops errorMessage even when the service returns it", async () => {
    templateInstallationRequestService.getDetail.mockResolvedValue({
      ...installationRow,
      attempts: 1,
      sourceVersion: 1,
      lastSyncedAt: null,
      syncInProgress: false,
      uninstallErrorCode: null,
      installedByName: null,
      warnings: [],
      warningSummary: [],
    })

    const result = await call(
      templateInstallationsPublicRouter.get,
      { id: "201" },
      context,
    )

    expect(JSON.stringify(result)).not.toContain("secret-internal-detail")
    expect(result).not.toHaveProperty("errorMessage")
  })
})

describe("template installations pagination", () => {
  test("forwards the cursor and limit, and returns the end-of-list cursor as null", async () => {
    templateService.listInstallationsPage.mockResolvedValue({
      items: [],
      nextCursor: null,
    })

    const result = await call(
      templateInstallationsPublicRouter.list,
      { cursor: "300", limit: 100 },
      context,
    )

    expect(templateService.listInstallationsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        beforeId: "300",
        limit: 100,
      }),
    )
    expect(result).toEqual({ items: [], nextCursor: null })
  })

  test.each([0, 101])("rejects a page size of %i", async (limit) => {
    await expect(
      call(templateInstallationsPublicRouter.list, { limit }, context),
    ).rejects.toMatchObject({ code: "invalidRequestData" })
    expect(templateService.listInstallationsPage).not.toHaveBeenCalled()
  })
})

describe("publisher views mask foreign workspaces", () => {
  test("installers are listed for the token's workspace only, without workspace ids", async () => {
    templateService.listPublisherInstallations.mockResolvedValue({
      items: [
        {
          publisherRef: "a".repeat(32),
          workspaceName: "Acme",
          workspaceId: "ws-foreign-999",
          installCount: 1,
          totalInstallEvents: 1,
          lastInstalledAt: null,
          oldestVersion: 1,
          autoUpdate: false,
          active: true,
          uninstallState: "none",
          eligibleForUninstall: true,
          uninstallCounts: null,
        },
      ],
      nextCursor: null,
    })

    const result = await call(
      templatesPublicRouter.listInstallers,
      { id: "101" },
      context,
    )

    expect(templateService.listPublisherInstallations).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", templateId: "101" }),
    )
    expect(JSON.stringify(result)).not.toContain("ws-foreign-999")
    expect(result.items[0]).toMatchObject({ workspaceName: "Acme" })
  })
})

describe("uninstall requests answer with state only", () => {
  test("the publisher gets the opaque reference back, never an installation or operation id", async () => {
    templateUninstallService.uninstallAsPublisher.mockResolvedValue({
      installations: 2,
      operationId: "op-secret-1",
      uninstallState: "pending",
    })

    const result = await call(
      templatesPublicRouter.uninstallInstaller,
      { id: "101", installerId: "a".repeat(32) },
      context,
    )

    expect(result).toEqual({
      publisherRef: "a".repeat(32),
      uninstallState: "pending",
    })
    expect(JSON.stringify(result)).not.toContain("op-secret-1")
    // The token acts as the workspace owner, so the audit summary names them.
    expect(templateUninstallService.uninstallAsPublisher).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: "owner-1" }),
    )
  })

  test("the installer gets its installation and operation back", async () => {
    templateUninstallService.uninstallAsInstaller.mockResolvedValue({
      installations: 1,
      operationId: "op-1",
      uninstallState: "pending",
    })

    const result = await call(
      templateInstallationsPublicRouter.uninstall,
      { id: "201" },
      context,
    )

    expect(templateUninstallService.uninstallAsInstaller).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: "owner-1" }),
    )
    expect(result).toEqual({
      installationId: "201",
      operationId: "op-1",
      uninstallState: "pending",
    })
  })
})

describe("idempotency applies to template writes only", () => {
  test.each([
    "/v1/templates",
    "/v1/templates/{id}",
    "/v1/templates/{id}/share",
    "/v1/templates/{id}/share/rotate",
    "/v1/template-installations",
    "/v1/template-installations/{id}/retry",
    "/v1/template-installations/{id}/sync",
    "/v1/template-installations/{id}/uninstall",
  ])("%s keeps the Idempotency-Key guard", (path) => {
    expect(IDEMPOTENCY_EXEMPT_READ_PATHS.has(path)).toBe(false)
  })

  test.each([
    "/v1/templates/dependencies-preview",
    "/v1/templates/locked-resources",
  ])("the read-only %s is exempt, so a replay never returns stale data", (path) => {
    expect(IDEMPOTENCY_EXEMPT_READ_PATHS.has(path)).toBe(true)
  })
})
