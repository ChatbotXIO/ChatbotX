// @vitest-environment node

/**
 * The uninstall engine's state machine on a real Postgres: the workspace-fenced
 * claim, the database-clock lease, the abandoned-uninstall terminal transition,
 * the single-statement retry reset and freeze bookkeeping, and the sync closer
 * that must leave a running sync alone.
 *
 * Commits for real, so each test deletes its workspace afterwards.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateInstallationModel,
  templateInstallationSyncModel,
  templateInstalledResourceModel,
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
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
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { templateUninstallSweepService } = await import(
  "../../src/template/uninstall-sweep.service"
)

const databaseUrl = realDatabaseUrl()
const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!databaseUrl)("template uninstall engine", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedInstallation = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-engine-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-engine-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {},
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: { allowEdit: true, allowDelete: true },
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: 1,
      status: "completed",
      permissions: { allowEdit: true, allowDelete: true },
    })
    return { workspaceId: workspace.id, installationId: installation.id }
  }

  const requestUninstall = async (
    seed: Awaited<ReturnType<typeof seedInstallation>>,
  ) => {
    const operation = await templateUninstallStateRepository.createOperation({
      workspaceId: seed.workspaceId,
      templateId: null,
      publisherRef: "p",
      requestedByKind: "installer",
      requestedBy: null,
    })
    await templateUninstallStateRepository.request({
      id: seed.installationId,
      operationId: operation.id,
      requestedByKind: "installer",
      requestedBy: null,
    })
  }

  const stateOf = async (installationId: string) =>
    await db.query.templateInstallationModel.findFirst({
      where: { id: installationId },
      columns: {
        uninstallState: true,
        uninstallErrorCode: true,
        uninstallClaimToken: true,
      },
    })

  const ageRequest = async (installationId: string, ms: number) => {
    await db
      .update(templateInstallationModel)
      .set({ uninstallRequestedAt: new Date(Date.now() - ms) })
      .where(eq(templateInstallationModel.id, installationId))
  }

  test("the claim carries the workspace: a mismatched pair never takes the lease", async () => {
    const seed = await seedInstallation()
    await requestUninstall(seed)

    const wrong = await templateUninstallStateRepository.claim({
      id: seed.installationId,
      workspaceId: "1",
      token: "t-wrong",
    })
    expect(wrong).toBeNull()
    expect((await stateOf(seed.installationId))?.uninstallState).toBe("pending")

    const right = await templateUninstallStateRepository.claim({
      id: seed.installationId,
      workspaceId: seed.workspaceId,
      token: "t-right",
    })
    expect(right?.id).toBe(seed.installationId)
    expect((await stateOf(seed.installationId))?.uninstallState).toBe("running")
  })

  test("the lease is judged on the database clock: a fresh claim is live, an old one is stale", async () => {
    const seed = await seedInstallation()
    await requestUninstall(seed)
    await templateUninstallStateRepository.claim({
      id: seed.installationId,
      workspaceId: seed.workspaceId,
      token: "t1",
    })
    const stale = async () =>
      (await templateUninstallStateRepository.listStale(10_000)).some(
        (row) => row.id === seed.installationId,
      )
    expect(await stale()).toBe(false)

    await db.execute(
      sql`UPDATE "TemplateInstallation" SET "uninstallClaimedAt" = now() - interval '10 minutes' WHERE "id" = ${seed.installationId}`,
    )
    expect(await stale()).toBe(true)
  })

  test("an uninstall nobody finished within the window ends failed and is requestable again", async () => {
    const seed = await seedInstallation()
    await requestUninstall(seed)
    await ageRequest(seed.installationId, 2 * DAY_MS)

    expect(
      await templateUninstallSweepService.abandonStale(100),
    ).toBeGreaterThanOrEqual(1)

    const row = await stateOf(seed.installationId)
    expect(row?.uninstallState).toBe("failed")
    expect(row?.uninstallErrorCode).toBe("templateUninstallAbandoned")
    // `failed` is requestable: a new request resumes.
    const again = await templateUninstallStateRepository.request({
      id: seed.installationId,
      operationId: (
        await templateUninstallStateRepository.createOperation({
          workspaceId: seed.workspaceId,
          templateId: null,
          publisherRef: "p",
          requestedByKind: "installer",
          requestedBy: null,
        })
      ).id,
      requestedByKind: "installer",
      requestedBy: null,
    })
    expect(again?.attempt).toBe(2)
  })

  test("a young request, and an old one still held by a live claim, are not abandoned", async () => {
    const young = await seedInstallation()
    await requestUninstall(young)
    const held = await seedInstallation()
    await requestUninstall(held)
    await ageRequest(held.installationId, 2 * DAY_MS)
    await templateUninstallStateRepository.claim({
      id: held.installationId,
      workspaceId: held.workspaceId,
      token: "live",
    })

    await templateUninstallSweepService.abandonStale(100)

    expect((await stateOf(young.installationId))?.uninstallState).toBe(
      "pending",
    )
    expect((await stateOf(held.installationId))?.uninstallState).toBe("running")
  })

  test("resetFailedToDeleting restores every failed and blocked outcome in one go and touches nothing else", async () => {
    const seed = await seedInstallation()
    const outcomes = [
      "failed",
      "failedModified",
      "failedUnverified",
      "blockedByReference",
      "blockedByReferenceModified",
      "blockedByReferenceUnverified",
      "deleted",
      "keptShared",
    ] as const
    for (const outcome of outcomes) {
      await db.insert(templateInstalledResourceModel).values({
        installationId: seed.installationId,
        workspaceId: seed.workspaceId,
        category: "flows",
        resourceKind: "flow",
        resourceId: createId(),
        sourceResourceId: outcome,
        wasExisting: false,
        uninstallOutcome: outcome,
      })
    }

    await templateUninstallStateRepository.resetFailedToDeleting(
      seed.installationId,
    )

    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
      columns: { sourceResourceId: true, uninstallOutcome: true },
    })
    const bySource = Object.fromEntries(
      rows.map((row) => [row.sourceResourceId, row.uninstallOutcome]),
    )
    expect(bySource).toEqual({
      failed: "deleting",
      failedModified: "deletingModified",
      failedUnverified: "deletingUnverified",
      blockedByReference: "deleting",
      blockedByReferenceModified: "deletingModified",
      blockedByReferenceUnverified: "deletingUnverified",
      deleted: "deleted",
      keptShared: "keptShared",
    })
  })

  test("setFrozenFrom and setEffects write every row in one statement each", async () => {
    const seed = await seedInstallation()
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      const [row] = await db
        .insert(templateInstalledResourceModel)
        .values({
          installationId: seed.installationId,
          workspaceId: seed.workspaceId,
          category: "flows",
          resourceKind: "flow",
          resourceId: createId(),
          sourceResourceId: createId(),
          wasExisting: false,
        })
        .returning({ id: templateInstalledResourceModel.id })
      ids.push(row.id)
    }

    await templateUninstallStateRepository.setFrozenFrom(
      ids.map((id, index) => ({ id, flags: { n: index, on: true } })),
    )
    await templateUninstallStateRepository.setEffects(
      ids.map((id) => ({
        id,
        effects: [{ name: "x.y", args: { id } }],
      })),
    )

    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
      columns: { id: true, uninstallFrozenFrom: true, uninstallEffects: true },
    })
    for (const row of rows) {
      const index = ids.indexOf(row.id)
      expect(row.uninstallFrozenFrom).toEqual({ n: index, on: true })
      expect(row.uninstallEffects).toEqual([
        { name: "x.y", args: { id: row.id } },
      ])
    }
    // An empty batch is a no-op, not a malformed statement.
    await templateUninstallStateRepository.setFrozenFrom([])
    await templateUninstallStateRepository.setEffects([])
  })

  test("closeUnclaimed closes a pending sync and a dead worker's, never a live lease", async () => {
    const seedA = await seedInstallation()
    const seedB = await seedInstallation()
    const seedC = await seedInstallation()
    const make = async (seed: typeof seedA) =>
      await templateInstallationSyncRepository.createIfAbsent({
        id: createId(),
        workspaceId: seed.workspaceId,
        installationId: seed.installationId,
        trigger: "autoUpdate",
        requestedVersion: 1,
        idempotencyKey: createId(),
      })
    const pending = await make(seedA)
    const running = await make(seedB)
    const abandoned = await make(seedC)
    expect(pending && running && abandoned).toBeTruthy()
    for (const [sync, seed] of [
      [running, seedB],
      [abandoned, seedC],
    ] as const) {
      await templateInstallationSyncRepository.claim({
        id: sync?.id ?? "",
        workspaceId: seed.workspaceId,
        claimToken: "w",
        leaseExpiredBefore: new Date(Date.now() - 60_000),
      })
    }
    const leaseExpiredBefore = new Date(Date.now() - 60_000)
    await db
      .update(templateInstallationSyncModel)
      .set({ claimedAt: new Date(Date.now() - 120_000) })
      .where(eq(templateInstallationSyncModel.id, abandoned?.id ?? ""))

    for (const sync of [pending, running, abandoned]) {
      await templateInstallationSyncRepository.closeUnclaimed({
        id: sync?.id ?? "",
        status: "skipped",
        errorCode: "workspaceOwnerBlocked",
        leaseExpiredBefore,
      })
    }

    const statuses = await db.query.templateInstallationSyncModel.findMany({
      where: {
        id: { in: [pending?.id ?? "", running?.id ?? "", abandoned?.id ?? ""] },
      },
      columns: { id: true, status: true },
    })
    expect(statuses.find((row) => row.id === abandoned?.id)?.status).toBe(
      "skipped",
    )
    expect(statuses.find((row) => row.id === pending?.id)?.status).toBe(
      "skipped",
    )
    expect(statuses.find((row) => row.id === running?.id)?.status).toBe(
      "running",
    )
  })
})
