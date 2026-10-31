// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertEditable: vi.fn(),
  stage: vi.fn(),
  findInstallation: vi.fn(),
  findLatest: vi.fn(),
  finish: vi.fn(),
  listInstalled: vi.fn(),
  addPendingPublishEffects: vi.fn(),
  findPendingPublishEffects: vi.fn(),
  markSynced: vi.fn(),
  detach: vi.fn(),
  completeInstallation: vi.fn(),
  insertBackup: vi.fn(),
  pruneBackups: vi.fn(),
  findBackup: vi.fn(),
  findActiveSync: vi.fn(),
  restore: vi.fn(),
  resolveInstallerActor: vi.fn(),
  stamp: vi.fn(),
  labels: vi.fn(),
  project: vi.fn(),
  serializeBackup: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  flushed: [] as unknown[],
  findSyncById: vi.fn(),
  findStatusFinishedByClaim: vi.fn(),
  deleteCopied: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({ execute: vi.fn() }),
  },
  inArray: vi.fn(),
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable: mocks.assertEditable,
}))
vi.mock("@chatbotx.io/database/schema", () => ({ customFieldModel: {} }))
vi.mock("@chatbotx.io/database/statement-timeout", () => ({
  setLocalStatementTimeout: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  loadResourceLabels: mocks.labels,
  templateInstallationRepository: {
    findByIdAndWorkspace: mocks.findInstallation,
    lockInstallRequest: vi.fn(),
    addPendingPublishEffects: mocks.addPendingPublishEffects,
    findPendingPublishEffects: mocks.findPendingPublishEffects,
    clearPendingPublishEffects: vi.fn(),
  },
  templateVersionRepository: { findLatest: mocks.findLatest },
  templateUninstallStateRepository: {
    isInProgress: vi.fn().mockResolvedValue(false),
  },
  templateInstallationSyncRepository: {
    finish: mocks.finish,
    listInstalledResources: mocks.listInstalled,
    markSynced: mocks.markSynced,
    detachResources: mocks.detach,
    completeInstallationSync: mocks.completeInstallation,
    claim: vi.fn(),
    release: vi.fn(),
    findById: mocks.findSyncById,
    findStatusFinishedByClaim: mocks.findStatusFinishedByClaim,
    findActiveByInstallation: mocks.findActiveSync,
  },
  templateResourceBackupRepository: {
    insert: mocks.insertBackup,
    pruneForResource: mocks.pruneBackups,
    findByIdAndInstallation: mocks.findBackup,
  },
}))
vi.mock("@chatbotx.io/flow-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/flow-config")>()),
  parseTemplateExport: (payload: unknown) => ({ ok: true, data: payload }),
}))
let counter = 0
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createId: () => `id-${++counter}`,
}))
vi.mock("../src/template/adapters/manifests/custom-fields", () => ({
  resolveCustomFieldManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/inboxes", () => ({
  resolveInboxManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/pipelines", () => ({
  resolvePipelineManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/product-categories", () => ({
  resolveProductCategoryManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/tags", () => ({
  resolveTagManifest: vi.fn(),
}))
vi.mock("../src/template/sync-hash", () => ({
  stampSyncedHashes: mocks.stamp,
}))
vi.mock("../src/template/service", () => ({
  templateService: { resolveInstallerActor: mocks.resolveInstallerActor },
}))
vi.mock("../src/template/template-copied-objects", () => ({
  deleteCopiedObjects: mocks.deleteCopied,
}))
vi.mock("../src/flow-version", () => ({
  flowVersionService: { afterPublish: vi.fn() },
}))

const state = vi.hoisted(() => ({ withHandler: true }))
/** What `updateNotSupported("flows")` is: it never reads a copy and raises the warning. */
const notUpdatableHandler = () => ({
  updatable: false as const,
  update: (
    ctx: { warn: (warning: Record<string, string>) => void },
    pairs: readonly unknown[],
  ) => {
    ctx.warn({
      category: "flows",
      entityKind: "notUpdatable",
      path: "flows",
      value: String(pairs.length),
    })
    return Promise.resolve()
  },
})
const flowsAdapterStub = () => ({
  stage: mocks.stage,
  sync: state.withHandler
    ? {
        project: mocks.project,
        restoreBackup: mocks.restore,
      }
    : notUpdatableHandler(),
})
vi.mock("../src/template/adapters/registry", () => ({
  TEMPLATE_INSTALL_ORDER: ["flows"],
  TRACKED_KIND_BY_CATEGORY: { flows: "flow", settings: null },
  folderTypeToCategory: () => "flows",
  getTemplateAdapter: (category: string) =>
    category === "flows" ? flowsAdapterStub() : undefined,
  templateAdapterRegistry: {
    get flows() {
      return {
        category: "flows",
        providesKinds: ["flow"],
        insert: mocks.insert,
        stage: mocks.stage,
        sync: state.withHandler
          ? {
              project: mocks.project,
              serializeBackup: mocks.serializeBackup,
              restoreBackup: mocks.restore,
              update: mocks.update,
            }
          : notUpdatableHandler(),
      }
    },
  },
}))
vi.mock("../src/template/install.service", () => ({
  createInstallContext: (_input: {
    tx: unknown
    installationId: string
    workspaceId: string
  }) => {
    const tracked: unknown[] = []
    const warnings: unknown[] = []
    return {
      ctx: {
        tx: {},
        idMaps: {} as Record<string, Map<string, string>>,
        warn: (warning: unknown) => warnings.push(warning),
        track: (entry: unknown) => tracked.push(entry),
      },
      tracked,
      warnings,
    }
  },
  flushTracked: (
    _tx: unknown,
    _installation: string,
    _workspace: string,
    tracked: unknown[],
  ) => {
    mocks.flushed.push(...tracked)
    tracked.length = 0
    return Promise.resolve()
  },
  lockFor: () => ({ allowEdit: true, allowDelete: true }),
  entriesForCategory: (
    resources: Record<string, unknown[]>,
    category: string,
  ) => resources[category] ?? [],
  invalidateAfterCommit: vi.fn(),
}))

const { templateSyncExecuteService: service } = await import(
  "../src/template/sync-execute.service"
)
const { templateSyncRestoreService: restoreService } = await import(
  "../src/template/sync-restore.service"
)
const { hashCanonical } = await import("../src/template/payload-hash")

const emptyManifests = {
  customFields: {},
  tags: {},
  productCategories: {},
  pipelines: {},
  inboxes: {},
  folders: {},
}
const payloadWith = (flows: unknown[]) => ({
  source: { workspaceId: "src" },
  manifests: emptyManifests,
  resources: { flows },
})
const sync = {
  id: "sync-1",
  workspaceId: "ws-1",
  installationId: "inst-1",
  trigger: "manual",
}
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  resourceKind: "flow",
  resourceId: "tgt-1",
  sourceResourceId: "src-1",
  category: "flows",
  wasExisting: false,
  detachedAt: null,
  allowEdit: true,
  allowDelete: true,
  syncedHash: null as string | null,
  ...overrides,
})

const run = () => service.run({ sync: sync as never, claimToken: "token" })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPendingPublishEffects.mockResolvedValue([])
  mocks.flushed.length = 0
  state.withHandler = true
  mocks.findInstallation.mockResolvedValue({
    id: "inst-1",
    workspaceId: "ws-1",
    templateId: "tpl-1",
    status: "completed",
    sourceDeletedAt: null,
    sourceVersion: 1,
    permissions: { allowEdit: true, allowDelete: true },
    inboxBindings: null,
  })
  mocks.findLatest.mockResolvedValue({
    version: 2,
    payload: payloadWith([{ sourceId: "src-1", name: "New" }]),
  })
  mocks.listInstalled.mockResolvedValue([row()])
  mocks.project.mockResolvedValue({ name: "Old" })
  mocks.serializeBackup.mockResolvedValue({
    formatVersion: 1,
    content: { name: "Old" },
  })
  mocks.finish.mockResolvedValue(true)
  mocks.findStatusFinishedByClaim.mockResolvedValue(null)
  mocks.insert.mockResolvedValue([])
  mocks.stage.mockResolvedValue(new Map())
  mocks.labels.mockResolvedValue(new Map())
  mocks.resolveInstallerActor.mockResolvedValue({
    kind: "apiToken",
    permission: "full",
  })
})

const outcome = () => mocks.finish.mock.calls[0][0].outcome

describe("template sync: the update rules", () => {
  test("a copy is projected once before its update and once after, not once per step", async () => {
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])

    await run()

    // Before: existence check + modified check + written; the first two are one read now.
    expect(mocks.project).toHaveBeenCalledTimes(2)
  })

  test("a locked copy is overwritten without a backup", async () => {
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])
    await run()

    expect(mocks.insertBackup).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(outcome()).toMatchObject({
      status: "completed",
      appliedVersion: 2,
      fromVersion: 1,
      counts: { updated: 1, overwrittenModified: 0 },
    })
    expect(mocks.completeInstallation).toHaveBeenCalledWith(
      { installationId: "inst-1", version: 2 },
      expect.anything(),
    )
  })

  test("an editable copy that still matches the last sync is overwritten without a backup", async () => {
    mocks.listInstalled.mockResolvedValue([
      row({ syncedHash: await hashCanonical({ name: "Old" }) }),
    ])
    await run()

    expect(mocks.insertBackup).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  test("an edited copy is backed up first, then overwritten", async () => {
    mocks.listInstalled.mockResolvedValue([
      row({ syncedHash: await hashCanonical({ name: "What the sync wrote" }) }),
    ])
    await run()

    expect(mocks.insertBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        installedResourceId: "row-1",
        resourceId: "tgt-1",
        content: { name: "Old" },
      }),
      expect.anything(),
    )
    expect(mocks.pruneBackups).toHaveBeenCalledWith("row-1", expect.anything())
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(outcome().counts).toMatchObject({ overwrittenModified: 1 })
    expect(outcome()).toMatchObject({ status: "partial" })
    // The warning carries the backup's id (what `restoreBackup` takes), not the row's.
    const backupId = mocks.insertBackup.mock.calls[0][0].id
    expect(outcome().warnings).toEqual([
      expect.objectContaining({
        entityKind: "localModifiedOverwritten",
        value: backupId,
      }),
    ])
    expect(backupId).not.toBe("row-1")
  })

  test("a copy with no recorded baseline is treated as edited and backed up", async () => {
    await run()
    expect(mocks.insertBackup).toHaveBeenCalledTimes(1)
  })

  test("a backup over the cap leaves the copy untouched with a warning", async () => {
    mocks.serializeBackup.mockResolvedValue({
      formatVersion: 1,
      content: { blob: "x".repeat(1024 * 1024 + 1) },
    })
    await run()

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insertBackup).not.toHaveBeenCalled()
    expect(outcome().warnings).toEqual([
      expect.objectContaining({ entityKind: "backupTooLarge" }),
    ])
  })

  test("a copy the installer deleted is detached, never recreated", async () => {
    mocks.project.mockResolvedValue(null)
    await run()

    expect(mocks.detach).toHaveBeenCalledWith(["row-1"], expect.anything())
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(outcome().counts).toMatchObject({ detached: 1 })
  })

  test("an item new in the template is installed through the adapter", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([
        { sourceId: "src-1", name: "New" },
        { sourceId: "src-2", name: "Added" },
      ]),
    })
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])
    // Like a real adapter: every copy it creates is tracked.
    mocks.insert.mockImplementation(
      (
        ctx: { track: (entry: Record<string, unknown>) => void },
        entries: { sourceId: string }[],
      ) => {
        for (const entry of entries) {
          ctx.track({
            category: "flows",
            resourceKind: "flow",
            resourceId: `copy-${entry.sourceId}`,
            sourceResourceId: entry.sourceId,
            wasExisting: false,
          })
        }
        return Promise.resolve([])
      },
    )
    await run()

    expect(mocks.insert).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ sourceId: "src-2" }),
    ])
    expect(outcome().counts).toMatchObject({ created: 1, updated: 1 })
  })

  test("an item the adapter skips (an unresolved required reference) is not counted as added", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([
        { sourceId: "src-1", name: "New" },
        { sourceId: "src-2", name: "Added" },
      ]),
    })
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])
    // The adapter warns and creates nothing: no copy is tracked.
    mocks.insert.mockResolvedValue([])
    await run()

    expect(mocks.insert).toHaveBeenCalled()
    expect(outcome().counts).toMatchObject({ created: 0, updated: 1 })
  })

  test("an item the template dropped is detached and never deleted", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([]),
    })
    await run()

    expect(mocks.detach).toHaveBeenCalledWith(["row-1"], expect.anything())
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("a copy that predates the install (reused) is never detached", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([]),
    })
    mocks.listInstalled.mockResolvedValue([row({ wasExisting: true })])
    await run()
    expect(mocks.detach).toHaveBeenCalledWith([], expect.anything())
  })

  test("a category without a sync handler is reported, and the sync is partial", async () => {
    state.withHandler = false
    await run()

    expect(mocks.update).not.toHaveBeenCalled()
    expect(outcome()).toMatchObject({
      status: "partial",
      counts: { notUpdatable: 1 },
    })
    expect(outcome().warnings).toEqual([
      expect.objectContaining({
        entityKind: "notUpdatable",
        path: "flows",
        value: "1",
      }),
    ])
  })

  test("a modified copy with no backup available is left alone with a warning", async () => {
    mocks.serializeBackup.mockResolvedValue(null)
    await run()

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insertBackup).not.toHaveBeenCalled()
    expect(outcome().warnings).toEqual([
      expect.objectContaining({ entityKind: "backupUnavailable" }),
    ])
    expect(outcome().counts).toMatchObject({ updated: 0 })
  })

  test("a copy the installer deleted never reaches the id maps", async () => {
    mocks.project.mockResolvedValue(null)
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([{ sourceId: "src-2", name: "Added" }]),
    })
    await run()

    const ctx = mocks.insert.mock.calls[0][0]
    expect(ctx.idMaps.flow?.has("src-1") ?? false).toBe(false)
  })

  test("storage objects copied by a rolled-back sync are deleted", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([{ sourceId: "src-2", name: "Added" }]),
    })
    mocks.stage.mockImplementation((ctx) => {
      ctx.trackCopiedObject("workspaces/ws-1/a.png")
      return Promise.resolve(new Map())
    })
    mocks.insert.mockRejectedValue(new Error("boom"))
    mocks.findSyncById.mockResolvedValue({
      claimToken: "token",
      status: "running",
    })

    await expect(run()).rejects.toThrow("boom")
    expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
  })

  test("a sync stages only entries it is about to insert, never ones with a row", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([
        { sourceId: "src-1", name: "Installed" },
        { sourceId: "src-2", name: "Added" },
      ]),
    })

    await run()

    const staged = mocks.stage.mock.calls.flatMap((call) => call[1])
    expect(staged.map((entry: { sourceId: string }) => entry.sourceId)).toEqual(
      ["src-2"],
    )
  })

  test("a sync that lost its lease still removes the objects its own claim staged (keys are per claim)", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payload: payloadWith([{ sourceId: "src-2", name: "Added" }]),
    })
    mocks.stage.mockImplementation((ctx) => {
      ctx.trackCopiedObject("workspaces/ws-1/a.png")
      return Promise.resolve(new Map())
    })
    mocks.insert.mockRejectedValue(new Error("boom"))
    mocks.findSyncById.mockResolvedValue({
      claimToken: "someone-else",
      status: "running",
    })

    await expect(run()).rejects.toThrow("boom")
    expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
  })

  test("the sync is fenced by its lease: losing it rolls the transaction back", async () => {
    mocks.finish.mockResolvedValue(false)
    await expect(run()).rejects.toMatchObject({ code: "templateSyncLeaseLost" })
    expect(mocks.completeInstallation).not.toHaveBeenCalled()
  })
})

describe("template sync: review fixes", () => {
  test("a copy the installer deleted is not brought back by a later sync", async () => {
    mocks.listInstalled.mockResolvedValue([row({ detachedAt: new Date() })])
    await run()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("a copy skipped for an oversized backup gets no new baseline", async () => {
    mocks.serializeBackup.mockResolvedValue({
      formatVersion: 1,
      content: { blob: "x".repeat(1024 * 1024 + 1) },
    })
    await run()
    const skipped = mocks.stamp.mock.calls[0][3] as Set<string>
    expect([...skipped]).toEqual(["row-1"])
  })

  test("new items are installed before existing copies are updated", async () => {
    const order: string[] = []
    mocks.insert.mockImplementation(() => {
      order.push("insert")
      return Promise.resolve([])
    })
    mocks.update.mockImplementation(() => {
      order.push("update")
      return Promise.resolve()
    })
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payloadHash: "hash-2",
      payload: payloadWith([
        { sourceId: "src-1", name: "New" },
        { sourceId: "src-2", name: "Added" },
      ]),
    })
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])
    await run()
    expect(order).toEqual(["insert", "update"])
  })

  test("an automatic update is skipped once the installer turned auto-update off", async () => {
    await service.run({
      sync: { ...sync, trigger: "autoUpdate" } as never,
      claimToken: "token",
    })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "skipped",
      errorCode: "templateAutoUpdateOff",
    })
  })

  test("an automatic update leaves categories the installer may not use", async () => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      sourceVersion: 1,
      autoUpdate: true,
      permissions: { allowEdit: true, allowDelete: true },
      inboxBindings: null,
    })
    mocks.resolveInstallerActor.mockResolvedValue({
      kind: "member",
      permissions: { ecommerce: true },
    })
    await service.run({
      sync: { ...sync, trigger: "autoUpdate" } as never,
      claimToken: "token",
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "partial",
      counts: { notUpdatable: 1 },
    })
    // The copy stays governed by the template and keeps its edits visible.
    expect(mocks.detach).toHaveBeenCalledWith([], expect.anything())
    expect([...(mocks.stamp.mock.calls[0][3] as Set<string>)]).toEqual([
      "row-1",
    ])
  })

  test("a manual sync is held to the installer's permissions for what the template now contains", async () => {
    mocks.resolveInstallerActor.mockResolvedValue({
      kind: "member",
      permissions: { ecommerce: true },
    })
    await run()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(outcome().counts).toMatchObject({ notUpdatable: 1 })
  })

  test("an automatic update stops when the installer lost access", async () => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      sourceVersion: 1,
      autoUpdate: true,
    })
    mocks.resolveInstallerActor.mockResolvedValue(null)
    await service.run({
      sync: { ...sync, trigger: "autoUpdate" } as never,
      claimToken: "token",
    })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "skipped",
      errorCode: "templateInstallerAccessLost",
    })
  })

  test("a deleted tag or field is detached and resolved again, not remapped to a dead id", async () => {
    mocks.listInstalled.mockResolvedValue([
      row({ allowEdit: false }),
      row({
        id: "row-tag",
        resourceKind: "tag",
        resourceId: "tgt-tag",
        sourceResourceId: "src-tag",
        category: "tags",
      }),
    ])
    mocks.labels.mockResolvedValue(new Map())
    await run()
    expect(mocks.detach).toHaveBeenCalledWith(["row-tag"], expect.anything())
  })

  test("records the applied payload's own hash", async () => {
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payloadHash: "hash-of-v2",
      payload: payloadWith([{ sourceId: "src-1", name: "New" }]),
    })
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])
    await run()
    expect(outcome().appliedHash).toBe("hash-of-v2")
  })
})

describe("template sync: who it acts as", () => {
  test("a manual sync acts as the member who requested it, not the installer", async () => {
    await service.run({
      sync: {
        ...sync,
        requestedBy: "user-9",
        requestedByKind: "member",
      } as never,
      claimToken: "token",
    })
    expect(mocks.resolveInstallerActor).toHaveBeenCalledWith({
      installedBy: "user-9",
      installedByKind: "member",
      workspaceId: "ws-1",
    })
  })

  test("a token-requested sync runs with token power", async () => {
    await service.run({
      sync: {
        ...sync,
        requestedBy: null,
        requestedByKind: "apiToken",
      } as never,
      claimToken: "token",
    })
    expect(mocks.resolveInstallerActor).toHaveBeenCalledWith({
      installedBy: null,
      installedByKind: "apiToken",
      workspaceId: "ws-1",
    })
  })

  test("a requester whose user was deleted keeps the member kind, so no token power", async () => {
    await service.run({
      sync: { ...sync, requestedBy: null, requestedByKind: "member" } as never,
      claimToken: "token",
    })
    expect(mocks.resolveInstallerActor).toHaveBeenCalledWith({
      installedBy: null,
      installedByKind: "member",
      workspaceId: "ws-1",
    })
  })

  test("an automatic update acts as the installation's recorded kind", async () => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      sourceVersion: 1,
      autoUpdate: true,
      installedBy: null,
      installedByKind: "member",
      permissions: { allowEdit: true, allowDelete: true },
      inboxBindings: null,
    })
    await service.run({
      sync: {
        ...sync,
        trigger: "autoUpdate",
        requestedByKind: "apiToken",
      } as never,
      claimToken: "token",
    })
    expect(mocks.resolveInstallerActor).toHaveBeenCalledWith({
      installedBy: null,
      installedByKind: "member",
      workspaceId: "ws-1",
    })
  })

  test("a requester who lost access stops the sync instead of running unrestricted", async () => {
    mocks.resolveInstallerActor.mockResolvedValue(null)
    await service.run({
      sync: { ...sync, requestedBy: "user-9" } as never,
      claimToken: "token",
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "skipped",
      errorCode: "templateInstallerAccessLost",
    })
  })
})

describe("template sync: manifests follow the actor's permissions", () => {
  test("a manifest category the actor may not use is not created", async () => {
    const { resolveProductCategoryManifest } = await import(
      "../src/template/adapters/manifests/product-categories"
    )
    const { resolveTagManifest } = await import(
      "../src/template/adapters/manifests/tags"
    )
    mocks.resolveInstallerActor.mockResolvedValue({
      kind: "member",
      permissions: { flows: true },
    })
    await service.run({
      sync: { ...sync, requestedBy: "user-9" } as never,
      claimToken: "token",
    })
    // flows-only: tags (flows) are resolved, product categories (ecommerce) are not.
    expect(resolveTagManifest).toHaveBeenCalled()
    expect(resolveProductCategoryManifest).not.toHaveBeenCalled()
  })
})

describe("template sync: a denied manifest leaves dependent flows alone", () => {
  test("a flow is not updated when its product category cannot be created", async () => {
    mocks.resolveInstallerActor.mockResolvedValue({
      kind: "member",
      permissions: { flows: true },
    })
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payloadHash: "hash-2",
      payload: {
        ...payloadWith([{ sourceId: "src-1", name: "New" }]),
        manifests: {
          ...emptyManifests,
          productCategories: {
            "pc-1": { name: "Shoes", parentSourceId: null },
          },
        },
      },
    })
    mocks.listInstalled.mockResolvedValue([row({ allowEdit: false })])
    await service.run({
      sync: { ...sync, requestedBy: "user-9" } as never,
      claimToken: "token",
    })
    // The flow keeps its old graph (and stays governed) instead of losing the
    // category filter, which would widen it to the whole store.
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.detach).toHaveBeenCalledWith([], expect.anything())
    expect(outcome().counts).toMatchObject({ notUpdatable: 1 })
  })
})

describe("template sync: when it does not run", () => {
  test("an auto-update at the current version is skipped", async () => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      sourceVersion: 2,
      autoUpdate: true,
    })
    await service.run({
      sync: { ...sync, trigger: "autoUpdate" } as never,
      claimToken: "token",
    })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "skipped",
      errorCode: "templateUpToDate",
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  describe("an auto-update at the current version with lagging copies", () => {
    const atCurrentVersion = () =>
      mocks.findInstallation.mockResolvedValue({
        id: "inst-1",
        workspaceId: "ws-1",
        templateId: "tpl-1",
        status: "completed",
        sourceDeletedAt: null,
        sourceVersion: 2,
        autoUpdate: true,
        permissions: { allowEdit: true, allowDelete: true },
        inboxBindings: null,
      })

    test("runs when a copy's adapter can now update what an earlier sync could not", async () => {
      atCurrentVersion()
      // Left at version 1 by a sync whose adapter then could not update it.
      mocks.listInstalled.mockResolvedValue([row({ syncedVersion: 1 })])

      await service.run({
        sync: { ...sync, trigger: "autoUpdate" } as never,
        claimToken: "token",
      })

      expect(mocks.update).toHaveBeenCalledTimes(1)
    })

    test("is still skipped while the lagging copy's adapter cannot update it", async () => {
      atCurrentVersion()
      state.withHandler = false
      mocks.listInstalled.mockResolvedValue([row({ syncedVersion: 1 })])

      await service.run({
        sync: { ...sync, trigger: "autoUpdate" } as never,
        claimToken: "token",
      })

      expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
        status: "skipped",
        errorCode: "templateUpToDate",
      })
    })
  })

  test("a manual sync at the current version still runs, restoring edited copies", async () => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      sourceVersion: 2,
      permissions: { allowEdit: true, allowDelete: true },
      inboxBindings: null,
    })
    await run()
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["the source was deleted", { sourceDeletedAt: new Date() }],
    ["the installation is not active", { status: "failed" }],
  ])("is skipped when %s", async (_label, patch) => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      templateId: "tpl-1",
      status: "completed",
      sourceDeletedAt: null,
      ...patch,
    })
    await run()
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "skipped",
    })
  })
})

describe("template sync: restoring a backup", () => {
  const restoreInput = {
    workspaceId: "ws-1",
    installationId: "inst-1",
    backupId: "backup-1",
    actor: { kind: "apiToken", permission: "full" } as const,
  }
  beforeEach(() => {
    mocks.findInstallation.mockResolvedValue({
      id: "inst-1",
      workspaceId: "ws-1",
      sourceTemplateId: "tpl-1",
      status: "completed",
    })
    mocks.findBackup.mockResolvedValue({
      id: "backup-1",
      installedResourceId: "row-1",
      resourceKind: "flow",
      formatVersion: 1,
      content: { name: "Old" },
    })
    mocks.findActiveSync.mockResolvedValue(null)
    mocks.listInstalled.mockResolvedValue([row()])
    mocks.restore.mockResolvedValue(undefined)
  })

  test("writes the backed-up content back to the copy", async () => {
    await restoreService.restoreBackup(restoreInput)
    expect(mocks.restore).toHaveBeenCalledWith(
      expect.anything(),
      "tgt-1",
      { name: "Old" },
      1,
    )
  })

  test("takes the copy's lock before reading it, ruling out only its own installation", async () => {
    await restoreService.restoreBackup(restoreInput)

    expect(mocks.assertEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "flow",
        resourceIds: ["tgt-1"],
        excludeInstallationIds: ["inst-1"],
      }),
    )
    expect(mocks.assertEditable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.project.mock.invocationCallOrder[0],
    )
  })

  test("another installation that still locks the copy blocks the restore", async () => {
    mocks.assertEditable.mockRejectedValueOnce(
      Object.assign(new Error("locked"), {
        code: "templateAllowEditViolation",
      }),
    )
    await expect(
      restoreService.restoreBackup(restoreInput),
    ).rejects.toMatchObject({
      code: "templateAllowEditViolation",
    })
    expect(mocks.restore).not.toHaveBeenCalled()
  })

  test("refuses while a sync of the installation is in progress", async () => {
    mocks.findActiveSync.mockResolvedValue({ id: "running" })
    await expect(
      restoreService.restoreBackup(restoreInput),
    ).rejects.toMatchObject({
      code: "templateSyncInProgress",
    })
    expect(mocks.restore).not.toHaveBeenCalled()
  })

  test("a read-only token can not restore", async () => {
    await expect(
      restoreService.restoreBackup({
        ...restoreInput,
        actor: { kind: "apiToken", permission: "read_only" },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
  })

  test("a backup of another installation is not found", async () => {
    mocks.findBackup.mockResolvedValue(undefined)
    await expect(restoreService.restoreBackup(restoreInput)).rejects.toThrow(
      "Backup not found",
    )
  })

  test("a member without the category permission is refused", async () => {
    await expect(
      restoreService.restoreBackup({
        ...restoreInput,
        actor: { kind: "member", permissions: { ecommerce: true } },
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
    expect(mocks.restore).not.toHaveBeenCalled()
  })

  test("a detached copy can not be restored into", async () => {
    mocks.listInstalled.mockResolvedValue([row({ detachedAt: new Date() })])
    await expect(restoreService.restoreBackup(restoreInput)).rejects.toThrow(
      "Backup target not found",
    )
  })
})

describe("template sync: staged objects", () => {
  const stagesAPath = () =>
    mocks.stage.mockImplementation((ctx) => {
      ctx.trackCopiedObject("workspaces/ws-1/a.png")
      return Promise.resolve(new Map())
    })
  const activeInstallation = {
    id: "inst-1",
    workspaceId: "ws-1",
    templateId: "tpl-1",
    status: "completed",
    sourceDeletedAt: null,
    sourceVersion: 1,
    permissions: { allowEdit: true, allowDelete: true },
    inboxBindings: null,
    stagingGeneration: 3,
  }
  const addedFlow = (version: number, payloadHash: string) => ({
    version,
    payloadHash,
    payload: payloadWith([{ sourceId: "src-2", name: `v${version}` }]),
  })

  test("keys the staged objects per sync under the installation's generation, so a loser cannot delete the winner's", async () => {
    mocks.findLatest.mockResolvedValue(addedFlow(2, "h2"))
    mocks.findInstallation.mockResolvedValue(activeInstallation)
    await run()
    const ctx = mocks.stage.mock.calls[0][0]
    // The real installation id (the uninstall prefix match depends on it) …
    expect(ctx.installationId).toBe("inst-1")
    // … with the sync attempt in the scope, not the id.
    expect(ctx.scope).toEqual({
      generation: 3,
      attemptKey: "sync-1:token",
    })
  })

  test("a sync that ends in a skip deletes what it staged", async () => {
    mocks.findLatest.mockResolvedValue(addedFlow(2, "h2"))
    stagesAPath()
    // The probe looks active; by the time the lock is held it has failed.
    mocks.findInstallation.mockReset()
    mocks.findInstallation
      .mockResolvedValueOnce(activeInstallation)
      .mockResolvedValueOnce({ ...activeInstallation, status: "failed" })

    await run()

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "skipped",
      errorCode: "templateInstallationInactive",
    })
    expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
  })

  test("a stale worker whose skip cannot be recorded still deletes its own staged copies", async () => {
    mocks.findLatest.mockResolvedValue(addedFlow(2, "h2"))
    stagesAPath()
    mocks.findInstallation.mockReset()
    mocks.findInstallation
      .mockResolvedValueOnce(activeInstallation)
      .mockResolvedValueOnce({ ...activeInstallation, status: "failed" })
    // Another worker took the claim: the fenced finish writes no row.
    mocks.finish.mockResolvedValueOnce(false)
    mocks.findSyncById.mockResolvedValue({
      claimToken: "someone-else",
      status: "running",
    })

    await expect(run()).rejects.toThrow()

    expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
  })

  describe("a failure after the transaction may have committed", () => {
    const lostAck = () => {
      mocks.findLatest.mockResolvedValue(addedFlow(2, "h2"))
      mocks.findInstallation.mockResolvedValue(activeInstallation)
      stagesAPath()
      mocks.finish.mockRejectedValueOnce(new Error("connection reset"))
    }

    test("keeps the staged objects when this claim's commit landed", async () => {
      lostAck()
      mocks.findStatusFinishedByClaim.mockResolvedValue("completed")

      await expect(run()).rejects.toThrow("connection reset")

      expect(mocks.findStatusFinishedByClaim).toHaveBeenCalledWith({
        id: "sync-1",
        claimToken: "token",
      })
      expect(mocks.deleteCopied).not.toHaveBeenCalledWith([
        "workspaces/ws-1/a.png",
      ])
    })

    test("deletes them when nothing committed", async () => {
      lostAck()

      await expect(run()).rejects.toThrow("connection reset")

      expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
    })

    test("deletes them when only a skip committed", async () => {
      lostAck()
      mocks.findStatusFinishedByClaim.mockResolvedValue("skipped")

      await expect(run()).rejects.toThrow("connection reset")

      expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
    })

    test("keeps them when the commit can not be checked", async () => {
      lostAck()
      mocks.findStatusFinishedByClaim.mockRejectedValue(new Error("db down"))

      await expect(run()).rejects.toThrow("connection reset")

      expect(mocks.deleteCopied).not.toHaveBeenCalledWith([
        "workspaces/ws-1/a.png",
      ])
    })
  })

  test("the last fallback removes the staged copies of the discarded map", async () => {
    mocks.stage.mockImplementation(() =>
      Promise.resolve(
        new Map([["src-image", { targetPath: "workspaces/ws-1/old.png" }]]),
      ),
    )
    mocks.findSyncById.mockResolvedValue({
      claimToken: "token",
      status: "running",
    })
    let version = 1
    mocks.findLatest.mockImplementation(() => {
      version += 1
      return Promise.resolve(addedFlow(version, `h${version}`))
    })

    await run()

    expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/old.png"])
  })

  test("restages when the template moved on between staging and the lock", async () => {
    stagesAPath()
    mocks.findSyncById.mockResolvedValue({
      claimToken: "token",
      status: "running",
    })
    mocks.findLatest
      .mockResolvedValueOnce(addedFlow(2, "h2")) // staging
      .mockResolvedValueOnce(addedFlow(3, "h3")) // under the lock: moved on
      .mockResolvedValueOnce(addedFlow(3, "h3")) // restaging
      .mockResolvedValueOnce(addedFlow(3, "h3")) // under the lock again

    await run()

    expect(mocks.stage).toHaveBeenCalledTimes(2)
    expect(mocks.deleteCopied).toHaveBeenCalledWith(["workspaces/ws-1/a.png"])
    expect(outcome()).toMatchObject({ appliedVersion: 3, appliedHash: "h3" })
  })

  test("after the bounded restages it stages inline instead of applying a stale map", async () => {
    stagesAPath()
    mocks.findSyncById.mockResolvedValue({
      claimToken: "token",
      status: "running",
    })
    let version = 1
    // Every read inside the transaction sees a newer version than the staged one.
    mocks.findLatest.mockImplementation(() => {
      version += 1
      return Promise.resolve(addedFlow(version, `h${version}`))
    })

    await run()

    expect(outcome().status).not.toBe("failed")
    expect(mocks.insert).toHaveBeenCalled()
    // Three unlocked stagings, then the last attempt stages inside.
    expect(mocks.stage.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe("template sync: id tokens", () => {
  test("rewrites {{bot_field:<sourceId>}} in new entries to the installed field", async () => {
    mocks.listInstalled.mockResolvedValue([
      row({ allowEdit: false }),
      row({
        id: "row-bf",
        resourceKind: "botField",
        resourceId: "tgt-bf",
        sourceResourceId: "src-bf",
        category: "settings",
      }),
    ])
    mocks.labels.mockResolvedValue(new Map([["botField:tgt-bf", "bf"]]))
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payloadHash: "h2",
      payload: payloadWith([
        { sourceId: "src-2", text: "hi {{bot_field:src-bf}}" },
      ]),
    })

    await run()

    expect(mocks.insert.mock.calls[0][1]).toEqual([
      { sourceId: "src-2", text: "hi {{bot_field:tgt-bf}}" },
    ])
  })

  test("rewrites {{bot_field:<sourceId>}} in entries that update an installed copy", async () => {
    mocks.listInstalled.mockResolvedValue([
      row({ allowEdit: false }),
      row({
        id: "row-bf",
        resourceKind: "botField",
        resourceId: "tgt-bf",
        sourceResourceId: "src-bf",
        category: "settings",
      }),
    ])
    mocks.labels.mockResolvedValue(new Map([["botField:tgt-bf", "bf"]]))
    mocks.findLatest.mockResolvedValue({
      version: 2,
      payloadHash: "h2",
      payload: payloadWith([
        { sourceId: "src-1", text: "x {{bot_field:src-bf}}" },
      ]),
    })

    await run()

    const pairs = mocks.update.mock.calls[0][1]
    expect(pairs[0].entry.text).toBe("x {{bot_field:tgt-bf}}")
  })
})
