// @vitest-environment node

/**
 * A whole sync against a real Postgres: install version 1, publish version 2,
 * request a sync, claim it, run it. Covers what the mocked suites cannot:
 * the overwrite of an untouched copy, the backup taken before a locally edited
 * copy is overwritten and its restore, and a sync that has to drop a trigger
 * condition row (the trigger is switched off, and the restore switches it
 * back on).
 *
 * Commits for real, so each test deletes its workspace (everything cascades
 * from it) afterwards. Needs the template migrations applied locally.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateResourceBackupRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateModel,
  triggerModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
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

const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { templateInstallationSyncRepository } = await import(
  "@chatbotx.io/database/repositories"
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

const databaseUrl = realDatabaseUrl()
const actor = { kind: "apiToken", permission: "full" } as const
const permissions = { allowEdit: true, allowDelete: true }

type ConditionRow = {
  type: string
  sourceId: string | null
  operator: null
  value: null
}
const conditionRow = (type: string, sourceId: string | null): ConditionRow => ({
  type,
  sourceId,
  operator: null,
  value: null,
})

const buildPayload = (input: { name: string; conditions: ConditionRow[] }) => {
  const parsed = parseTemplateExport({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: "999000", tenantId: "1" },
    manifests: { tags: { "500": { name: "vip" } } },
    resources: {
      triggers: [
        {
          sourceId: "700",
          name: input.name,
          active: true,
          folderId: null,
          actions: [],
          conditions: input.conditions,
        },
      ],
    },
  })
  if (!parsed.ok) {
    throw new Error(parsed.reason)
  }
  return parsed.data
}

describe.skipIf(!databaseUrl)("template sync on a real database", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  /** Installs version 1 and publishes `second` as version 2. */
  const installThenPublish = async (second: {
    name: string
    conditions: ConditionRow[]
  }) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `template-sync-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `template-sync-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })

    const first = buildPayload({
      name: "On vip",
      conditions: [conditionRow("tagApplied", "500")],
    })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: first,
        categoryCounts: { triggers: 1 },
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
        version: 2,
      })
      .returning({ id: templateModel.id })
    const versions = [
      { version: 1, payload: first },
      { version: 2, payload: buildPayload(second) },
    ]
    for (const { version, payload } of versions) {
      await db.transaction(async (tx) => {
        await templateVersionRepository.insert(
          {
            id: createId(),
            templateId: template.id,
            workspaceId: workspace.id,
            version,
            payload,
            payloadHash: `hash-${version}`,
            formatVersion: 1,
          },
          tx,
        )
      })
    }

    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: 1,
      status: "pending",
      permissions,
      sourceVersion: 1,
    })
    const claim = await templateInstallService.claim({
      installationId: installation.id,
      workspaceId: workspace.id,
    })
    if (!claim) {
      throw new Error("the install could not be claimed")
    }
    await templateInstallService.run({
      installationId: installation.id,
      workspaceId: workspace.id,
      claimToken: claim.claimToken,
      permissions,
      payload: first,
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
    return { workspaceId: workspace.id, installationId: installation.id }
  }

  const runManualSync = async (seed: {
    workspaceId: string
    installationId: string
  }) => {
    const { syncId } = await templateSyncRequestService.request({
      ...seed,
      actor,
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
    return syncId
  }

  const theTrigger = async (workspaceId: string) => {
    const [trigger] = await db.query.triggerModel.findMany({
      where: { workspaceId },
    })
    const conditions = await db.query.conditionModel.findMany({
      where: { triggerId: trigger.id },
      columns: { type: true, sourceId: true },
    })
    return { trigger, conditions }
  }

  const installationOf = async (seed: {
    workspaceId: string
    installationId: string
  }) =>
    await templateInstallationRepository.findByIdAndWorkspace({
      id: seed.installationId,
      workspaceId: seed.workspaceId,
    })

  test("an untouched copy is overwritten with version 2, with nothing to back up", async () => {
    const seed = await installThenPublish({
      name: "On order",
      conditions: [conditionRow("newOrder", null)],
    })

    const syncId = await runManualSync(seed)

    const { trigger, conditions } = await theTrigger(seed.workspaceId)
    expect(trigger.name).toBe("On order")
    expect(conditions).toEqual([{ type: "newOrder", sourceId: null }])
    expect((await installationOf(seed))?.sourceVersion).toBe(2)
    expect(await templateResourceBackupRepository.listBySync(syncId)).toEqual(
      [],
    )
  })

  test("a locally edited copy is backed up before it is overwritten, and the backup restores it", async () => {
    const seed = await installThenPublish({
      name: "On order",
      conditions: [conditionRow("newOrder", null)],
    })
    const { trigger } = await theTrigger(seed.workspaceId)
    // The installer edits the copy by hand.
    await db
      .update(triggerModel)
      .set({ name: "My own name" })
      .where(eq(triggerModel.id, trigger.id))

    const syncId = await runManualSync(seed)

    expect((await theTrigger(seed.workspaceId)).trigger.name).toBe("On order")
    const [backup] = await templateResourceBackupRepository.listBySync(syncId)
    expect(backup).toBeDefined()

    await templateSyncRestoreService.restoreBackup({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      backupId: backup.id,
      actor,
    })

    const restored = await theTrigger(seed.workspaceId)
    expect(restored.trigger.name).toBe("My own name")
    expect(restored.conditions).toEqual([
      { type: "tagApplied", sourceId: expect.any(String) },
    ])
  })

  test("a sync that must drop a condition row switches the trigger off, and the restore switches it back on", async () => {
    const seed = await installThenPublish({
      name: "On vip",
      conditions: [conditionRow("productOrdered", "404")],
    })
    const { trigger } = await theTrigger(seed.workspaceId)
    // Locally edited, so the sync backs the copy up first.
    await db
      .update(triggerModel)
      .set({ name: "Edited" })
      .where(eq(triggerModel.id, trigger.id))

    const syncId = await runManualSync(seed)

    const afterSync = await theTrigger(seed.workspaceId)
    expect(afterSync.trigger.active).toBe(false)
    expect(afterSync.conditions).toEqual([])

    const [backup] = await templateResourceBackupRepository.listBySync(syncId)
    await templateSyncRestoreService.restoreBackup({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      backupId: backup.id,
      actor,
    })

    const restored = await theTrigger(seed.workspaceId)
    expect(restored.trigger.active).toBe(true)
    expect(restored.conditions).toHaveLength(1)
  })

  test("a replayed request with the same idempotency key returns the same sync, even after it finished", async () => {
    const seed = await installThenPublish({
      name: "On order",
      conditions: [conditionRow("newOrder", null)],
    })
    const request = (idempotencyKey?: string) =>
      templateSyncRequestService.request({
        ...seed,
        actor,
        trigger: "manual",
        idempotencyKey,
      })

    const first = await request("key-1")
    const replay = await request("key-1")
    expect(replay).toMatchObject({ syncId: first.syncId, created: false })

    const claimed = await templateSyncExecuteService.claim({
      syncId: first.syncId,
      workspaceId: seed.workspaceId,
    })
    if (!claimed) {
      throw new Error("the sync could not be claimed")
    }
    await templateSyncExecuteService.run({
      sync: claimed.sync,
      claimToken: claimed.claimToken,
    })

    // Finished, yet the same key still names the same sync (no second one).
    const afterwards = await request("key-1")
    expect(afterwards).toMatchObject({ syncId: first.syncId, created: false })
    const stored =
      await templateInstallationSyncRepository.findByIdempotencyKey({
        installationId: seed.installationId,
        key: "key-1",
      })
    expect(stored?.id).toBe(first.syncId)
  })
})
