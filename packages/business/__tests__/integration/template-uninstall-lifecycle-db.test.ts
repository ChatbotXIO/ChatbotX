// @vitest-environment node

/**
 * The publisher-facing lifecycle of an uninstall on a real Postgres: grouped
 * install counts, a reinstall followed by a second uninstall, the one audit
 * notice per operation, and a blocked target owner ending `skipped`.
 *
 * Commits for real, so each test deletes its workspace (everything cascades
 * from it) afterwards. Needs the template migrations applied locally.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateModel,
  templateUninstallOperationModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

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

const mocks = vi.hoisted(() => ({ queueAdd: vi.fn() }))

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
  defaultQueue: { add: mocks.queueAdd },
}))
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService } = await import(
  "../../src/template/uninstall-execute.service"
)
const { templateUninstallNoticeService } = await import(
  "../../src/template/uninstall-notice.service"
)
const { templateUninstallSweepService } = await import(
  "../../src/template/uninstall-sweep.service"
)

const databaseUrl = realDatabaseUrl()
const FULL = { kind: "apiToken", permission: "full" } as const
const permissions = { allowEdit: true, allowDelete: true }

describe.skipIf(!databaseUrl)("template uninstall lifecycle", () => {
  const created: { workspaceId: string; userId: string }[] = []

  beforeEach(() => {
    mocks.queueAdd.mockReset()
    mocks.queueAdd.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedTemplate = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-lifecycle-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-lifecycle-${suffix}`, ownerId: owner.id })
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
    return { workspaceId: workspace.id, templateId: template.id }
  }

  type Seed = Awaited<ReturnType<typeof seedTemplate>>

  /** A finished install of the template, counted as one successful install event. */
  const addInstallation = async (seed: Seed, publisherRef?: string) => {
    const installation = await templateInstallationRepository.create({
      workspaceId: seed.workspaceId,
      templateId: seed.templateId,
      sourceTemplateId: seed.templateId,
      templateName: "Template",
      sourceWorkspaceId: seed.workspaceId,
      formatVersion: 1,
      status: "completed",
      permissions,
      sourceVersion: 1,
      publisherUninstallGrant: 1,
      ...(publisherRef ? { publisherRef } : {}),
    })
    await templateInstallationRepository.recordInstallEvent(installation.id)
    return installation
  }

  const executeUninstall = async (seed: Seed, installationId: string) => {
    const claim = await templateUninstallExecuteService.claim({
      installationId,
      workspaceId: seed.workspaceId,
    })
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: seed.workspaceId,
    })
  }

  const installationOf = async (seed: Seed, id: string) =>
    await templateInstallationRepository.findByIdAndWorkspace({
      id,
      workspaceId: seed.workspaceId,
    })

  const publisherRow = async (seed: Seed) => {
    const [row] = await templateRepository.listPublisherRows({
      templateId: seed.templateId,
      limit: 5,
    })
    return row
  }

  /** Limits the notice sweep to this test's workspace so shared dev data is never touched. */
  const scopeNoticesTo = (seed: Seed) => {
    const original =
      templateUninstallStateRepository.listUndeliveredNotices.bind(
        templateUninstallStateRepository,
      )
    vi.spyOn(
      templateUninstallStateRepository,
      "listUndeliveredNotices",
    ).mockImplementation(async (_limit, tx) =>
      (await original(1000, tx)).filter(
        (operation) => operation.workspaceId === seed.workspaceId,
      ),
    )
  }

  const noticesSent = () =>
    mocks.queueAdd.mock.calls.map(
      ([, payload]) =>
        (payload as { data: { auditLogId: string } }).data.auditLogId,
    )

  test("three grouped installations sum into one row; after the uninstall installCount is 0 and totalInstallEvents unchanged", async () => {
    const seed = await seedTemplate()
    const first = await addInstallation(seed)
    const second = await addInstallation(seed, first.publisherRef)
    const third = await addInstallation(seed, first.publisherRef)

    const before = await publisherRow(seed)
    expect(before.publisherRef).toBe(first.publisherRef)
    expect(before.installCount).toBe(3)
    expect(before.totalInstallEvents).toBe(3)
    expect(before.active).toBe(true)

    const result = await templateUninstallService.uninstallAsPublisher({
      workspaceId: seed.workspaceId,
      templateId: seed.templateId,
      publisherRef: first.publisherRef,
      actor: FULL,
    })
    expect(result.installations).toBe(3)
    for (const installation of [first, second, third]) {
      await executeUninstall(seed, installation.id)
    }

    const after = await publisherRow(seed)
    expect(after.installCount).toBe(0)
    expect(after.totalInstallEvents).toBe(3)
    expect(after.active).toBe(false)
    expect(after.uninstallState).toBe("done")
  })

  test("a reinstall after an uninstall is a NEW installation with the same publisherRef, and uninstalling it creates a new operation", async () => {
    const seed = await seedTemplate()
    const first = await addInstallation(seed)
    const firstRun = await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: first.id,
      actor: FULL,
    })
    await executeUninstall(seed, first.id)
    expect((await installationOf(seed, first.id))?.status).toBe("uninstalled")

    const again = await addInstallation(seed, first.publisherRef)

    expect(again.id).not.toBe(first.id)
    expect(again.publisherRef).toBe(first.publisherRef)
    expect((await installationOf(seed, first.id))?.status).toBe("uninstalled")

    const secondRun = await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: again.id,
      actor: FULL,
    })
    await executeUninstall(seed, again.id)

    expect(secondRun.operationId).not.toBe(firstRun.operationId)
    expect((await installationOf(seed, first.id))?.uninstallOperationId).toBe(
      firstRun.operationId,
    )
    expect((await installationOf(seed, again.id))?.uninstallOperationId).toBe(
      secondRun.operationId,
    )
  })

  test("one audit summary per operation across three grouped installations, under the operation's stable auditLogId", async () => {
    const seed = await seedTemplate()
    const first = await addInstallation(seed)
    const second = await addInstallation(seed, first.publisherRef)
    const third = await addInstallation(seed, first.publisherRef)
    scopeNoticesTo(seed)

    const { operationId } = await templateUninstallService.uninstallAsPublisher(
      {
        workspaceId: seed.workspaceId,
        templateId: seed.templateId,
        publisherRef: first.publisherRef,
        actor: FULL,
      },
    )
    for (const installation of [first, second, third]) {
      await executeUninstall(seed, installation.id)
    }
    const [operation] = await db
      .select()
      .from(templateUninstallOperationModel)
      .where(eq(templateUninstallOperationModel.id, operationId))

    expect(await templateUninstallNoticeService.deliverPending()).toBe(1)

    expect(noticesSent()).toEqual([operation.auditLogId])
    expect(mocks.queueAdd.mock.calls[0][2]).toEqual({
      jobId: `audit-log-${operation.auditLogId}`,
    })
    // Delivered once: a second sweep sends nothing.
    expect(await templateUninstallNoticeService.deliverPending()).toBe(0)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("a failed enqueue leaves the notice owed and the redelivery reuses the same auditLogId", async () => {
    const seed = await seedTemplate()
    const only = await addInstallation(seed)
    scopeNoticesTo(seed)
    const { operationId } = await templateUninstallService.uninstallAsInstaller(
      { workspaceId: seed.workspaceId, installationId: only.id, actor: FULL },
    )
    await executeUninstall(seed, only.id)

    mocks.queueAdd.mockRejectedValueOnce(new Error("redis down"))
    expect(await templateUninstallNoticeService.deliverPending()).toBe(0)
    expect(await templateUninstallNoticeService.deliverPending()).toBe(1)

    const [operation] = await db
      .select()
      .from(templateUninstallOperationModel)
      .where(eq(templateUninstallOperationModel.id, operationId))
    expect(noticesSent()).toEqual([operation.auditLogId, operation.auditLogId])
    expect(operation.noticeDeliveredAt).toBeInstanceOf(Date)
  })

  test("an earlier operation's undelivered notice is preserved when a later operation finishes", async () => {
    const seed = await seedTemplate()
    const first = await addInstallation(seed)
    scopeNoticesTo(seed)
    const earlier = await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: first.id,
      actor: FULL,
    })
    await executeUninstall(seed, first.id)
    // Its notice has not gone out yet when the installer reinstalls and removes it again.
    const again = await addInstallation(seed, first.publisherRef)
    const later = await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: again.id,
      actor: FULL,
    })
    await executeUninstall(seed, again.id)

    expect(await templateUninstallNoticeService.deliverPending()).toBe(2)

    const operations = await db
      .select()
      .from(templateUninstallOperationModel)
      .where(eq(templateUninstallOperationModel.workspaceId, seed.workspaceId))
    const idOf = (operationId: string) =>
      operations.find((operation) => operation.id === operationId)?.auditLogId
    expect(noticesSent().sort()).toEqual(
      [idOf(earlier.operationId), idOf(later.operationId)].sort(),
    )
    expect(new Set(noticesSent()).size).toBe(2)
    expect(operations.every((operation) => operation.noticeDeliveredAt)).toBe(
      true,
    )
  })

  test("a blocked target owner ends the uninstall as skipped with workspaceOwnerBlocked, and the sweep never lists it again", async () => {
    const seed = await seedTemplate()
    const only = await addInstallation(seed)
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: only.id,
      actor: FULL,
    })
    const staleBefore = await templateUninstallSweepService.listStale(10_000)
    expect(staleBefore.map((row) => row.id)).toContain(only.id)

    await templateUninstallExecuteService.skipBlocked(only.id)

    const after = await installationOf(seed, only.id)
    expect(after?.uninstallState).toBe("skipped")
    expect(after?.uninstallErrorCode).toBe("workspaceOwnerBlocked")
    expect(after?.uninstallClaimToken).toBeNull()
    // The installation was never uninstalled: nothing was deleted.
    expect(after?.status).toBe("completed")
    const staleAfter = await templateUninstallSweepService.listStale(10_000)
    expect(staleAfter.map((row) => row.id)).not.toContain(only.id)
    // A repeat is a no-op, not an error.
    await expect(
      templateUninstallExecuteService.skipBlocked(only.id),
    ).resolves.toBeUndefined()
  })
})
