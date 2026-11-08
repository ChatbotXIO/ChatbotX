// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  preview,
  previewWithCollisions,
  findByIdOrFail,
  updateShareSettings,
  rotateShareToken,
  listPage,
  resolveTemplateShareUrl,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  preview: vi.fn(),
  previewWithCollisions: vi.fn(),
  findByIdOrFail: vi.fn(),
  updateShareSettings: vi.fn(),
  rotateShareToken: vi.fn(),
  listPage: vi.fn(),
  resolveTemplateShareUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const permissions = await import(
    "../../../packages/business/src/template/permissions"
  )
  return {
    workspaceApiTokenService: { findWorkspaceByTokenHash },
    isWorkspaceScheduledForDeletion,
    userQuotaService: { getAccessState },
    quotaEnforcementService: { isAtLimit },
    templateService: {
      findByIdOrFail,
      updateShareSettings,
      rotateShareToken,
      listPage,
    },
    templateInstallationRequestService: { preview, previewWithCollisions },
    previewSelectionDependencies: vi.fn(),
    assertCanManageTemplates: permissions.assertCanManageTemplates,
    resolveTemplateShareUrl,
  }
})

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

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { templatesPublicRouter, templatePreviewsPublicRouter } = await import(
  "../src/features/templates/api/public"
)

const authResult = (permission: "full" | "read_only") => ({
  workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
  apiToken: { id: "token-1", permission, scopes: null },
})

const shareRow = {
  id: "101",
  shareToken: "tok",
  shareEnabled: true,
  shareExpiresAt: null,
}

const context = {
  context: { headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }) },
}

const installablePreview = {
  installable: true as const,
  template: {
    name: "Welcome",
    description: null,
    imageUrl: null,
    publisherName: null,
    youtubeVideoId: null,
    testLink: null,
    categoryCounts: {},
  },
  requiredInboxes: [],
  requiredChannels: [],
  existingInstallation: null,
  publisherUninstallDisclosure: {
    version: 1,
    publisherSees: [],
    publisherCan: [],
    uninstallDeletes: "",
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("templates.list paging", () => {
  const row = {
    id: "101",
    name: "Welcome",
    description: null,
    imageUrl: null,
    publisherName: null,
    youtubeVideoId: null,
    testLink: null,
    defaultPermissions: {},
    createInstallFolder: false,
    defaultAutoUpdate: false,
    shareEnabled: false,
    shareExpiresAt: null,
    categoryCounts: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    installCount: 3,
  }

  test("first page without input, passing the cursor back through", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))
    listPage.mockResolvedValue({ items: [row], nextCursor: "next" })

    const first = await call(templatesPublicRouter.list, {}, context)
    expect(first.nextCursor).toBe("next")
    expect(first.items).toHaveLength(1)
    expect(listPage).toHaveBeenLastCalledWith({
      workspaceId: "ws-1",
      cursor: undefined,
      limit: undefined,
    })

    listPage.mockResolvedValue({ items: [], nextCursor: null })
    await call(
      templatesPublicRouter.list,
      { cursor: "next", limit: 10 },
      context,
    )
    expect(listPage).toHaveBeenLastCalledWith({
      workspaceId: "ws-1",
      cursor: "next",
      limit: 10,
    })
  })

  test("rejects a limit above the maximum", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))
    await expect(
      call(templatesPublicRouter.list, { limit: 101 }, context),
    ).rejects.toBeDefined()
  })
})

describe("templates.getLink", () => {
  test("refuses a read_only token: the link is an install capability", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    await expect(
      call(templatesPublicRouter.getLink, { id: "101" }, context),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(findByIdOrFail).not.toHaveBeenCalled()
  })

  test("hands a full token the share url", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))
    findByIdOrFail.mockResolvedValue(shareRow)
    resolveTemplateShareUrl.mockImplementation(
      ({ shareToken }: { shareToken: string }) =>
        Promise.resolve(`https://app.test/t/${shareToken}`),
    )

    await expect(
      call(templatesPublicRouter.getLink, { id: "101" }, context),
    ).resolves.toMatchObject({
      url: "https://app.test/t/tok",
      templateId: "101",
      templateKey: "tok",
    })
  })

  test("updateShare and rotateShare return the id and key too", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))
    resolveTemplateShareUrl.mockImplementation(
      ({ shareToken }: { shareToken: string }) =>
        Promise.resolve(`https://app.test/t/${shareToken}`),
    )
    updateShareSettings.mockResolvedValue(shareRow)
    rotateShareToken.mockResolvedValue({ ...shareRow, shareToken: "new-tok" })

    await expect(
      call(
        templatesPublicRouter.updateShare,
        { id: "101", enabled: true },
        context,
      ),
    ).resolves.toMatchObject({ templateId: "101", templateKey: "tok" })
    await expect(
      call(templatesPublicRouter.rotateShare, { id: "101" }, context),
    ).resolves.toMatchObject({
      url: "https://app.test/t/new-tok",
      templateId: "101",
      templateKey: "new-tok",
    })
  })
})

describe("templatePreviews.get", () => {
  test("tells a read_only token the link is fine but it can not install, without computing collisions", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))
    preview.mockResolvedValue(installablePreview)

    const result = await call(
      templatePreviewsPublicRouter.get,
      { id: "abcdefghijklmnopqrstuvwxyz012345" },
      context,
    )

    expect(result).toEqual({
      installable: false,
      reason: "templateManagePermissionDenied",
    })
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { kind: "apiToken", permission: "full" },
      }),
    )
    expect(previewWithCollisions).not.toHaveBeenCalled()
  })

  test("still reports a dead link to a read_only token as the link's own reason", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))
    preview.mockResolvedValue({
      installable: false,
      reason: "templateShareDisabled",
    })

    await expect(
      call(
        templatePreviewsPublicRouter.get,
        { id: "abcdefghijklmnopqrstuvwxyz012345" },
        context,
      ),
    ).resolves.toEqual({
      installable: false,
      reason: "templateShareDisabled",
    })
  })

  test("a full token gets the collision prediction as before", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))
    previewWithCollisions.mockResolvedValue({
      ...installablePreview,
      collisions: [],
      collisionSummary: { create: 0, reuse: 0, rename: 0, bind: 0, unbound: 0 },
    })

    const result = await call(
      templatePreviewsPublicRouter.get,
      { id: "abcdefghijklmnopqrstuvwxyz012345" },
      context,
    )

    expect(result).toMatchObject({ installable: true })
    expect(previewWithCollisions).toHaveBeenCalledTimes(1)
    expect(preview).not.toHaveBeenCalled()
  })
})
