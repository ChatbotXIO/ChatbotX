// @vitest-environment node

/**
 * Template behavior that only a real Postgres can prove: the collision policy
 * against the real tag / custom-field find-or-create, the partial unique index
 * that keeps one in-flight install per (workspace, template), the claim CAS,
 * and the lock-precedence lookup the guards depend on. The unit suites mock
 * the data layer, so none of these can regress there.
 *
 * Every test runs in a transaction that is always rolled back, so nothing is
 * left behind. Needs the template migrations applied to the local database.
 */

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateInstalledResourceRepository,
} from "@chatbotx.io/database/repositories"
import {
  conditionModel,
  tagModel,
  type templateInstallationModel,
  templateInstalledResourceModel,
  templateModel,
  triggerModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { describe, expect, test, vi } from "vitest"

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

const { predictAction } = await import("../../src/template/collision-policy")
const { tagService } = await import("../../src/tag/service")
const { customFieldService } = await import("../../src/custom-field/service")
const { triggersAdapter } = await import("../../src/template/adapters/triggers")

const databaseUrl = realDatabaseUrl()
const ROOT_TENANT_ID = "1"

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const inRolledBackTransaction = async (
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as DatabaseClient)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

const seedWorkspace = async (tx: DatabaseClient) => {
  const suffix = createId()
  const [owner] = await tx
    .insert(userModel)
    .values({ email: `template-db-${suffix}@example.test` })
    .returning({ id: userModel.id })
  const [workspace] = await tx
    .insert(workspaceModel)
    .values({ name: `template-db-${suffix}`, ownerId: owner.id })
    .returning({ id: workspaceModel.id })
  const [template] = await tx
    .insert(templateModel)
    .values({
      workspaceId: workspace.id,
      tenantId: ROOT_TENANT_ID,
      name: "Template",
      selection: { mode: "all" } as never,
      payload: {},
      categoryCounts: {},
      formatVersion: 2,
      shareToken: `tok-${suffix}`,
      defaultPermissions: { allowEdit: true, allowDelete: true } as never,
    })
    .returning({ id: templateModel.id })
  return { workspaceId: workspace.id, templateId: template.id }
}

const insertInstallation = async (
  tx: DatabaseClient,
  fixture: { workspaceId: string; templateId: string },
  overrides: Partial<typeof templateInstallationModel.$inferInsert> = {},
) =>
  await templateInstallationRepository.create(
    {
      workspaceId: fixture.workspaceId,
      templateId: fixture.templateId,
      sourceTemplateId: fixture.templateId,
      templateName: "Template",
      sourceWorkspaceId: fixture.workspaceId,
      formatVersion: 2,
      status: "completed",
      permissions: { allowEdit: true, allowDelete: true } as never,
      ...overrides,
    },
    tx,
  )

const trackResource = async (
  tx: DatabaseClient,
  installation: { id: string; workspaceId: string },
  overrides: Partial<typeof templateInstalledResourceModel.$inferInsert>,
) =>
  await tx.insert(templateInstalledResourceModel).values({
    installationId: installation.id,
    workspaceId: installation.workspaceId,
    category: "flows",
    resourceKind: "flow",
    resourceId: "9001",
    sourceResourceId: "src-1",
    ...overrides,
  })

describe.skipIf(!databaseUrl)(
  "template collision policy on a real database",
  () => {
    test("tags: an existing name is reused, a new one is created", async () => {
      await inRolledBackTransaction(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const [existing] = await tx
          .insert(tagModel)
          .values({ workspaceId, name: "vip" })
          .returning({ id: tagModel.id })

        const rows = await tagService.upsertByNames({
          workspaceId,
          names: ["vip", "fresh"],
          tx,
        })
        const byName = new Map(rows.map((row) => [row.name, row.id]))

        expect(byName.get("vip")).toBe(existing.id)
        const freshId = byName.get("fresh")
        expect(freshId).toBeDefined()
        expect(freshId).not.toBe(existing.id)
        const stored = await tx.query.tagModel.findMany({
          where: { workspaceId },
          columns: { id: true, name: true },
        })
        expect(stored.map((tag) => tag.name).sort()).toEqual(["fresh", "vip"])
        expect(predictAction("tags", { found: true })).toBe("reuse")
        expect(predictAction("tags", { found: false })).toBe("create")
      })
    })

    test("custom fields: same type reused, other type renamed, absent created", async () => {
      await inRolledBackTransaction(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const [age] = await customFieldService
          .resolveByNameAndType({
            workspaceId,
            fields: [{ name: "age", type: "number" }],
            tx,
          })
          .then((result) => [...result.resolved.values()])

        const { resolved, createdIds } =
          await customFieldService.resolveByNameAndType({
            workspaceId,
            fields: [
              { name: "age", type: "number" },
              { name: "Age", type: "shortText" },
              { name: "city", type: "shortText" },
            ],
            tx,
          })
        const reused = resolved.get(
          customFieldResolutionKey({ name: "age", type: "number" }),
        )
        const renamed = resolved.get(
          customFieldResolutionKey({ name: "Age", type: "shortText" }),
        )
        const created = resolved.get(
          customFieldResolutionKey({ name: "city", type: "shortText" }),
        )

        expect(reused?.id).toBe(age.id)
        expect(createdIds).not.toContain(age.id)
        expect(predictAction("customFields", { found: true })).toBe("reuse")

        expect(renamed?.renamed).toBe(true)
        expect(renamed?.name.toLowerCase()).not.toBe("age")
        expect(createdIds).toContain(renamed?.id)
        expect(
          predictAction("customFields", {
            found: false,
            sameNameOtherType: true,
          }),
        ).toBe("rename")

        expect(created?.renamed).toBe(false)
        expect(createdIds).toContain(created?.id)
        expect(predictAction("customFields", { found: false })).toBe("create")
      })
    })
  },
)

describe.skipIf(!databaseUrl)(
  "template installation rows on a real database",
  () => {
    test("a second in-flight install of one template is rejected by the unique index", async () => {
      await inRolledBackTransaction(async (tx) => {
        const fixture = await seedWorkspace(tx)
        await insertInstallation(tx, fixture, { status: "pending" })

        // A savepoint keeps the outer transaction usable after the violation.
        await expect(
          tx.transaction(async (inner) => {
            await insertInstallation(
              inner as unknown as DatabaseClient,
              fixture,
              {
                status: "installing",
              },
            )
          }),
        ).rejects.toThrow()

        // A finished install never blocks a new one.
        await insertInstallation(tx, fixture, { status: "completed" })
      })
    })

    test("claim is a compare-and-set: one winner, then a reclaim after the lease expires", async () => {
      await inRolledBackTransaction(async (tx) => {
        const fixture = await seedWorkspace(tx)
        const installation = await insertInstallation(tx, fixture, {
          status: "pending",
        })
        const base = { id: installation.id, workspaceId: fixture.workspaceId }
        const freshLease = new Date(Date.now() - 60 * 60 * 1000)

        const first = await templateInstallationRepository.claim(
          { ...base, claimToken: "a", leaseExpiredBefore: freshLease },
          tx,
        )
        const second = await templateInstallationRepository.claim(
          { ...base, claimToken: "b", leaseExpiredBefore: freshLease },
          tx,
        )
        expect(first?.claimToken).toBe("a")
        expect(first?.attempts).toBe(1)
        expect(second).toBeNull()

        const reclaimed = await templateInstallationRepository.claim(
          {
            ...base,
            claimToken: "c",
            leaseExpiredBefore: new Date(Date.now() + 60 * 1000),
          },
          tx,
        )
        expect(reclaimed?.claimToken).toBe("c")
        expect(reclaimed?.attempts).toBe(2)
      })
    })
  },
)

describe.skipIf(!databaseUrl)(
  "template lock precedence on a real database",
  () => {
    const findBlocking = (
      tx: DatabaseClient,
      workspaceId: string,
      extra: { excludeInstallationIds?: string[] } = {},
    ) =>
      templateInstalledResourceRepository.findBlocking(
        {
          workspaceId,
          resourceKind: "flow",
          resourceIds: ["9001"],
          permission: "allowEdit",
          ...extra,
        },
        tx,
      )

    test("the most restrictive of several installations wins", async () => {
      await inRolledBackTransaction(async (tx) => {
        const fixture = await seedWorkspace(tx)
        const open = await insertInstallation(tx, fixture)
        const locked = await insertInstallation(tx, fixture)
        await trackResource(tx, open, { allowEdit: true })
        expect(await findBlocking(tx, fixture.workspaceId)).toEqual([])

        await trackResource(tx, locked, { allowEdit: false })
        expect(await findBlocking(tx, fixture.workspaceId)).toEqual(["9001"])
        expect(
          await findBlocking(tx, fixture.workspaceId, {
            excludeInstallationIds: [locked.id],
          }),
        ).toEqual([])
      })
    })

    test("a reused, detached or source-deleted row never locks", async () => {
      await inRolledBackTransaction(async (tx) => {
        const fixture = await seedWorkspace(tx)
        const reused = await insertInstallation(tx, fixture)
        await trackResource(tx, reused, { allowEdit: false, wasExisting: true })
        expect(await findBlocking(tx, fixture.workspaceId)).toEqual([])

        const detached = await insertInstallation(tx, fixture)
        await trackResource(tx, detached, {
          allowEdit: false,
          sourceResourceId: "src-2",
          detachedAt: new Date(),
        })
        expect(await findBlocking(tx, fixture.workspaceId)).toEqual([])

        const orphaned = await insertInstallation(tx, fixture, {
          sourceDeletedAt: new Date(),
        })
        await trackResource(tx, orphaned, {
          allowEdit: false,
          sourceResourceId: "src-3",
        })
        expect(await findBlocking(tx, fixture.workspaceId)).toEqual([])
      })
    })

    test("two active rows for one source resource of an installation are impossible", async () => {
      await inRolledBackTransaction(async (tx) => {
        const fixture = await seedWorkspace(tx)
        const installation = await insertInstallation(tx, fixture)
        await trackResource(tx, installation, {})

        await expect(
          tx.transaction(async (inner) => {
            await trackResource(
              inner as unknown as DatabaseClient,
              installation,
              {
                resourceId: "9002",
              },
            )
          }),
        ).rejects.toThrow()
      })
    })
  },
)

describe.skipIf(!databaseUrl)(
  "template trigger conditions on a real database",
  () => {
    const buildContext = (
      tx: DatabaseClient,
      workspaceId: string,
      idMaps: Record<string, Map<string, string>>,
    ) => ({
      tx,
      workspaceId,
      installationId: "inst-1",
      idMaps,
      track: vi.fn(),
      warn: vi.fn(),
    })

    const conditionsOf = async (tx: DatabaseClient, triggerId: string) =>
      await tx.query.conditionModel.findMany({
        where: { triggerId },
        columns: { type: true, sourceId: true },
      })

    test("install writes the rows remapped; a row that cannot be remapped is dropped and the trigger starts inactive", async () => {
      await inRolledBackTransaction(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const [tag] = await tx
          .insert(tagModel)
          .values({ workspaceId, name: "vip" })
          .returning({ id: tagModel.id })
        const ctx = buildContext(tx, workspaceId, {
          tag: new Map([["src-tag", tag.id]]),
        })

        await triggersAdapter.insert(ctx as never, [
          {
            sourceId: "src-trigger",
            name: "On vip",
            active: true,
            folderId: null,
            actions: [],
            conditions: [
              {
                type: "tagApplied",
                sourceId: "src-tag",
                operator: null,
                value: null,
              },
              {
                type: "pipelineItemCreated",
                sourceId: "999",
                operator: null,
                value: null,
              },
            ],
          },
        ])

        const [trigger] = await tx.query.triggerModel.findMany({
          where: { workspaceId },
        })
        expect(trigger.active).toBe(false)
        expect(await conditionsOf(tx, trigger.id)).toEqual([
          { type: "tagApplied", sourceId: tag.id },
        ])
        expect(ctx.warn).toHaveBeenCalledWith(
          expect.objectContaining({ entityKind: "referenceRemoved" }),
        )
      })
    })

    test("a trigger that kept every row keeps its active flag", async () => {
      await inRolledBackTransaction(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const ctx = buildContext(tx, workspaceId, {})

        await triggersAdapter.insert(ctx as never, [
          {
            sourceId: "src-trigger",
            name: "On order",
            active: true,
            folderId: null,
            actions: [],
            conditions: [
              { type: "newOrder", sourceId: null, operator: null, value: null },
            ],
          },
        ])

        const [trigger] = await tx.query.triggerModel.findMany({
          where: { workspaceId },
        })
        expect(trigger.active).toBe(true)
        expect(await conditionsOf(tx, trigger.id)).toHaveLength(1)
      })
    })

    test("sync replaces the rows; an entry from before conditions shipped leaves them alone", async () => {
      await inRolledBackTransaction(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const ctx = buildContext(tx, workspaceId, {})
        const [trigger] = await tx
          .insert(triggerModel)
          .values({ workspaceId, name: "T", actions: [], active: true })
          .returning({ id: triggerModel.id })
        await tx.insert(conditionModel).values({
          id: createId(),
          triggerId: trigger.id,
          type: "newContact",
        })
        const base = {
          sourceId: "src-trigger",
          name: "T",
          active: true,
          folderId: null,
          actions: [],
        }

        await triggersAdapter.sync.update(ctx as never, [
          { resourceId: trigger.id, entry: base },
        ])
        expect(await conditionsOf(tx, trigger.id)).toEqual([
          { type: "newContact", sourceId: null },
        ])

        await triggersAdapter.sync.update(ctx as never, [
          {
            resourceId: trigger.id,
            entry: {
              ...base,
              conditions: [
                {
                  type: "newOrder",
                  sourceId: null,
                  operator: null,
                  value: null,
                },
              ],
            },
          },
        ])
        expect(await conditionsOf(tx, trigger.id)).toEqual([
          { type: "newOrder", sourceId: null },
        ])
        expect(
          await triggersAdapter.sync.project(tx, trigger.id),
        ).toMatchObject({
          conditions: [
            { type: "newOrder", sourceId: null, operator: null, value: null },
          ],
        })

        const [after] = await tx
          .select({ active: triggerModel.active })
          .from(triggerModel)
          .where(eq(triggerModel.id, trigger.id))
        expect(after.active).toBe(true)
      })
    })

    test("a sync that drops a row switches the trigger off", async () => {
      await inRolledBackTransaction(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const ctx = buildContext(tx, workspaceId, {})
        const [trigger] = await tx
          .insert(triggerModel)
          .values({ workspaceId, name: "T", actions: [], active: true })
          .returning({ id: triggerModel.id })

        await triggersAdapter.sync.update(ctx as never, [
          {
            resourceId: trigger.id,
            entry: {
              sourceId: "src-trigger",
              name: "T",
              active: true,
              folderId: null,
              actions: [],
              conditions: [
                {
                  type: "productOrdered",
                  sourceId: "404",
                  operator: null,
                  value: null,
                },
              ],
            },
          },
        ])

        const [after] = await tx
          .select({ active: triggerModel.active })
          .from(triggerModel)
          .where(eq(triggerModel.id, trigger.id))
        expect(after.active).toBe(false)
        expect(await conditionsOf(tx, trigger.id)).toEqual([])
      })
    })
  },
)
