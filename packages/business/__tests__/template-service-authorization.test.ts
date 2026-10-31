// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  templateFindFirst: vi.fn(),
  installationFindFirst: vi.fn(),
  findLivePayload: vi.fn(),
  updateReturning: vi.fn(),
  buildTemplateSnapshot: vi.fn(),
  findMembership: vi.fn(),
  findOrFail: vi.fn(),
  failUnclaimed: vi.fn(),
  findNameAndEmail: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  insertVersion: vi.fn(),
  findVersion: vi.fn(),
  enqueueFanOut: vi.fn(),
  pruneVersions: vi.fn(),
  saveWithVersion: vi.fn(),
  softDelete: vi.fn(),
  rotateShareToken: vi.fn(),
  findMediaFileByPath: vi.fn(),
}))

vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findByPath: mocks.findMediaFileByPath },
}))

const updateChain = {
  set: () => ({
    where: () => ({ returning: mocks.updateReturning }),
  }),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      templateModel: { findFirst: mocks.templateFindFirst },
      templateInstallationModel: { findFirst: mocks.installationFindFirst },
    },
    update: () => updateChain,
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({ update: () => updateChain }),
  },
  sql: vi.fn(),
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  templateInstallationModel: {},
  templateModel: {},
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    failUnclaimed: mocks.failUnclaimed,
    findByIdAndWorkspace: mocks.installationFindFirst,
  },
  templateRepository: {
    findLive: mocks.templateFindFirst,
    findLiveById: mocks.templateFindFirst,
    findLiveByShareToken: mocks.templateFindFirst,
    findInstallSource: mocks.templateFindFirst,
    findLivePayload: mocks.findLivePayload,
    saveWithVersion: mocks.saveWithVersion,
    softDelete: mocks.softDelete,
    rotateShareToken: mocks.rotateShareToken,
  },
  templateSelectableResourceRepository: {},
  templateVersionRepository: {
    lockVersions: vi.fn(),
    insert: mocks.insertVersion,
    prune: mocks.pruneVersions,
    find: mocks.findVersion,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueFanOutTemplateUpdate: mocks.enqueueFanOut,
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("@chatbotx.io/flow-config", () => ({
  // `__counts` is shorthand for how many of each category the payload holds.
  parseTemplateExport: (payload: { __counts?: Record<string, number> }) => {
    const counts = payload?.__counts ?? {}
    const list = (name: string) =>
      Array.from({ length: counts[name] ?? 0 }, () => ({}))
    const keyed = (name: string) =>
      Object.fromEntries(list(name).map((entry, index) => [`k${index}`, entry]))
    return {
      ok: true,
      data: {
        ...payload,
        manifests: {
          tags: keyed("tags"),
          customFields: keyed("customFields"),
          productCategories: keyed("productCategories"),
        },
        resources: {
          settings: { savedReplies: list("settings"), botFields: [] },
          flows: list("flows"),
          products: list("products"),
          aiFunctions: list("aiFunctions"),
          aiAgents: list("aiAgents"),
          calendars: list("calendars"),
          webchats: list("webchats"),
          keywords: list("keywords"),
          entryPointLinks: list("entryPointLinks"),
          triggers: list("triggers"),
          fbCommentAutomations: list("fbCommentAutomations"),
          sequences: list("sequences"),
          aiMcpServers: list("aiMcpServers"),
          aiFiles: list("aiFiles"),
          questionnaires: list("questionnaires"),
          couponTopics: list("couponTopics"),
          pipelines: list("pipelines"),
        },
      },
    }
  },
}))
vi.mock("../src/workspace", () => ({
  workspaceService: { findOrFail: mocks.findOrFail },
}))
vi.mock("../src/workspace-member", () => ({
  workspaceMemberService: { findMembership: mocks.findMembership },
}))
vi.mock("../src/user", () => ({
  userService: { findNameAndEmail: mocks.findNameAndEmail },
}))
vi.mock("../src/workspace-support-access/resolve-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess,
}))
// The payload hash looks adapters up for their fingerprints; this test needs none.
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: () => undefined,
}))
vi.mock("../src/template/snapshot.service", () => ({
  buildTemplateSnapshot: mocks.buildTemplateSnapshot,
}))

const { templateService } = await import("../src/template/service")

const FLOWS_ONLY = {
  payload: { formatVersion: 1 },
  categoryCounts: { flows: 1 },
}
const flowsActor = { kind: "member", permissions: { flows: true } } as const
const saveInput = {
  workspaceId: "ws-1",
  tenantId: "1",
  createdBy: "user-1",
  name: "Shop",
  selection: { mode: "all" },
  defaultPermissions: {},
  createInstallFolder: false,
  defaultAutoUpdate: false,
  actor: flowsActor,
} as never

describe("templateService authorization and soft-delete guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1, products: 2 },
    })
  })

  test("createOrUpdate rejects a category the publisher lacks, on the final payload", async () => {
    await expect(
      templateService.createOrUpdate(saveInput),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("createOrUpdate rejects an actor who cannot manage templates", async () => {
    await expect(
      templateService.createOrUpdate({
        ...(saveInput as object),
        actor: { kind: "member", permissions: { ecommerce: true } },
      } as never),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mocks.buildTemplateSnapshot).not.toHaveBeenCalled()
  })

  test("createOrUpdate cannot update a soft-deleted template", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue(undefined)

    await expect(
      templateService.createOrUpdate({
        ...(saveInput as object),
        existingTemplateId: "tpl-1",
      } as never),
    ).rejects.toThrow("Template not found")
  })

  test("createOrUpdate fails when the template is deleted between check and write", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue({ id: "tpl-1", payload: {} })
    mocks.saveWithVersion.mockResolvedValue(undefined)

    await expect(
      templateService.createOrUpdate({
        ...(saveInput as object),
        existingTemplateId: "tpl-1",
      } as never),
    ).rejects.toThrow("Template not found")
  })

  test("a cover image that is not a media-library file of the workspace is refused", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue(FLOWS_ONLY)
    mocks.findMediaFileByPath.mockResolvedValue(undefined)

    await expect(
      templateService.createOrUpdate({
        ...(saveInput as object),
        imageUrl: "public/space/other-ws/secret.png",
      } as never),
    ).rejects.toMatchObject({ code: "validation", field: "imageUrl" })
    expect(mocks.findMediaFileByPath).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      path: "public/space/other-ws/secret.png",
    })
  })

  test("a media-library file that is not an image is refused as the cover", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue(FLOWS_ONLY)
    mocks.findMediaFileByPath.mockResolvedValue({
      id: "file-2",
      mimeType: "application/pdf",
    })

    await expect(
      templateService.createOrUpdate({
        ...(saveInput as object),
        imageUrl: "public/space/ws-1/media/brochure.pdf",
      } as never),
    ).rejects.toMatchObject({ code: "validation", field: "imageUrl" })
  })

  test("a cover image picked from the media library is accepted on update", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue(FLOWS_ONLY)
    mocks.findMediaFileByPath.mockResolvedValue({
      id: "file-1",
      mimeType: "image/png",
    })
    mocks.templateFindFirst.mockResolvedValue({
      id: "tpl-1",
      payload: {},
      imageUrl: null,
    })
    mocks.saveWithVersion.mockResolvedValue({ id: "tpl-1", version: 1 })

    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
      imageUrl: "public/space/ws-1/media/cover.png",
    } as never)

    expect(mocks.saveWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          imageUrl: "public/space/ws-1/media/cover.png",
        }),
      }),
    )
  })

  test("an unchanged cover image saved before the rule is kept without a lookup", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue(FLOWS_ONLY)
    mocks.templateFindFirst.mockResolvedValue({
      id: "tpl-1",
      payload: {},
      imageUrl: "public/space/ws-1/templates/old.png",
    })
    mocks.saveWithVersion.mockResolvedValue({ id: "tpl-1", version: 1 })

    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
      imageUrl: "public/space/ws-1/templates/old.png",
    } as never)

    expect(mocks.findMediaFileByPath).not.toHaveBeenCalled()
    expect(mocks.saveWithVersion).toHaveBeenCalled()
  })

  test("createOrUpdate records the saved version and prunes older ones", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue({ id: "tpl-1", payload: {} })
    mocks.saveWithVersion.mockResolvedValue({
      id: "tpl-1",
      workspaceId: "ws-1",
      version: 4,
    })

    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
    } as never)

    // The repository records the version and prunes inside its transaction.
    expect(mocks.saveWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tpl-1",
        workspaceId: "ws-1",
        snapshot: expect.objectContaining({ payloadHash: expect.any(String) }),
      }),
    )
  })

  test("a template saved before hashes were stored is hashed once for its first save", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue({ id: "tpl-1", payload: {} })
    mocks.saveWithVersion.mockResolvedValue({
      id: "tpl-1",
      workspaceId: "ws-1",
      version: 1,
    })

    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
    } as never)

    expect(mocks.saveWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({ legacyPayloadHash: expect.any(String) }),
    )
  })

  test("the stored payload is re-hashed with the current algorithm on every save", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue({
      id: "tpl-1",
      payload: {},
      payloadHash: "stored",
    })
    mocks.saveWithVersion.mockResolvedValue({
      id: "tpl-1",
      workspaceId: "ws-1",
      version: 1,
    })

    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
    } as never)

    expect(mocks.saveWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({ legacyPayloadHash: expect.any(String) }),
    )
  })

  test("a save that advanced the version starts the auto-update fan-out", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue({
      id: "tpl-1",
      version: 3,
      payload: {},
    })
    mocks.saveWithVersion.mockResolvedValue({
      id: "tpl-1",
      workspaceId: "ws-1",
      version: 4,
    })
    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
    } as never)
    expect(mocks.enqueueFanOut).toHaveBeenCalledWith({
      templateId: "tpl-1",
      workspaceId: "ws-1",
      version: 4,
    })
  })

  test("an identical re-save does not fan out", async () => {
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.templateFindFirst.mockResolvedValue({
      id: "tpl-1",
      version: 4,
      payload: {},
    })
    mocks.saveWithVersion.mockResolvedValue({
      id: "tpl-1",
      workspaceId: "ws-1",
      version: 4,
    })
    await templateService.createOrUpdate({
      ...(saveInput as object),
      existingTemplateId: "tpl-1",
    } as never)
    expect(mocks.enqueueFanOut).not.toHaveBeenCalled()
  })

  test("softDelete cannot delete an already deleted template", async () => {
    mocks.softDelete.mockResolvedValue(false)

    await expect(
      templateService.softDelete({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: flowsActor,
      }),
    ).rejects.toThrow("Template not found")
  })

  const noManageActor = {
    kind: "member",
    permissions: { ecommerce: true },
  } as const

  test.each([
    [
      "softDelete",
      () =>
        templateService.softDelete({
          workspaceId: "ws-1",
          templateId: "tpl-1",
          actor: noManageActor,
        }),
    ],
    [
      "updateShareSettings",
      () =>
        templateService.updateShareSettings({
          workspaceId: "ws-1",
          templateId: "tpl-1",
          shareEnabled: true,
          actor: noManageActor,
        }),
    ],
    [
      "rotateShareToken",
      () =>
        templateService.rotateShareToken({
          workspaceId: "ws-1",
          templateId: "tpl-1",
          actor: noManageActor,
        }),
    ],
  ])("%s rejects an actor who cannot manage templates", async (_name, run) => {
    await expect(run()).rejects.toMatchObject({
      code: "templateManagePermissionDenied",
    })
    expect(mocks.templateFindFirst).not.toHaveBeenCalled()
  })

  test("a read-only API token cannot manage templates", async () => {
    await expect(
      templateService.rotateShareToken({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: { kind: "apiToken", permission: "read_only" },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
  })

  test("rotateShareToken replaces the token of a live template", async () => {
    mocks.rotateShareToken.mockResolvedValue({ id: "tpl-1", shareToken: "new" })

    await expect(
      templateService.rotateShareToken({
        workspaceId: "ws-1",
        templateId: "tpl-1",
        actor: flowsActor,
      }),
    ).resolves.toMatchObject({ shareToken: "new" })
  })

  test("an installation made through an API token skips the per-user permission re-check", async () => {
    mocks.findLivePayload.mockImplementation(async () => ({
      payload: (await mocks.templateFindFirst())?.payload,
    }))
    mocks.installationFindFirst.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      installedBy: null,
      installedByKind: "apiToken",
    })
    mocks.templateFindFirst.mockResolvedValue({
      payload: {},
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: { products: 1 },
    })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "inst-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toMatchObject({ templateName: "Shop" })
    expect(mocks.resolveWorkspaceAccess).not.toHaveBeenCalled()
  })

  test("assertInstallable rejects a target member lacking a category permission", async () => {
    mocks.templateFindFirst.mockResolvedValue({
      shareEnabled: true,
      shareExpiresAt: null,
      tenantId: "1",
      payload: { __counts: { products: 1 } },
      categoryCounts: { products: 1 },
    })
    mocks.findOrFail.mockResolvedValue({ tenantId: "1" })

    await expect(
      templateService.assertInstallable({
        shareToken: "tok",
        targetWorkspaceId: "ws-2",
        actor: flowsActor,
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })
})

describe("templateService.findInstallationByIdOrFail — payload source", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.installationFindFirst.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      sourceVersion: 2,
      installedBy: null,
      installedByKind: "apiToken",
    })
    mocks.templateFindFirst.mockResolvedValue({
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: {},
    })
  })

  test("a pinned version is installed without reading the live payload", async () => {
    mocks.findVersion.mockResolvedValue({ payload: { pinned: true } })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "inst-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toMatchObject({ payload: { pinned: true } })
    expect(mocks.findLivePayload).not.toHaveBeenCalled()
  })

  test("a legacy row with no pinned version falls back to the live payload", async () => {
    mocks.findVersion.mockResolvedValue(undefined)
    mocks.findLivePayload.mockResolvedValue({ payload: { live: true } })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "inst-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toMatchObject({ payload: { live: true } })
  })
})

describe("templateService.findInstallationByIdOrFail", () => {
  const installation = {
    id: "install-1",
    workspaceId: "ws-2",
    templateId: "tpl-1",
    installedBy: "user-1",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.installationFindFirst.mockResolvedValue(installation)
    mocks.findLivePayload.mockImplementation(async () => ({
      payload: (await mocks.templateFindFirst())?.payload,
    }))
    mocks.findNameAndEmail.mockResolvedValue({ name: "A", email: "a@x.io" })
    mocks.findVersion.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockImplementation(
      async ({ realMember }: { realMember?: { permissions: object } }) =>
        realMember ? { member: realMember } : undefined,
    )
  })

  test("a template deleted before the job ran is a missing source", async () => {
    mocks.templateFindFirst.mockResolvedValue(undefined)

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "templateInstallationSourceMissing" })
  })

  test("contents added after the click are authorized against the installer", async () => {
    mocks.templateFindFirst.mockResolvedValue({
      payload: { __counts: { flows: 1, products: 1 } },
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: { flows: 1, products: 1 },
    })
    mocks.findMembership.mockResolvedValue({ permissions: { flows: true } })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("the install is authorized against the pinned payload, not the newer template", async () => {
    // The publisher dropped products from the newest version, but this
    // installation is pinned to one that still installs them.
    mocks.templateFindFirst.mockResolvedValue({
      payload: { __counts: { flows: 1 } },
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: { flows: 1 },
    })
    mocks.findVersion.mockResolvedValue({
      payload: { __counts: { flows: 1, products: 1 } },
    })
    mocks.findMembership.mockResolvedValue({ permissions: { flows: true } })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("an installer who left the workspace is refused", async () => {
    mocks.templateFindFirst.mockResolvedValue({
      payload: { __counts: { flows: 1 } },
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: { flows: 1 },
    })
    mocks.findMembership.mockResolvedValue(undefined)

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("a support-session installer with no WorkspaceMember row passes via resolveWorkspaceAccess", async () => {
    mocks.templateFindFirst.mockResolvedValue({
      payload: { __counts: { flows: 1, products: 1 } },
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: { flows: 1, products: 1 },
    })
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      member: { permissions: { superAdmin: true } },
    })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).resolves.toMatchObject({ templateName: "Shop" })
  })

  test("a support window closed after the click ends the install", async () => {
    mocks.templateFindFirst.mockResolvedValue({
      payload: { __counts: { flows: 1 } },
      name: "Shop",
      createInstallFolder: false,
      categoryCounts: { flows: 1 },
    })
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockResolvedValue(undefined)

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("returns the payload when the installer is still permitted", async () => {
    mocks.templateFindFirst.mockResolvedValue({
      payload: { __counts: { flows: 1 } },
      name: "Shop",
      createInstallFolder: true,
      categoryCounts: { flows: 1 },
    })
    mocks.findMembership.mockResolvedValue({ permissions: { flows: true } })

    await expect(
      templateService.findInstallationByIdOrFail({
        installationId: "install-1",
        workspaceId: "ws-2",
      }),
    ).resolves.toMatchObject({
      templateName: "Shop",
      createInstallFolder: true,
    })
  })
})
