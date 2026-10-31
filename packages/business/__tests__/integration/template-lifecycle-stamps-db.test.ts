// @vitest-environment node

/**
 * Template lifecycle stamps against a real Postgres: a hard delete of a
 * Template (what a workspace purge cascades into) stamps `sourceDeletedAt` on
 * its installations, and a reinstall completion moves the publisher's
 * "last installed" date.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateInstallationModel,
  templateModel,
  templateUninstallOperationModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test } from "vitest"

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

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: true, allowDelete: true }

describe.skipIf(!databaseUrl)("template lifecycle stamps", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seed = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-stamp-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-stamp-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {} as never,
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: workspace.id,
      formatVersion: 1,
      status: "completed",
      permissions,
      sourceVersion: 1,
    })
    return { workspaceId: workspace.id, templateId: template.id, installation }
  }

  test("a hard delete of the template stamps sourceDeletedAt on its installations", async () => {
    const { templateId, installation } = await seed()

    await db.delete(templateModel).where(eq(templateModel.id, templateId))

    const after = await db.query.templateInstallationModel.findFirst({
      where: { id: installation.id },
    })
    expect(after?.templateId).toBeNull()
    expect(after?.sourceDeletedAt).toBeInstanceOf(Date)
  })

  test("a reinstall completion moves the publisher's last-installed date", async () => {
    const { templateId, installation } = await seed()
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await db
      .update(templateInstallationModel)
      .set({ completedAt: longAgo })
      .where(eq(templateInstallationModel.id, installation.id))

    await templateInstallationRepository.recordInstallEvent(installation.id)

    const [row] = await templateRepository.listPublisherRows({
      templateId,
      limit: 5,
    })
    expect(row.totalInstallEvents).toBe(1)
    // A real Date: the API schema and the page cursor both need one.
    expect(row.lastInstalledAt).toBeInstanceOf(Date)
    expect((row.lastInstalledAt as Date).getTime()).toBeGreaterThan(
      longAgo.getTime() + 24 * 60 * 60 * 1000,
    )
  })

  test("the publisher sees the latest finished uninstall's counts, and none before", async () => {
    const { workspaceId, templateId, installation } = await seed()
    const [before] = await templateRepository.listPublisherRows({
      templateId,
      limit: 5,
    })
    expect(before.uninstallCounts).toBeNull()

    const [operation] = await db
      .insert(templateUninstallOperationModel)
      .values({
        workspaceId,
        templateId,
        publisherRef: installation.publisherRef,
        requestedByKind: "publisher",
        state: "done",
        counts: { deleted: 3, keptShared: 2 } as never,
        auditLogId: createId(),
      })
      .returning({ id: templateUninstallOperationModel.id })
    await db
      .update(templateInstallationModel)
      .set({
        status: "uninstalled",
        uninstallState: "done",
        uninstallRequestedAt: new Date(),
        uninstallOperationId: operation.id,
      })
      .where(eq(templateInstallationModel.id, installation.id))

    const [after] = await templateRepository.listPublisherRows({
      templateId,
      limit: 5,
    })
    expect(after.uninstallCounts).toMatchObject({ deleted: 3, keptShared: 2 })
    // Counts only: nothing that identifies the target's resources.
    expect(Object.keys(after.uninstallCounts ?? {})).not.toContain("ids")

    // A reinstall makes the installer active again: the old run's counts go.
    await templateInstallationRepository.create({
      workspaceId,
      templateId,
      sourceTemplateId: templateId,
      templateName: "Template",
      sourceWorkspaceId: workspaceId,
      formatVersion: 1,
      status: "completed",
      permissions,
      sourceVersion: 1,
      publisherRef: installation.publisherRef,
    })
    const [reinstalled] = await templateRepository.listPublisherRows({
      templateId,
      limit: 5,
    })
    expect(reinstalled.active).toBe(true)
    expect(reinstalled.uninstallCounts).toBeNull()
  })

  test("owed after-publish effects are recorded, listed for the sweep and cleared by value", async () => {
    const { installation } = await seed()
    const a = { flowId: "1", versionId: "10" }
    const b = { flowId: "2", versionId: "20" }

    await templateInstallationRepository.addPendingPublishEffects({
      id: installation.id,
      effects: [a],
    })
    await templateInstallationRepository.addPendingPublishEffects({
      id: installation.id,
      effects: [b],
    })
    expect(
      await templateInstallationRepository.findPendingPublishEffects(
        installation.id,
      ),
    ).toEqual([a, b])

    const owing =
      await templateInstallationRepository.listWithPendingPublishEffects({
        settledBefore: new Date(Date.now() + 60_000),
        limit: 100,
      })
    expect(owing.map((row) => row.id)).toContain(installation.id)

    await templateInstallationRepository.clearPendingPublishEffects({
      id: installation.id,
      done: [a],
    })
    expect(
      await templateInstallationRepository.findPendingPublishEffects(
        installation.id,
      ),
    ).toEqual([b])

    await templateInstallationRepository.clearPendingPublishEffects({
      id: installation.id,
      done: [b],
    })
    expect(
      await templateInstallationRepository.findPendingPublishEffects(
        installation.id,
      ),
    ).toEqual([])
    const after = await db.query.templateInstallationModel.findFirst({
      where: { id: installation.id },
      columns: { pendingPublishEffects: true },
    })
    expect(after?.pendingPublishEffects).toBeNull()
  })

  test("the pending-effects scan is oldest-first and bounded", async () => {
    const first = await seed()
    const second = await seed()
    for (const [offset, { installation }] of [first, second].entries()) {
      await templateInstallationRepository.addPendingPublishEffects({
        id: installation.id,
        effects: [{ flowId: "1", versionId: "10" }],
      })
      await db
        .update(templateInstallationModel)
        .set({ updatedAt: new Date(Date.now() - (2 - offset) * 3_600_000) })
        .where(eq(templateInstallationModel.id, installation.id))
    }

    const [oldest] =
      await templateInstallationRepository.listWithPendingPublishEffects({
        settledBefore: new Date(),
        limit: 1,
      })
    // Other suites' rows may be older; the rows seeded here keep their order.
    const both =
      await templateInstallationRepository.listWithPendingPublishEffects({
        settledBefore: new Date(),
        limit: 1000,
      })
    const ids = both.map((row) => row.id)
    expect(ids.indexOf(first.installation.id)).toBeLessThan(
      ids.indexOf(second.installation.id),
    )
    expect(oldest).toBeDefined()
  })

  describe("staged-object cleanup by generation", () => {
    const failedAt = async (installationId: string, completedAt: Date) => {
      await db
        .update(templateInstallationModel)
        .set({ status: "failed", completedAt })
        .where(eq(templateInstallationModel.id, installationId))
    }
    const claimWindow = () => ({
      completedBefore: new Date(Date.now() - 60_000),
      leaseExpiredBefore: new Date(Date.now() - 600_000),
    })

    test("a failed install owes its generation only once its lease window passed", async () => {
      const { installation } = await seed()
      await failedAt(installation.id, new Date())

      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...claimWindow(),
        }),
      ).toBeNull()

      await failedAt(installation.id, new Date(Date.now() - 3_600_000))
      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...claimWindow(),
        }),
      ).toMatchObject({ from: 0, to: 0 })
    })

    test("a retry moves to the next generation; cleaning the failed one never reaches it", async () => {
      const { installation, workspaceId } = await seed()
      await failedAt(installation.id, new Date(Date.now() - 3_600_000))

      const retried = await templateInstallationRepository.resetFailed({
        id: installation.id,
        workspaceId,
        installedBy: null,
        installedByKind: "apiToken",
      })
      expect(retried?.stagingGeneration).toBe(1)

      const claim =
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...claimWindow(),
        })
      // Generation 0 (the failed attempt) is owed; generation 1 (the retry) is not.
      expect(claim).toMatchObject({ from: 0, to: 0 })

      await templateInstallationRepository.advanceStagedCleanedGeneration({
        id: installation.id,
        from: 0,
        to: 0,
      })
      await templateInstallationRepository.releaseStagedObjectsCleanup(
        installation.id,
      )
      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...claimWindow(),
        }),
      ).toBeNull()
    })

    test("a second retry before any cleanup leaves both older generations owed", async () => {
      const { installation, workspaceId } = await seed()
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await failedAt(installation.id, new Date(Date.now() - 3_600_000))
        await templateInstallationRepository.resetFailed({
          id: installation.id,
          workspaceId,
          installedBy: null,
          installedByKind: "apiToken",
        })
      }

      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...claimWindow(),
        }),
      ).toMatchObject({ from: 0, to: 1 })
    })

    test("the lease keeps a second worker out until it is released or expires", async () => {
      const { installation } = await seed()
      await failedAt(installation.id, new Date(Date.now() - 3_600_000))
      const window = claimWindow()

      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...window,
        }),
      ).not.toBeNull()
      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...window,
        }),
      ).toBeNull()

      await templateInstallationRepository.releaseStagedObjectsCleanup(
        installation.id,
      )
      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...window,
        }),
      ).not.toBeNull()

      // A worker that died holding it: the lease expires.
      await db
        .update(templateInstallationModel)
        .set({ stagedCleanupClaimedAt: new Date(Date.now() - 3_600_000) })
        .where(eq(templateInstallationModel.id, installation.id))
      expect(
        await templateInstallationRepository.claimStagedObjectsCleanup({
          id: installation.id,
          ...window,
        }),
      ).not.toBeNull()
    })

    test("an unfinished cleanup stays owed: the generation is not stamped", async () => {
      const { installation } = await seed()
      await failedAt(installation.id, new Date(Date.now() - 3_600_000))
      await templateInstallationRepository.claimStagedObjectsCleanup({
        id: installation.id,
        ...claimWindow(),
      })
      // The delete failed: the worker only gives the lease back.
      await templateInstallationRepository.releaseStagedObjectsCleanup(
        installation.id,
      )

      const due =
        await templateInstallationRepository.listWithStagedObjectsToClean({
          ...claimWindow(),
          limit: 1000,
        })
      expect(due.map((row) => row.id)).toContain(installation.id)
    })

    test("the cleaned generation only moves forward from the value it read", async () => {
      const { installation } = await seed()
      await templateInstallationRepository.advanceStagedCleanedGeneration({
        id: installation.id,
        from: 1,
        to: 1,
      })
      const row = await db.query.templateInstallationModel.findFirst({
        where: { id: installation.id },
        columns: { stagedCleanedGeneration: true },
      })
      expect(row?.stagedCleanedGeneration).toBe(-1)
    })
  })

  test("a sync keeps the fingerprint of the request that created it", async () => {
    const { workspaceId, installation } = await seed()
    const row = await templateInstallationSyncRepository.createIfAbsent({
      id: createId(),
      workspaceId,
      installationId: installation.id,
      trigger: "reinstall",
      requestedVersion: 1,
      idempotencyKey: "key-1",
      requestFingerprint: "abc123",
    })
    expect(row?.requestFingerprint).toBe("abc123")

    const found = await templateInstallationSyncRepository.findByIdempotencyKey(
      {
        installationId: installation.id,
        key: "key-1",
      },
    )
    expect(found?.requestFingerprint).toBe("abc123")
  })
})
