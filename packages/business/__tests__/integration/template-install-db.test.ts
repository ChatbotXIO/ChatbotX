// @vitest-environment node

/**
 * A whole install against a real Postgres: claim, manifest resolution, adapter
 * insert, provenance tracking with the per-item lock, completion, redelivery.
 * The unit suites mock every one of these seams, so the ordering between them
 * (manifests before triggers, tracked rows flushed before the lease-fenced
 * completion) is only proven here.
 *
 * Commits for real (the install runs its own transaction), so each test
 * deletes its workspace — everything cascades from it — afterwards.
 * Needs the template migrations applied to the local database.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateInstalledResourceRepository,
} from "@chatbotx.io/database/repositories"
import {
  conditionModel,
  tagModel,
  templateInstalledResourceModel,
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

const { triggersAdapter } = await import("../../src/template/adapters/triggers")
const { templateInstallService } = await import(
  "../../src/template/install.service"
)

const databaseUrl = realDatabaseUrl()

const flowEntry = (sourceId: string, name: string) => ({
  sourceId,
  name,
  active: true,
  enableInInbox: true,
  startNodeId: `${sourceId}0`,
  nodes: [],
  edges: [],
  folderId: null,
})

const keywordEntry = (sourceId: string, keyword: string, flowId: string) => ({
  sourceId,
  type: "inbound",
  keywords: [keyword],
  text: null,
  flowId,
  folderId: null,
})

/** Two keywords, each firing its own flow: every copy is created in the install transaction. */
const keywordsToTwoFlows = {
  flows: [flowEntry("801", "First"), flowEntry("802", "Second")],
  keywords: [
    keywordEntry("901", "first", "801"),
    keywordEntry("902", "second", "802"),
  ],
}

const buildPayload = (resources?: Record<string, unknown>) => {
  const parsed = parseTemplateExport({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: "999000", tenantId: "1" },
    manifests: {
      tags: { "500": { name: "vip" } },
      customFields: { "600": { name: "Age", type: "number" } },
    },
    resources: resources ?? {
      triggers: [
        {
          sourceId: "700",
          name: "On vip",
          active: true,
          folderId: null,
          actions: [],
          conditions: [
            {
              type: "tagApplied",
              sourceId: "500",
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

describe.skipIf(!databaseUrl)("template install on a real database", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedPendingInstall = async (permissions: {
    allowEdit: boolean
    allowDelete: boolean
  }) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `template-install-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `template-install-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    // A live source template: an install whose template is gone locks nothing.
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
        defaultPermissions: permissions,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: 1,
      status: "pending",
      permissions,
    })
    return { workspaceId: workspace.id, installationId: installation.id }
  }

  const runInstall = async (
    seed: { workspaceId: string; installationId: string },
    permissions: { allowEdit: boolean; allowDelete: boolean },
    resources?: Record<string, unknown>,
  ) => {
    const claim = await templateInstallService.claim(seed)
    if (!claim) {
      throw new Error("the install could not be claimed")
    }
    await templateInstallService.run({
      installationId: seed.installationId,
      workspaceId: seed.workspaceId,
      claimToken: claim.claimToken,
      permissions,
      payload: buildPayload(resources),
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
    return claim
  }

  test("installs the manifests and a trigger whose condition points at the new tag", async () => {
    const permissions = { allowEdit: true, allowDelete: true }
    const seed = await seedPendingInstall(permissions)
    await runInstall(seed, permissions)

    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: seed.installationId,
        workspaceId: seed.workspaceId,
      })
    expect(installation?.status).toBe("completed")

    const [tag] = await db.query.tagModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [trigger] = await db.query.triggerModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const conditions = await db.query.conditionModel.findMany({
      where: { triggerId: trigger.id },
    })
    expect(trigger.active).toBe(true)
    expect(conditions).toHaveLength(1)
    expect(conditions[0].sourceId).toBe(tag.id)

    const tracked = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    expect(tracked.map((row) => row.resourceKind).sort()).toEqual([
      "customField",
      "tag",
      "trigger",
    ])
    expect(tracked.every((row) => !row.wasExisting)).toBe(true)
  })

  test("installs two keywords that each fire a different copied flow", async () => {
    const permissions = { allowEdit: true, allowDelete: true }
    const seed = await seedPendingInstall(permissions)
    await runInstall(seed, permissions, keywordsToTwoFlows)

    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: seed.installationId,
        workspaceId: seed.workspaceId,
      })
    // The fixture flows were never published at the source, so they install as
    // drafts and say so (`flowNotPublished`): the install is partial.
    expect(installation?.status).toBe("partial")

    const flows = await db.query.flowModel.findMany({
      where: { workspaceId: seed.workspaceId },
      columns: { id: true, name: true },
    })
    const flowIdByName = new Map(flows.map((flow) => [flow.name, flow.id]))
    const keywords = await db.query.automatedResponseModel.findMany({
      where: { workspaceId: seed.workspaceId },
      columns: { keywords: true, flowId: true },
    })
    expect(
      keywords
        .map((row) => [row.keywords[0], row.flowId])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["first", flowIdByName.get("First")],
      ["second", flowIdByName.get("Second")],
    ])
  })

  test("an existing tag is reused, and a view-only install locks the copy but not the reused row", async () => {
    const permissions = { allowEdit: false, allowDelete: true }
    const seed = await seedPendingInstall(permissions)
    const [existing] = await db
      .insert(tagModel)
      .values({ workspaceId: seed.workspaceId, name: "vip" })
      .returning({ id: tagModel.id })
    await runInstall(seed, permissions)

    const [trigger] = await db.query.triggerModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const conditions = await db.query.conditionModel.findMany({
      where: { triggerId: trigger.id },
    })
    expect(conditions[0].sourceId).toBe(existing.id)

    const tagRow = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId, resourceKind: "tag" },
    })
    expect(tagRow?.wasExisting).toBe(true)

    const blocking = (resourceKind: "trigger" | "tag", id: string) =>
      templateInstalledResourceRepository.findBlocking({
        workspaceId: seed.workspaceId,
        resourceKind,
        resourceIds: [id],
        permission: "allowEdit",
      })
    expect(await blocking("trigger", trigger.id)).toEqual([trigger.id])
    expect(await blocking("tag", existing.id)).toEqual([])
  })

  test("a redelivered job cannot claim a finished install, and no duplicate is written", async () => {
    const permissions = { allowEdit: true, allowDelete: true }
    const seed = await seedPendingInstall(permissions)
    await runInstall(seed, permissions)

    expect(await templateInstallService.claim(seed)).toBeNull()
    const rows = await db
      .select({ id: templateInstalledResourceModel.id })
      .from(templateInstalledResourceModel)
      .where(
        eq(templateInstalledResourceModel.installationId, seed.installationId),
      )
    expect(rows).toHaveLength(3)
  })
})

describe.skipIf(!databaseUrl)(
  "template trigger collection on a real database",
  () => {
    const created: { workspaceId: string; userId: string }[] = []

    afterEach(async () => {
      for (const { workspaceId, userId } of created.splice(0)) {
        await db
          .delete(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
        await db.delete(userModel).where(eq(userModel.id, userId))
      }
    })

    test("a trigger's condition rows travel with it and name their sequence and category as dependencies", async () => {
      const suffix = createId()
      const [owner] = await db
        .insert(userModel)
        .values({ email: `template-collect-${suffix}@example.test` })
        .returning({ id: userModel.id })
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `template-collect-${suffix}`, ownerId: owner.id })
        .returning({ id: workspaceModel.id })
      created.push({ workspaceId: workspace.id, userId: owner.id })
      const [trigger] = await db
        .insert(triggerModel)
        .values({
          workspaceId: workspace.id,
          name: "T",
          actions: [],
          active: true,
        })
        .returning({ id: triggerModel.id })
      await db.insert(conditionModel).values([
        {
          id: createId(),
          triggerId: trigger.id,
          type: "subscribedToSequence",
          sourceId: "4001",
        },
        {
          id: createId(),
          triggerId: trigger.id,
          type: "categoryAddedToCart",
          sourceId: "4002",
        },
        { id: createId(), triggerId: trigger.id, type: "newOrder" },
      ])

      const result = await triggersAdapter.collector.collect(workspace.id, [
        trigger.id,
      ])

      expect(result.entries[0].conditions).toHaveLength(3)
      expect(result.hardDependencies).toContainEqual({
        category: "sequences",
        sourceId: "4001",
      })
      expect([...result.productCategoryIds]).toEqual(["4002"])
    })
  },
)
