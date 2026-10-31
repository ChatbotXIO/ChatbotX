// @vitest-environment node

/**
 * The `tpl-res:` / `tpl-ver:` advisory-lock protocols under two really
 * concurrent transactions on a real Postgres. Each test holds one writer
 * inside its transaction behind a promise gate, starts the competing writer,
 * waits until Postgres reports it as waiting on an advisory lock (a condition
 * poll, never a sleep that the outcome depends on), then releases the gate and
 * asserts the outcome and the order the two effects landed in.
 *
 * Commits for real, so each test deletes its workspace (everything cascades
 * from it) afterwards. Needs the template migrations applied locally.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateRepository,
  templateResourceBackupRepository,
  templateUninstallStateRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
  flowModel,
  flowVersionModel,
  templateInstallationModel,
  templateInstalledResourceModel,
  templateModel,
  templateVersionModel,
  triggerModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/events")>()),
  updateTriggerCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueUninstallTemplate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { flowVersionService } = await import("../../src/flow-version/service")
const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { templateSyncRequestService } = await import(
  "../../src/template/sync-request.service"
)
const { templateSyncExecuteService } = await import(
  "../../src/template/sync-execute.service"
)
const { templateSyncRestoreService } = await import(
  "../../src/template/sync-restore.service"
)
const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService } = await import(
  "../../src/template/uninstall-execute.service"
)
const { workspaceService } = await import("../../src/workspace/service")
const { withTemplateLockedTransaction } = await import(
  "../../src/template/template-resource-locks"
)

const databaseUrl = realDatabaseUrl()
const FULL = { kind: "apiToken", permission: "full" } as const
const permissions = { allowEdit: true, allowDelete: true }
const WAIT_ATTEMPTS = 400
const WAIT_STEP_MS = 25

/** A promise whose resolution the test controls: one writer's barrier. */
const barrier = () => {
  let open: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

/** Polls Postgres until some session waits on an advisory lock: the second writer reached its lock. */
const waitUntilSomeoneWaitsOnAnAdvisoryLock = async (): Promise<void> => {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
    const result = await db.execute(
      sql`select count(*)::int as waiting from pg_locks where locktype = 'advisory' and not granted`,
    )
    if (Number((result.rows[0] as { waiting: number }).waiting) > 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
  }
  throw new Error("no session ever waited on an advisory lock")
}

describe.skipIf(!databaseUrl)("template lock protocols, concurrently", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedWorkspace = async (payload: unknown = {}, version = 1) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-concurrency-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-concurrency-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: payload as never,
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
        version,
      })
      .returning({ id: templateModel.id })
    return { workspaceId: workspace.id, templateId: template.id }
  }

  type Seed = Awaited<ReturnType<typeof seedWorkspace>>

  const addInstallation = async (
    seed: Seed,
    overrides: Partial<
      Parameters<typeof templateInstallationRepository.create>[0]
    > = {},
  ) =>
    await templateInstallationRepository.create({
      workspaceId: seed.workspaceId,
      templateId: seed.templateId,
      sourceTemplateId: seed.templateId,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: 1,
      status: "completed",
      permissions,
      sourceVersion: 1,
      ...overrides,
    })

  describe("flow publish vs sync of the same flow", () => {
    test("the publish waits for the sync's lock, then runs after it: no deadlock, both effects ordered", async () => {
      const seed = await seedWorkspace()
      const installation = await addInstallation(seed)
      const [flow] = await db
        .insert(flowModel)
        .values({ workspaceId: seed.workspaceId, name: "Flow" })
        .returning({ id: flowModel.id })
      await db.insert(flowVersionModel).values({
        workspaceId: seed.workspaceId,
        flowId: flow.id,
        nodes: [],
        edges: [],
        isDraft: true,
        startNodeId: "1",
      })
      await db.insert(templateInstalledResourceModel).values({
        installationId: installation.id,
        workspaceId: seed.workspaceId,
        category: "flows",
        resourceKind: "flow",
        resourceId: flow.id,
        sourceResourceId: createId(),
        wasExisting: false,
        allowEdit: true,
        allowDelete: true,
      })

      const order: string[] = []
      const syncHasLock = barrier()
      const syncMayWrite = barrier()
      // The sync's shape: the shared lock first, then rows in the order that
      // is the REVERSE of a publish (Flow, then the draft FlowVersion).
      const sync = withTemplateLockedTransaction(
        async (tx) => {
          syncHasLock.open()
          await syncMayWrite.promise
          await tx
            .update(flowModel)
            .set({ name: "Synced" })
            .where(eq(flowModel.id, flow.id))
          await tx
            .update(flowVersionModel)
            .set({ startNodeId: "2" })
            .where(eq(flowVersionModel.flowId, flow.id))
          order.push("sync")
        },
        { initialKeys: [{ kind: "flow", resourceId: flow.id }] },
      )
      await syncHasLock.promise

      const publish = flowVersionService
        .publish({
          workspaceId: seed.workspaceId,
          flowId: flow.id,
          nodes: [],
          edges: [],
        })
        .then(() => order.push("publish"))
      await waitUntilSomeoneWaitsOnAnAdvisoryLock()
      // The local publish is parked on the flow's lock; it has written nothing.
      expect(order).toEqual([])

      syncMayWrite.open()
      await Promise.all([sync, publish])

      expect(order).toEqual(["sync", "publish"])
      const after = await db.query.flowModel.findFirst({
        where: { id: flow.id },
      })
      // The sync's write survived the publish, and the publish went live after it.
      expect(after?.name).toBe("Synced")
      expect(after?.currentVersionId).toBeTruthy()
    }, 30_000)
  })

  describe("backup restore vs a local edit of the same resource", () => {
    const buildTrigger = (name: string, conditionSourceId: string) => {
      const parsed = parseTemplateExport({
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        source: { workspaceId: "999000", tenantId: "1" },
        manifests: { tags: { "500": { name: "vip" } } },
        resources: {
          triggers: [
            {
              sourceId: "700",
              name,
              active: true,
              folderId: null,
              actions: [],
              conditions: [
                {
                  type: conditionSourceId ? "tagApplied" : "newOrder",
                  sourceId: conditionSourceId || null,
                  operator: null,
                  value: null,
                },
              ],
            },
          ],
        },
      })
      if (!parsed.ok) {
        throw new Error(parsed.reason)
      }
      return parsed.data
    }

    /** Installs version 1, edits the copy by hand, syncs version 2: one backup exists. */
    const syncedWithBackup = async () => {
      const first = buildTrigger("On vip", "500")
      const second = buildTrigger("On order", "")
      const seed = await seedWorkspace(first, 2)
      for (const [version, payload] of [
        [1, first],
        [2, second],
      ] as const) {
        await templateVersionRepository.insert({
          id: createId(),
          templateId: seed.templateId,
          workspaceId: seed.workspaceId,
          version,
          payload,
          payloadHash: `hash-${version}`,
          formatVersion: 1,
        })
      }
      const installation = await addInstallation(seed, { status: "pending" })
      const claim = await templateInstallService.claim({
        installationId: installation.id,
        workspaceId: seed.workspaceId,
      })
      if (!claim) {
        throw new Error("the install could not be claimed")
      }
      await templateInstallService.run({
        installationId: installation.id,
        workspaceId: seed.workspaceId,
        claimToken: claim.claimToken,
        permissions,
        payload: first,
        templateName: "Template",
        createInstallFolder: false,
        sourceVersion: 1,
      })
      const [trigger] = await db.query.triggerModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      await db
        .update(triggerModel)
        .set({ name: "My own name" })
        .where(eq(triggerModel.id, trigger.id))

      const { syncId } = await templateSyncRequestService.request({
        workspaceId: seed.workspaceId,
        installationId: installation.id,
        actor: FULL,
        trigger: "manual",
      })
      const claimed = await templateSyncExecuteService.claim({
        syncId,
        workspaceId: seed.workspaceId,
      })
      if (!claimed) {
        throw new Error("the sync could not be claimed")
      }
      await templateSyncExecuteService.run({
        sync: claimed.sync,
        claimToken: claimed.claimToken,
      })
      const [backup] = await templateResourceBackupRepository.listBySync(syncId)
      return { seed, installation, trigger, backup }
    }

    test("the restore waits for the edit's lock and then lands after it", async () => {
      const { seed, installation, trigger, backup } = await syncedWithBackup()
      expect(backup).toBeDefined()
      const order: string[] = []
      const editHasLock = barrier()
      const editMayWrite = barrier()
      const edit = withTemplateLockedTransaction(
        async (tx) => {
          editHasLock.open()
          await editMayWrite.promise
          await tx
            .update(triggerModel)
            .set({ name: "Concurrent edit" })
            .where(eq(triggerModel.id, trigger.id))
          order.push("edit")
        },
        { initialKeys: [{ kind: "trigger", resourceId: trigger.id }] },
      )
      await editHasLock.promise

      const restore = templateSyncRestoreService
        .restoreBackup({
          workspaceId: seed.workspaceId,
          installationId: installation.id,
          backupId: backup.id,
          actor: FULL,
        })
        .then(() => order.push("restore"))
      await waitUntilSomeoneWaitsOnAnAdvisoryLock()
      expect(order).toEqual([])

      editMayWrite.open()
      await Promise.all([edit, restore])

      expect(order).toEqual(["edit", "restore"])
      const after = await db.query.triggerModel.findFirst({
        where: { id: trigger.id },
      })
      // The restore read the post-edit state and put the backup back over it.
      expect(after?.name).toBe("My own name")
    }, 60_000)
  })

  describe("template version pin vs prune", () => {
    const VERSIONS = 24
    const PINNED = 3

    const seedVersions = async () => {
      const seed = await seedWorkspace({}, VERSIONS)
      for (let version = 1; version <= VERSIONS; version++) {
        await templateVersionRepository.insert({
          id: createId(),
          templateId: seed.templateId,
          workspaceId: seed.workspaceId,
          version,
          payload: {} as never,
          payloadHash: `hash-${version}`,
          formatVersion: 1,
        })
      }
      return seed
    }

    const save = async (seed: Seed) =>
      await templateRepository.saveWithVersion({
        id: seed.templateId,
        workspaceId: seed.workspaceId,
        versionId: createId(),
        set: { name: "Saved" },
        snapshot: {
          payload: {} as never,
          payloadHash: "hash-new",
          formatVersion: 1,
        },
        legacyPayloadHash: null,
      })

    const remainingVersions = async (seed: Seed) =>
      (
        await db
          .select({ version: templateVersionModel.version })
          .from(templateVersionModel)
          .where(eq(templateVersionModel.templateId, seed.templateId))
      )
        .map((row) => row.version)
        .sort((a, b) => a - b)

    test("a save without any pin prunes everything past the newest 20", async () => {
      const seed = await seedVersions()

      const saved = await save(seed)

      expect(saved?.version).toBe(VERSIONS + 1)
      const remaining = await remainingVersions(seed)
      expect(remaining[0]).toBe(6)
      expect(remaining).toHaveLength(20)
    })

    test("a version pinned by a still-uncommitted installation is never pruned by a concurrent save", async () => {
      const seed = await seedVersions()
      const pinned = barrier()
      const mayCommit = barrier()
      const pinning = db.transaction(async (tx) => {
        // The pin protocol: take the version lock, verify the version, insert the pin.
        await templateVersionRepository.lockVersions(seed.templateId, tx)
        const found = await templateVersionRepository.find(
          { templateId: seed.templateId, version: PINNED },
          tx,
        )
        expect(found).toBeDefined()
        pinned.open()
        await mayCommit.promise
        await templateInstallationRepository.create(
          {
            workspaceId: seed.workspaceId,
            templateId: seed.templateId,
            sourceTemplateId: seed.templateId,
            templateName: "Template",
            sourceWorkspaceId: "999000",
            formatVersion: 1,
            status: "pending",
            permissions,
            sourceVersion: PINNED,
          },
          tx,
        )
      })
      await pinned.promise

      const saving = save(seed)
      await waitUntilSomeoneWaitsOnAnAdvisoryLock()
      // The pin is invisible to the save's NOT EXISTS until it commits: the
      // save must be parked on the version lock instead of racing past it.
      mayCommit.open()
      await Promise.all([pinning, saving])

      const remaining = await remainingVersions(seed)
      expect(remaining).toContain(PINNED)
      expect(remaining).toEqual([PINNED, ...remaining.filter((v) => v >= 6)])
      for (const pruned of [1, 2, 4, 5]) {
        expect(remaining).not.toContain(pruned)
      }
    }, 30_000)
  })

  describe("uninstall vs workspace purge of the target", () => {
    /** The purge's own per-workspace teardown, run on the seeded workspace only. */
    const teardown = async (workspaceId: string) => {
      const workspace = await db.query.workspaceModel.findFirst({
        where: { id: workspaceId },
        columns: { id: true, ownerId: true, tenantId: true },
      })
      if (!workspace) {
        throw new Error("workspace already gone")
      }
      // Due now, like a workspace the cron picked up.
      await db
        .update(workspaceModel)
        .set({ scheduledDeletionAt: new Date(Date.now() - 1000) })
        .where(eq(workspaceModel.id, workspaceId))
      return await (
        workspaceService as unknown as {
          teardownDueWorkspace: (
            workspace: { id: string; ownerId: string; tenantId: string },
            integrations: undefined,
            deadlineAt: number,
          ) => Promise<unknown>
        }
      ).teardownDueWorkspace(workspace, undefined, Date.now() + 60_000)
    }

    test("a purge defers while an uninstall of the workspace holds its lease, then completes once it is done", async () => {
      const seed = await seedWorkspace()
      const installation = await addInstallation(seed)
      const [flow] = await db
        .insert(flowModel)
        .values({ workspaceId: seed.workspaceId, name: "Flow" })
        .returning({ id: flowModel.id })
      await db.insert(flowVersionModel).values({
        workspaceId: seed.workspaceId,
        flowId: flow.id,
        nodes: [],
        edges: [],
        isDraft: true,
        startNodeId: "1",
      })
      await db.insert(templateInstalledResourceModel).values({
        installationId: installation.id,
        workspaceId: seed.workspaceId,
        category: "flows",
        resourceKind: "flow",
        resourceId: flow.id,
        sourceResourceId: createId(),
        wasExisting: false,
        allowEdit: true,
        allowDelete: true,
      })
      await templateUninstallService.uninstallAsInstaller({
        workspaceId: seed.workspaceId,
        installationId: installation.id,
        actor: FULL,
      })
      // Requested but not claimed: it holds no lock, so it does not block.
      expect(
        await templateUninstallStateRepository.hasLiveUninstallTouchingWorkspace(
          seed.workspaceId,
        ),
      ).toBe(false)
      const claim = await templateUninstallExecuteService.claim({
        installationId: installation.id,
        workspaceId: seed.workspaceId,
      })
      if (!claim) {
        throw new Error("the uninstall could not be claimed")
      }
      expect(
        await templateUninstallStateRepository.hasLiveUninstallTouchingWorkspace(
          seed.workspaceId,
        ),
      ).toBe(true)

      // The purge meets the running uninstall: it defers, deleting nothing.
      await expect(teardown(seed.workspaceId)).resolves.toBeNull()
      expect(
        await db.query.workspaceModel.findFirst({
          where: { id: seed.workspaceId },
        }),
      ).toBeDefined()

      await templateUninstallExecuteService.run({
        ...claim,
        workspaceId: seed.workspaceId,
      })
      expect(
        await db.query.flowModel.findFirst({ where: { id: flow.id } }),
      ).toBeUndefined()

      // The next run of the purge finds nothing running and completes.
      await expect(teardown(seed.workspaceId)).resolves.toMatchObject({
        id: seed.workspaceId,
      })
      expect(
        await db.query.workspaceModel.findFirst({
          where: { id: seed.workspaceId },
        }),
      ).toBeUndefined()
      expect(
        await db.query.templateInstallationModel.findFirst({
          where: { id: installation.id },
        }),
      ).toBeUndefined()
    }, 60_000)

    test("an expired uninstall lease does not hold a purge back, and a template the workspace publishes counts", async () => {
      // Two workspaces: the publisher owns the template, the installer the copy.
      const publisher = await seedWorkspace()
      const installer = await seedWorkspace()
      const unrelated = await seedWorkspace()
      const installation = await addInstallation(publisher, {
        workspaceId: installer.workspaceId,
      })
      await db
        .update(templateInstallationModel)
        .set({
          uninstallState: "running",
          uninstallClaimToken: createId(),
          uninstallClaimedAt: new Date(Date.now() - 10 * 60 * 1000),
        })
        .where(eq(templateInstallationModel.id, installation.id))
      expect(
        await templateUninstallStateRepository.hasLiveUninstallTouchingWorkspace(
          installer.workspaceId,
        ),
      ).toBe(false)

      await db
        .update(templateInstallationModel)
        .set({ uninstallClaimedAt: new Date() })
        .where(eq(templateInstallationModel.id, installation.id))
      expect(
        await templateUninstallStateRepository.hasLiveUninstallTouchingWorkspace(
          installer.workspaceId,
        ),
      ).toBe(true)
      // Only through the template: the publisher has no installation of its own,
      // but purging it deletes the template, whose trigger updates the copy's row.
      expect(
        await templateUninstallStateRepository.hasLiveUninstallTouchingWorkspace(
          publisher.workspaceId,
        ),
      ).toBe(true)
      expect(
        await templateUninstallStateRepository.hasLiveUninstallTouchingWorkspace(
          unrelated.workspaceId,
        ),
      ).toBe(false)
    })
  })
})
