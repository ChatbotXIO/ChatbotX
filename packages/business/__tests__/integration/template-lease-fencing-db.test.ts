// @vitest-environment node

/**
 * Lease fencing and installation visibility against a real Postgres: the
 * guards live in SQL predicates, which the unit suites (mocked repositories)
 * cannot prove.
 *
 * Commits for real, so each test deletes its workspace (everything cascades
 * from it) afterwards. Needs the template migrations applied locally.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateInstallationSyncRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateInstallationModel,
  templateInstalledResourceModel,
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test } from "vitest"

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

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: true, allowDelete: true }
const MINUTE = 60_000

describe.skipIf(!databaseUrl)("template lease fencing and visibility", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seed = async (categoryCounts: Record<string, number> = {}) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-fence-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-fence-${suffix}`, ownerId: owner.id })
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
        categoryCounts: categoryCounts as never,
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
        version: 1,
      })
      .returning({ id: templateModel.id })
    return {
      workspaceId: workspace.id,
      templateId: template.id,
      shareToken: `tok-${suffix}`,
    }
  }

  type Seed = Awaited<ReturnType<typeof seed>>

  const addInstallation = async (
    at: Seed,
    overrides: Partial<
      Parameters<typeof templateInstallationRepository.create>[0]
    > = {},
  ) =>
    await templateInstallationRepository.create({
      workspaceId: at.workspaceId,
      templateId: at.templateId,
      sourceTemplateId: at.templateId,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: 1,
      status: "completed",
      permissions,
      sourceVersion: 1,
      ...overrides,
    })

  const addCopy = async (
    at: Seed,
    installationId: string,
    category: "flows" | "products",
    detachedAt: Date | null = null,
  ) =>
    await db.insert(templateInstalledResourceModel).values({
      installationId,
      workspaceId: at.workspaceId,
      category,
      resourceKind: category === "flows" ? "flow" : "product",
      resourceId: createId(),
      sourceResourceId: createId(),
      detachedAt,
    })

  const statusOf = async (id: string) =>
    (
      await db
        .select({ status: templateInstallationModel.status })
        .from(templateInstallationModel)
        .where(eq(templateInstallationModel.id, id))
    )[0]?.status

  describe("failing an install that cannot run", () => {
    test("leaves an install whose worker still holds the lease", async () => {
      const at = await seed()
      const row = await addInstallation(at, { status: "installing" })
      await db
        .update(templateInstallationModel)
        .set({ claimToken: "live", claimedAt: new Date() })
        .where(eq(templateInstallationModel.id, row.id))

      const failed = await templateInstallationRepository.failUnclaimed({
        id: row.id,
        errorCode: "workspaceOwnerBlocked",
        errorMessage: "blocked",
        leaseExpiredBefore: new Date(Date.now() - 15 * MINUTE),
      })

      expect(failed).toBe(false)
      expect(await statusOf(row.id)).toBe("installing")
    })

    test("fails a pending install and one whose lease ran out", async () => {
      const at = await seed()
      const pending = await addInstallation(at, { status: "pending" })
      const other = await seed()
      const stale = await addInstallation(other, { status: "installing" })
      await db
        .update(templateInstallationModel)
        .set({
          claimToken: "dead",
          claimedAt: new Date(Date.now() - 30 * MINUTE),
        })
        .where(eq(templateInstallationModel.id, stale.id))

      for (const id of [pending.id, stale.id]) {
        await templateInstallationRepository.failUnclaimed({
          id,
          errorCode: "workspaceOwnerBlocked",
          errorMessage: "blocked",
          leaseExpiredBefore: new Date(Date.now() - 15 * MINUTE),
        })
        expect(await statusOf(id)).toBe("failed")
      }
    })
  })

  test("a staged-object cleanup releases only the lease it took", async () => {
    const at = await seed()
    const row = await addInstallation(at, {
      status: "failed",
      stagingGeneration: 1,
    })
    await db
      .update(templateInstallationModel)
      .set({ completedAt: new Date(Date.now() - 60 * MINUTE) })
      .where(eq(templateInstallationModel.id, row.id))
    const claimFor = () =>
      templateInstallationRepository.claimStagedObjectsCleanup({
        id: row.id,
        completedBefore: new Date(),
        leaseExpiredBefore: new Date(Date.now() + MINUTE),
      })

    const first = await claimFor()
    // The first worker's lease expires and another worker claims the row.
    const second = await claimFor()
    expect(first && second).toBeTruthy()

    // The first (stale) worker releases late: the newer lease must survive.
    await templateInstallationRepository.releaseStagedObjectsCleanup({
      id: row.id,
      claimedAt: first?.claimedAt as Date,
    })
    const [held] = await db
      .select({ at: templateInstallationModel.stagedCleanupClaimedAt })
      .from(templateInstallationModel)
      .where(eq(templateInstallationModel.id, row.id))
    expect(held?.at?.getTime()).toBe(second?.claimedAt.getTime())

    await templateInstallationRepository.releaseStagedObjectsCleanup({
      id: row.id,
      claimedAt: second?.claimedAt as Date,
    })
    const [freed] = await db
      .select({ at: templateInstallationModel.stagedCleanupClaimedAt })
      .from(templateInstallationModel)
      .where(eq(templateInstallationModel.id, row.id))
    expect(freed?.at).toBeNull()
  })

  test("a pair's categories count only live installs and attached copies", async () => {
    const at = await seed()
    const live = await addInstallation(at)
    await addCopy(at, live.id, "flows")
    await addCopy(at, live.id, "products", new Date())
    const gone = await addInstallation(at, { status: "uninstalled" })
    await addCopy(at, gone.id, "products")

    const categories =
      await templateInstallationSyncRepository.listInstalledCategoriesByPair({
        workspaceId: at.workspaceId,
        sourceTemplateId: at.templateId,
      })

    expect(categories).toEqual(["flows"])
  })

  // The install page offers "update" for the newest copy: its flags must be
  // that copy's, not an aggregate over older ones.
  test("the installed copy behind a share token reports the newest row's own flags", async () => {
    const at = await seed()
    await addInstallation(at, { autoUpdate: true, publisherUninstallGrant: 1 })
    const newest = await addInstallation(at, {
      autoUpdate: false,
      publisherUninstallGrant: 0,
    })
    await addInstallation(at, { status: "failed", autoUpdate: true })

    const installed =
      await templateInstallationRepository.listInstalledByShareToken({
        shareToken: at.shareToken,
        workspaceIds: [at.workspaceId],
      })

    expect(installed.get(at.workspaceId)).toEqual({
      id: newest.id,
      granted: false,
      autoUpdate: false,
    })
  })

  test("the batched reads return only the asked rows of the asked workspace", async () => {
    const at = await seed()
    const other = await seed()
    const first = await addInstallation(at)
    const second = await addInstallation(at)
    await addInstallation(at)
    const foreign = await addInstallation(other)
    await addCopy(at, first.id, "flows")
    await addCopy(at, second.id, "products")
    await addCopy(other, foreign.id, "flows")

    const rows = await templateInstallationRepository.listByIdsAndWorkspace({
      ids: [first.id, second.id, foreign.id],
      workspaceId: at.workspaceId,
    })
    expect(rows.map((row) => row.id).sort()).toEqual(
      [first.id, second.id].sort(),
    )

    const copies =
      await templateInstallationSyncRepository.listInstalledResourcesByInstallationIds(
        [first.id, second.id],
      )
    expect(
      copies.map((row) => [row.installationId, row.category]).sort(),
    ).toEqual(
      [
        [first.id, "flows"],
        [second.id, "products"],
      ].sort(),
    )
    expect(
      await templateInstallationRepository.listByIdsAndWorkspace({
        ids: [],
        workspaceId: at.workspaceId,
      }),
    ).toEqual([])
  })

  describe("which installations a restricted member sees", () => {
    const visibleNames = async (at: Seed) =>
      (
        await templateInstallationRepository.listPage({
          workspaceId: at.workspaceId,
          limit: 50,
          visibleCategories: ["products", "couponTopics", "productCategories"],
        })
      ).map((row) => row.id)

    test("an install with copies is judged by them", async () => {
      const at = await seed({ products: 1 })
      const products = await addInstallation(at)
      await addCopy(at, products.id, "products")
      const mixed = await addInstallation(at)
      await addCopy(at, mixed.id, "products")
      await addCopy(at, mixed.id, "flows")

      expect(await visibleNames(at)).toEqual([products.id])
    })

    test("an install without copies is judged by its template, and hidden once the template is gone", async () => {
      const productsOnly = await seed({ products: 1, flows: 0 })
      const pending = await addInstallation(productsOnly, { status: "pending" })
      expect(await visibleNames(productsOnly)).toEqual([pending.id])

      const withFlows = await seed({ products: 1, flows: 2 })
      await addInstallation(withFlows, { status: "failed" })
      expect(await visibleNames(withFlows)).toEqual([])

      const orphan = await seed({ products: 1 })
      await addInstallation(orphan, {
        status: "failed",
        sourceTemplateId: "990900000009999",
        templateId: null,
      })
      expect(await visibleNames(orphan)).toEqual([])
    })
  })
})
