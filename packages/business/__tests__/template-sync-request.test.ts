// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Revocation cleanup has its own suites (unit and real-DB).
vi.mock("../src/template/uninstall-cancel.service", () => ({
  templateUninstallCancelService: {
    cancelPublisherUninstalls: vi.fn().mockResolvedValue(undefined),
  },
}))

const mocks = vi.hoisted(() => ({
  findInstallation: vi.fn(),
  lockInstall: vi.fn(),
  lockVersions: vi.fn(),
  findLatest: vi.fn(),
  findVersion: vi.fn(),
  createMany: vi.fn(),
  findActive: vi.fn(),
  createIfAbsent: vi.fn(),
  candidates: vi.fn(),
  templateFindFirst: vi.fn(),
  updateInstallation: vi.fn(),
  setGrant: vi.fn(),
  closeUnclaimed: vi.fn(),
  listInstalled: vi.fn(),
  listPairCategories: vi.fn(),
  findActiveInstall: vi.fn(),
  uninstallInProgress: vi.fn(),
  findByIdempotencyKey: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const tx = {
    update: () => ({
      set: (values: unknown) => ({
        where: () => mocks.updateInstallation(values),
      }),
    }),
  }
  return {
    db: {
      query: { templateModel: { findFirst: mocks.templateFindFirst } },
      transaction: (callback: (client: unknown) => unknown) => callback(tx),
    },
    eq: vi.fn(),
  }
})
vi.mock("@chatbotx.io/database/schema", () => ({
  templateInstallationModel: {},
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    findByIdAndWorkspace: mocks.findInstallation,
    lockInstallRequest: mocks.lockInstall,
    setPublisherUninstallGrant: mocks.setGrant,
    findActiveBySourceTemplate: mocks.findActiveInstall,
  },
  templateUninstallStateRepository: {
    isInProgress: mocks.uninstallInProgress,
  },
  templateVersionRepository: {
    lockVersions: mocks.lockVersions,
    findLatest: mocks.findLatest,
    find: mocks.findVersion,
  },
  templateInstallationSyncRepository: {
    createManyIfAbsent: mocks.createMany,
    findActiveByInstallation: mocks.findActive,
    closeUnclaimed: mocks.closeUnclaimed,
    listInstalledResources: mocks.listInstalled,
    listInstalledCategoriesByPair: mocks.listPairCategories,
    createIfAbsent: mocks.createIfAbsent,
    findByIdempotencyKey: mocks.findByIdempotencyKey,
    listAutoUpdateCandidates: mocks.candidates,
  },
  templateResourceBackupRepository: {},
}))
let counter = 0
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createId: () => `sync-${++counter}`,
}))

const { templateSyncRequestService: service } = await import(
  "../src/template/sync-request.service"
)

const fullToken = { kind: "apiToken", permission: "full" } as const
const base = {
  workspaceId: "ws-1",
  installationId: "inst-1",
  actor: fullToken,
  trigger: "manual",
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.uninstallInProgress.mockResolvedValue(false)
  mocks.findInstallation.mockResolvedValue({
    id: "inst-1",
    workspaceId: "ws-1",
    templateId: "tpl-1",
    sourceTemplateId: "tpl-1",
    status: "completed",
    sourceDeletedAt: null,
  })
  mocks.templateFindFirst.mockResolvedValue({
    categoryCounts: { flows: 1 },
    defaultAutoUpdate: true,
  })
  mocks.findLatest.mockResolvedValue({ version: 4 })
  mocks.listInstalled.mockResolvedValue([{ category: "flows" }])
  mocks.listPairCategories.mockResolvedValue(["flows"])
  mocks.findActiveInstall.mockResolvedValue(null)
  mocks.findVersion.mockResolvedValue({ version: 5 })
  mocks.createMany.mockImplementation(async (values: object[]) =>
    values.map((value) => ({
      ...value,
      workspaceId: (value as { workspaceId: string }).workspaceId,
    })),
  )
  mocks.findActive.mockResolvedValue(null)
  mocks.findByIdempotencyKey.mockResolvedValue(null)
  mocks.createIfAbsent.mockImplementation(async (values) => ({
    ...values,
    workspaceId: "ws-1",
  }))
})

describe("templateSyncRequestService.request", () => {
  test("queues a sync of the newest version under the install lock", async () => {
    const result = await service.request({ ...base })

    expect(result).toMatchObject({ created: true })
    expect(mocks.lockInstall).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "tpl-1" },
      expect.anything(),
    )
    expect(mocks.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "inst-1",
        trigger: "manual",
        requestedVersion: 4,
      }),
      expect.anything(),
    )
  })

  test("is rejected while an uninstall owns the installation", async () => {
    mocks.uninstallInProgress.mockResolvedValue(true)

    await expect(service.request({ ...base })).rejects.toMatchObject({
      code: "templateUninstallInProgress",
    })
    expect(mocks.createIfAbsent).not.toHaveBeenCalled()
  })

  test("returns the sync already in flight instead of a second one", async () => {
    mocks.findActive.mockResolvedValue({ id: "running-1", workspaceId: "ws-1" })
    const result = await service.request({ ...base })
    expect(result).toEqual({
      syncId: "running-1",
      workspaceId: "ws-1",
      created: false,
    })
    expect(mocks.createIfAbsent).not.toHaveBeenCalled()
  })

  test("rejects a read-only token before touching anything", async () => {
    await expect(
      service.request({
        ...base,
        actor: { kind: "apiToken", permission: "read_only" },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mocks.findInstallation).not.toHaveBeenCalled()
  })

  test.each([
    ["not completed", { status: "failed" }],
    ["source deleted", { sourceDeletedAt: new Date() }],
    ["no template", { templateId: null }],
  ])("refuses an installation that is %s", async (_label, patch) => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      ...patch,
    })
    await expect(service.request({ ...base })).rejects.toMatchObject({
      code: "templateInstallationNotSyncable",
    })
  })

  test("a member lacking a category permission is refused", async () => {
    await expect(
      service.request({
        ...base,
        actor: { kind: "member", permissions: { ecommerce: true } },
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("a reinstall re-enrols the copy with the template default", async () => {
    await service.request({ ...base, trigger: "reinstall" })
    expect(mocks.updateInstallation).toHaveBeenCalledWith({ autoUpdate: true })
  })

  test("a reinstall honours the installer's autoUpdate choice", async () => {
    await service.request({ ...base, trigger: "reinstall", autoUpdate: false })
    expect(mocks.updateInstallation).toHaveBeenCalledWith({ autoUpdate: false })
  })
})

describe("idempotency key", () => {
  // The row the first keyed request created, as the repository would find it.
  const firstRequest = async (input: Record<string, unknown>) => {
    await service.request({
      ...base,
      idempotencyKey: "key-1",
      ...input,
    } as never)
    const created = mocks.createIfAbsent.mock.calls.at(-1)?.[0]
    mocks.findByIdempotencyKey.mockResolvedValue({
      ...created,
      workspaceId: "ws-1",
    })
    mocks.createIfAbsent.mockClear()
    mocks.updateInstallation.mockClear()
  }

  test("a replay of the same request returns the sync it created", async () => {
    await firstRequest({ trigger: "reinstall", autoUpdate: true })

    const replay = await service.request({
      ...base,
      trigger: "reinstall",
      autoUpdate: true,
      idempotencyKey: "key-1",
    })

    expect(replay).toMatchObject({ created: false })
    expect(mocks.createIfAbsent).not.toHaveBeenCalled()
  })

  test("the same key with other reinstall choices is rejected, not silently dropped", async () => {
    await firstRequest({
      trigger: "reinstall",
      autoUpdate: true,
      inboxBindings: { a: "1" },
    })

    for (const changed of [
      { autoUpdate: false, inboxBindings: { a: "1" } },
      { autoUpdate: true, inboxBindings: { a: "2" } },
      {
        autoUpdate: true,
        inboxBindings: { a: "1" },
        acceptPublisherUninstall: false,
      },
    ]) {
      await expect(
        service.request({
          ...base,
          trigger: "reinstall",
          idempotencyKey: "key-1",
          ...changed,
        }),
      ).rejects.toMatchObject({
        code: "idempotencyKeyReused",
        httpStatusCode: 422,
      })
    }
    expect(mocks.createIfAbsent).not.toHaveBeenCalled()
    expect(mocks.updateInstallation).not.toHaveBeenCalled()
  })

  test("a key used for a manual sync is not a reinstall's replay", async () => {
    await firstRequest({ trigger: "manual" })

    await expect(
      service.request({
        ...base,
        trigger: "reinstall",
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({ code: "idempotencyKeyReused" })
  })

  test("the order of the inbox bindings does not change the request", async () => {
    await firstRequest({
      trigger: "reinstall",
      inboxBindings: { a: "1", b: "2" },
    })

    await expect(
      service.request({
        ...base,
        trigger: "reinstall",
        inboxBindings: { b: "2", a: "1" },
        idempotencyKey: "key-1",
      }),
    ).resolves.toMatchObject({ created: false })
  })
})

describe("publisher uninstall consent", () => {
  test("a reinstall restates the consent for the whole pair", async () => {
    await service.request({
      ...base,
      trigger: "reinstall",
      acceptPublisherUninstall: false,
    })
    expect(mocks.setGrant).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "tpl-1", granted: false },
      expect.anything(),
    )
  })

  test("a reinstall that says nothing leaves the consent alone", async () => {
    await service.request({ ...base, trigger: "reinstall" })
    expect(mocks.setGrant).not.toHaveBeenCalled()
  })

  test("a reinstall supersedes an auto-update that is only queued", async () => {
    mocks.findActive.mockResolvedValue({
      id: "queued",
      workspaceId: "ws-1",
      status: "pending",
      trigger: "autoUpdate",
    })
    const result = await service.request({ ...base, trigger: "reinstall" })
    expect(mocks.closeUnclaimed).toHaveBeenCalledWith(
      {
        id: "queued",
        status: "cancelled",
        errorCode: "templateSyncSuperseded",
      },
      expect.anything(),
    )
    expect(result.created).toBe(true)
    expect(result.syncId).not.toBe("queued")
  })

  test("a reinstall does not cancel a sync that is already running", async () => {
    mocks.findActive.mockResolvedValue({
      id: "running",
      workspaceId: "ws-1",
      status: "running",
      trigger: "autoUpdate",
    })
    const result = await service.request({ ...base, trigger: "reinstall" })
    expect(mocks.closeUnclaimed).not.toHaveBeenCalled()
    expect(result).toMatchObject({ syncId: "running", created: false })
  })

  test("the installer's choices hold even when a sync is already queued", async () => {
    mocks.findActive.mockResolvedValue({ id: "queued", workspaceId: "ws-1" })
    const result = await service.request({
      ...base,
      trigger: "reinstall",
      acceptPublisherUninstall: false,
      autoUpdate: false,
      inboxBindings: { "1": "2" },
    })
    expect(result).toMatchObject({ syncId: "queued", created: false })
    expect(mocks.setGrant).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "tpl-1", granted: false },
      expect.anything(),
    )
    expect(mocks.updateInstallation).toHaveBeenCalledWith({
      autoUpdate: false,
      inboxBindings: { "1": "2" },
    })
  })

  test("auto-update of a copy that is still installing is refused until it finishes", async () => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      sourceTemplateId: "tpl-1",
      status: "installing",
    })

    await expect(
      service.setAutoUpdate({
        workspaceId: "ws-1",
        installationId: "inst-1",
        actor: { kind: "member", permissions: { flows: true } },
        autoUpdate: true,
      }),
    ).rejects.toMatchObject({ code: "templateInstallationNotReady" })
  })

  test("changing consent or auto-update needs the permission of what the install holds", async () => {
    const ecommerceOnly = {
      kind: "member",
      permissions: { ecommerce: true },
    } as const
    await expect(
      service.setPublisherUninstallGrant({
        workspaceId: "ws-1",
        installationId: "inst-1",
        actor: ecommerceOnly,
        granted: true,
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
    await expect(
      service.setAutoUpdate({
        workspaceId: "ws-1",
        installationId: "inst-1",
        actor: ecommerceOnly,
        autoUpdate: true,
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
    expect(mocks.setGrant).not.toHaveBeenCalled()
  })

  test("consent covers every copy of the pair, so an older copy's categories count too", async () => {
    // The selected copy only holds flows; an older copy of the same template holds sequences.
    mocks.listPairCategories.mockResolvedValue(["flows", "sequences"])
    const flowsOnly = {
      kind: "member",
      permissions: { flows: true },
    } as const
    await expect(
      service.setPublisherUninstallGrant({
        workspaceId: "ws-1",
        installationId: "inst-1",
        actor: flowsOnly,
        granted: true,
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
    await expect(
      service.request({
        ...base,
        actor: flowsOnly,
        trigger: "reinstall",
        acceptPublisherUninstall: true,
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
    expect(mocks.setGrant).not.toHaveBeenCalled()
  })

  test("consent waits while an install of the template is still running", async () => {
    // A copy that is installing has no tracked resources yet: its categories are unknown.
    mocks.findActiveInstall.mockResolvedValue({ id: "installing" })
    await expect(
      service.setPublisherUninstallGrant({
        workspaceId: "ws-1",
        installationId: "inst-1",
        actor: fullToken,
        granted: true,
      }),
    ).rejects.toMatchObject({ code: "templateInstallationInProgress" })
    expect(mocks.setGrant).not.toHaveBeenCalled()
  })

  test("consent is checked and written under the pair lock", async () => {
    await service.setPublisherUninstallGrant({
      workspaceId: "ws-1",
      installationId: "inst-1",
      actor: fullToken,
      granted: false,
    })
    expect(mocks.lockInstall).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "tpl-1" },
      expect.anything(),
    )
  })

  test("a sync remembers the member who asked", async () => {
    await service.request({ ...base, requestedBy: "user-7" })
    expect(mocks.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: "user-7",
        requestedByKind: "member",
      }),
      expect.anything(),
    )
  })

  test("a token-requested sync records the apiToken kind", async () => {
    await service.request({ ...base, requestedBy: null })
    expect(mocks.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: null,
        requestedByKind: "apiToken",
      }),
      expect.anything(),
    )
  })

  test("switching consent off applies to every copy of the pair, not one row", async () => {
    await service.setPublisherUninstallGrant({
      workspaceId: "ws-1",
      installationId: "inst-1",
      actor: fullToken,
      granted: false,
    })
    expect(mocks.setGrant).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "tpl-1", granted: false },
      expect.anything(),
    )
  })
})

describe("templateSyncRequestService.fanOutAutoUpdate", () => {
  test("bulk-inserts a sync per candidate and reports only the new ones", async () => {
    mocks.candidates.mockResolvedValue([
      { id: "i1", workspaceId: "w1", installedByKind: "member" },
      { id: "i2", workspaceId: "w2", installedByKind: "apiToken" },
    ])
    mocks.createMany.mockResolvedValue([{ id: "s1", workspaceId: "w1" }])

    const result = await service.fanOutAutoUpdate({
      templateId: "tpl-1",
      version: 5,
    })

    expect(result.syncs).toEqual([{ id: "s1", workspaceId: "w1" }])
    expect(result.nextAfterId).toBeNull()
    expect(mocks.createMany).toHaveBeenCalledTimes(1)
    expect(mocks.createMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          trigger: "autoUpdate",
          requestedVersion: 5,
          installationId: "i1",
          requestedByKind: "member",
        }),
        expect.objectContaining({
          installationId: "i2",
          requestedByKind: "apiToken",
        }),
      ],
      expect.anything(),
    )
    expect(mocks.createIfAbsent).not.toHaveBeenCalled()
  })

  test("takes the version lock before checking the version", async () => {
    mocks.candidates.mockResolvedValue([])
    await service.fanOutAutoUpdate({ templateId: "tpl-1", version: 5 })
    expect(mocks.lockVersions).toHaveBeenCalledWith("tpl-1", expect.anything())
    expect(mocks.lockVersions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findVersion.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("creates nothing for a version that no longer exists", async () => {
    mocks.findVersion.mockResolvedValue(undefined)
    const result = await service.fanOutAutoUpdate({
      templateId: "tpl-1",
      version: 9,
    })
    expect(result).toEqual({ syncs: [], nextAfterId: null })
    expect(mocks.candidates).not.toHaveBeenCalled()
    expect(mocks.createMany).not.toHaveBeenCalled()
  })

  test("returns a cursor when the batch was full", async () => {
    const full = Array.from({ length: 500 }, (_, index) => ({
      id: `i${index}`,
      workspaceId: "w",
    }))
    mocks.candidates.mockResolvedValue(full)
    mocks.createMany.mockResolvedValue([])
    const result = await service.fanOutAutoUpdate({
      templateId: "tpl-1",
      version: 5,
    })
    expect(result.nextAfterId).toBe("i499")
  })
})
