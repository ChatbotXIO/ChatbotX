// @vitest-environment node

/**
 * The application-owned CacheVersion bump of the template store, on a real
 * Postgres: a bump commits and rolls back with its write, concurrent bumps are
 * never lost, every store write path advances the tenant's version, and a
 * template edit racing a listing attach ends with the later commit holding the
 * higher version and a snapshot at that version showing both changes.
 *
 * Versions are asserted by ordering (`>`), not by exact counts, except where
 * only one writer touches the row. Commits for real; each test's tenant,
 * workspace and user are deleted afterwards.
 */

import { type DatabaseClient, db, eq, sql } from "@chatbotx.io/database/client"
import {
  cacheVersionRepository,
  templateRepository,
  templateStoreRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateModel,
  tenantModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { barrier, heldBy, within } from "../helpers/template-concurrency"

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
const fanOut = vi.hoisted(() => ({ enqueue: vi.fn() }))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueFanOutTemplateUpdate: fanOut.enqueue,
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))

const { bumpTemplateStoreVersion } = await import(
  "../../src/template/store-cache"
)
const { templateService } = await import("../../src/template/service")
const { templateStoreService } = await import(
  "../../src/template/store.service"
)

const databaseUrl = realDatabaseUrl()
const NAMESPACE = "template-store"
const FULL = { kind: "apiToken", permission: "full" } as const
const PARALLEL_BUMPS = 8
const WAIT_ATTEMPTS = 400
const WAIT_STEP_MS = 25

class RollbackSignal extends Error {}

/** What a transaction that still holds the version row reports before it waits: its backend pid and its own (uncommitted) version. */
type HeldVersion = { pid: number; version: bigint }

const readHeldVersion = async (
  tenantId: string,
  tx: DatabaseClient,
): Promise<HeldVersion> => {
  const pidResult = await tx.execute<{ pid: number }>(
    sql`select pg_backend_pid() as pid`,
  )
  const { version } = await cacheVersionRepository.read(
    { namespace: NAMESPACE, scopeId: tenantId },
    tx,
  )
  return { pid: Number(pidResult.rows[0].pid), version: BigInt(version) }
}

/** Polls until a backend of this database is blocked by `holderPid` itself. */
const waitUntilBlockedBy = async (holderPid: number): Promise<void> => {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
    const result = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and ${holderPid} = any (pg_blocking_pids(pid))`,
    )
    if (Number(result.rows[0].waiting) > 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
  }
  throw new Error(`no session was ever blocked by backend ${holderPid}`)
}

describe.skipIf(!databaseUrl)("template store version bump", () => {
  const created: { userId: string; tenantId: string; workspaceId: string }[] =
    []

  afterEach(async () => {
    for (const { userId, tenantId, workspaceId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.execute(
        sql`delete from "CacheVersion" where "namespace" = ${NAMESPACE} and "scopeId" = ${tenantId}`,
      )
      await db.delete(tenantModel).where(eq(tenantModel.id, tenantId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seed = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `store-bump-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [tenant] = await db
      .insert(tenantModel)
      .values({ ownerId: owner.id })
      .returning({ id: tenantModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({
        name: `store-bump-${suffix}`,
        ownerId: owner.id,
        tenantId: tenant.id,
      })
      .returning({ id: workspaceModel.id })
    created.push({
      userId: owner.id,
      tenantId: tenant.id,
      workspaceId: workspace.id,
    })
    const ids = {
      ownerId: owner.id,
      tenantId: tenant.id,
      workspaceId: workspace.id,
    }
    return { ...ids, templateId: await insertTemplate(ids, `tok-${suffix}`) }
  }

  const insertTemplate = async (
    scope: { tenantId: string; workspaceId: string },
    shareToken: string,
  ): Promise<string> => {
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: scope.workspaceId,
        tenantId: scope.tenantId,
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {} as never,
        categoryCounts: {},
        formatVersion: 1,
        shareToken,
        shareEnabled: true,
        defaultPermissions: { allowEdit: true, allowDelete: true },
      })
      .returning({ id: templateModel.id })
    return template.id
  }

  const versionOf = async (tenantId: string): Promise<bigint> =>
    BigInt(
      (
        await cacheVersionRepository.read({
          namespace: NAMESPACE,
          scopeId: tenantId,
        })
      ).version,
    )

  describe("the bump itself", () => {
    test("creates the row at 1 and then increments, committing with its transaction", async () => {
      const { tenantId } = await seed()
      expect(await versionOf(tenantId)).toBe(0n)

      await db.transaction((tx) => bumpTemplateStoreVersion(tenantId, tx))
      expect(await versionOf(tenantId)).toBe(1n)

      await db.transaction((tx) => bumpTemplateStoreVersion(tenantId, tx))
      expect(await versionOf(tenantId)).toBe(2n)
    })

    test("a rolled-back transaction leaves the version unchanged", async () => {
      const { tenantId } = await seed()
      await db.transaction((tx) => bumpTemplateStoreVersion(tenantId, tx))
      const before = await versionOf(tenantId)

      await expect(
        db.transaction(async (tx) => {
          await bumpTemplateStoreVersion(tenantId, tx)
          throw new RollbackSignal()
        }),
      ).rejects.toBeInstanceOf(RollbackSignal)

      expect(await versionOf(tenantId)).toBe(before)
    })

    test("concurrent bumps never lose an increment", async () => {
      const { tenantId } = await seed()

      await Promise.all(
        Array.from({ length: PARALLEL_BUMPS }, () =>
          db.transaction((tx) => bumpTemplateStoreVersion(tenantId, tx)),
        ),
      )

      expect(await versionOf(tenantId)).toBe(BigInt(PARALLEL_BUMPS))
    })

    test("a bump of one tenant leaves another tenant's version alone", async () => {
      const first = await seed()
      const second = await seed()

      await db.transaction((tx) => bumpTemplateStoreVersion(first.tenantId, tx))

      expect(await versionOf(first.tenantId)).toBeGreaterThan(0n)
      expect(await versionOf(second.tenantId)).toBe(0n)
    })
  })

  describe("every store write path advances the tenant's version", () => {
    test("rotating the share token", async () => {
      const { tenantId, workspaceId, templateId } = await seed()
      const before = await versionOf(tenantId)

      await templateService.rotateShareToken({
        workspaceId,
        templateId,
        actor: FULL,
      })

      expect(await versionOf(tenantId)).toBeGreaterThan(before)
    })

    test("changing the sharing settings", async () => {
      const { tenantId, workspaceId, templateId } = await seed()
      const before = await versionOf(tenantId)

      await templateService.updateShareSettings({
        workspaceId,
        templateId,
        shareEnabled: false,
        actor: FULL,
      })

      expect(await versionOf(tenantId)).toBeGreaterThan(before)
    })

    test("saving an existing template, then the auto-update fan-out runs after commit", async () => {
      const { ownerId, tenantId, workspaceId, templateId } = await seed()
      fanOut.enqueue.mockReset()
      const before = await versionOf(tenantId)

      const saved = await templateService.createOrUpdate({
        workspaceId,
        tenantId,
        createdBy: ownerId,
        name: "Renamed",
        selection: { mode: "all" },
        defaultPermissions: { allowEdit: true, allowDelete: true },
        createInstallFolder: false,
        defaultAutoUpdate: false,
        existingTemplateId: templateId,
        actor: FULL,
      })

      expect(saved.name).toBe("Renamed")
      expect(await versionOf(tenantId)).toBeGreaterThan(before)
      // The seeded payload is `{}`; the real snapshot of the workspace differs,
      // so the content hash changes and the version advances.
      expect(saved.version).toBeGreaterThan(1)
      expect(fanOut.enqueue).toHaveBeenCalledTimes(1)
    })

    test("soft-deleting the template", async () => {
      const { tenantId, workspaceId, templateId } = await seed()
      const before = await versionOf(tenantId)

      await templateService.softDelete({
        workspaceId,
        templateId,
        actor: FULL,
      })

      expect(await versionOf(tenantId)).toBeGreaterThan(before)
    })

    test("a failed template write (nothing found) does not move the version", async () => {
      const { tenantId, workspaceId } = await seed()
      const before = await versionOf(tenantId)

      await expect(
        templateService.rotateShareToken({
          workspaceId,
          templateId: createId(),
          actor: FULL,
        }),
      ).rejects.toMatchObject({ message: "Template not found" })

      expect(await versionOf(tenantId)).toBe(before)
    })

    test("a store write through the store lock: category create, listing attach and removal", async () => {
      const { ownerId, tenantId, templateId } = await seed()
      const scope = { kind: "owner", ownerId } as const
      let last = await versionOf(tenantId)

      await templateStoreService.createCategory({
        scope,
        name: "Bots",
        actorUserId: ownerId,
      })
      let current = await versionOf(tenantId)
      expect(current).toBeGreaterThan(last)
      last = current

      await templateStoreService.addListing({
        scope,
        templateId,
        categoryIds: [],
        languages: [],
        channels: [],
        actorUserId: ownerId,
      })
      current = await versionOf(tenantId)
      expect(current).toBeGreaterThan(last)
      last = current

      const { listings } = await templateStoreService.listForAdmin({
        scope,
        page: 1,
        perPage: 10,
      })
      await templateStoreService.removeListing({
        scope,
        listingId: listings[0].listingId,
      })
      expect(await versionOf(tenantId)).toBeGreaterThan(last)
    })
  })

  describe("a template edit racing a listing attach", () => {
    const requireHeld = (held: HeldVersion | undefined): HeldVersion => {
      if (!held) {
        throw new Error("the first transaction never reported its version")
      }
      return held
    }

    /** Both changes are visible in a snapshot read at the final version, which is above the first commit's. */
    const expectSnapshotShowsBoth = async (
      tenantId: string,
      templateId: string,
      expectedToken: string,
      versionHeldByFirstCommit: bigint,
    ) => {
      const finalVersion = await versionOf(tenantId)
      expect(finalVersion).toBeGreaterThan(versionHeldByFirstCommit)
      const snapshot = await templateStoreRepository.readSnapshot(tenantId)
      expect(BigInt(snapshot.version)).toBe(finalVersion)
      const row = snapshot.rows.find((entry) => entry.templateId === templateId)
      expect(row?.shareToken).toBe(expectedToken)
    }

    test("the attach commits first, then the edit: the edit's version is higher", async () => {
      const { ownerId, tenantId, workspaceId, templateId } = await seed()
      const attachHoldsVersion = barrier()
      const attachMayCommit = barrier()
      let held: HeldVersion | undefined

      const attach = db.transaction(async (tx) => {
        await templateStoreRepository.lockTenantStore(tenantId, tx)
        await templateStoreRepository.createListing(
          {
            tenantId,
            templateId,
            languages: [],
            channels: [],
            createdBy: ownerId,
          },
          tx,
        )
        await bumpTemplateStoreVersion(tenantId, tx)
        held = await readHeldVersion(tenantId, tx)
        attachHoldsVersion.open()
        await attachMayCommit.promise
      })
      await within(heldBy(attachHoldsVersion.promise, attach))

      const edit = templateService.rotateShareToken({
        workspaceId,
        templateId,
        actor: FULL,
      })
      // The edit blocks on the version row the attach still holds.
      await within(waitUntilBlockedBy(requireHeld(held).pid))
      attachMayCommit.open()
      const edited = await within(Promise.all([attach, edit]))

      await expectSnapshotShowsBoth(
        tenantId,
        templateId,
        edited[1].shareToken,
        requireHeld(held).version,
      )
    })

    test("the edit commits first, then the attach: the attach's version is higher", async () => {
      const { ownerId, tenantId, workspaceId, templateId } = await seed()
      const newToken = `rotated-${createId()}`
      const editHoldsVersion = barrier()
      const editMayCommit = barrier()
      let held: HeldVersion | undefined

      const edit = db.transaction(async (tx) => {
        await templateRepository.rotateShareToken(
          { id: templateId, workspaceId, shareToken: newToken },
          tx,
        )
        await bumpTemplateStoreVersion(tenantId, tx)
        held = await readHeldVersion(tenantId, tx)
        editHoldsVersion.open()
        await editMayCommit.promise
      })
      await within(heldBy(editHoldsVersion.promise, edit))

      const attach = templateStoreService.addListing({
        scope: { kind: "owner", ownerId },
        templateId,
        categoryIds: [],
        languages: [],
        channels: [],
        actorUserId: ownerId,
      })
      // The attach blocks on the version row the edit still holds.
      await within(waitUntilBlockedBy(requireHeld(held).pid))
      editMayCommit.open()
      await within(Promise.all([edit, attach]))

      await expectSnapshotShowsBoth(
        tenantId,
        templateId,
        newToken,
        requireHeld(held).version,
      )
    })
  })
})
