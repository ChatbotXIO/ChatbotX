// @vitest-environment node

/**
 * An uninstall against a real Postgres, end to end: the request, Phase A
 * (decide, freeze, tombstone), Phase B (drain and delete), the fenced
 * finalization and the operation snapshot. The unit suites mock every seam;
 * this proves the ordering between them and the SQL (closure probes, locks,
 * cascades) the mocks cannot.
 *
 * Commits for real, so each test deletes its workspace (everything cascades
 * from it) afterwards. Needs the template migrations applied locally.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import {
  aiAgentModel,
  aiFileModel,
  automatedResponseModel,
  broadcastModel,
  contactModel,
  contactsOnSequenceModel,
  flowModel,
  flowVersionModel,
  folderModel,
  inboxModel,
  integrationMessengerModel,
  leaderboardModel,
  orderItemModel,
  orderModel,
  pipelineItemModel,
  pipelineModel,
  pipelineStageModel,
  productModel,
  reflinkModel,
  sequenceModel,
  templateInstalledResourceModel,
  templateModel,
  triggerModel,
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
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/events")>()),
  updateTriggerCache: vi.fn().mockResolvedValue(undefined),
}))
// The request enqueues a job; the test drives the executor itself.
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueUninstallTemplate: vi.fn().mockResolvedValue(undefined),
}))
// Post-commit effects need Redis and storage: none are registered here, so an
// unknown effect is skipped and cleared.
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { assertEditable, assertReferencable } = await import(
  "../../src/template/installed-resource.service"
)
const { UNINSTALL_HANDLER_BY_KIND } = await import(
  "../../src/template/adapters/uninstall-handlers"
)
const { templateUninstallCancelService } = await import(
  "../../src/template/uninstall-cancel.service"
)
const { registerUninstallEffect } = await import(
  "../../src/template/uninstall-effects"
)
const { lockParentRows } = await import(
  "../../src/template/uninstall-parent-locks"
)
const { templateSyncRequestService } = await import(
  "../../src/template/sync-request.service"
)
const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService, TemplateUninstallClaimLostError } =
  await import("../../src/template/uninstall-execute.service")
const { getTemplateAdapter } = await import(
  "../../src/template/adapters/registry"
)
const { hashCanonical } = await import("../../src/template/payload-hash")

const databaseUrl = realDatabaseUrl()
const FULL = { kind: "apiToken", permission: "full" } as const

describe.skipIf(!databaseUrl)("template uninstall on a real database", () => {
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
      .values({ email: `template-uninstall-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `template-uninstall-${suffix}`, ownerId: owner.id })
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

  type Seed = Awaited<ReturnType<typeof seedInstallation>>
  type Category =
    | "flows"
    | "triggers"
    | "keywords"
    | "sequences"
    | "products"
    | "aiFiles"
  type Kind =
    | "flow"
    | "trigger"
    | "automatedResponse"
    | "sequence"
    | "product"
    | "aiFile"

  /** Tracks a row the install "created"; `modified` leaves it without a matching baseline hash. */
  const track = async (
    seed: Seed,
    input: {
      category: Category
      kind: Kind
      resourceId: string
      modified?: boolean
    },
  ) => {
    // Kinds without a fingerprint (products) can not be projected: unverified.
    const project = await getTemplateAdapter(input.category)
      ?.sync.project(db, input.resourceId)
      .catch(() => null)
    const baselineHash = project ? await hashCanonical(project) : null
    await db.insert(templateInstalledResourceModel).values({
      installationId: seed.installationId,
      workspaceId: seed.workspaceId,
      category: input.category,
      resourceKind: input.kind,
      resourceId: input.resourceId,
      sourceResourceId: createId(),
      wasExisting: false,
      syncedHash: input.modified ? "stale" : baselineHash,
    })
  }

  /** A flow with a draft: what a template-installed flow always has. */
  const insertFlow = async (workspaceId: string) => {
    const [flow] = await db
      .insert(flowModel)
      .values({ workspaceId, name: "Flow" })
      .returning({ id: flowModel.id })
    await db.insert(flowVersionModel).values({
      workspaceId,
      flowId: flow.id,
      nodes: [],
      edges: [],
      isDraft: true,
      startNodeId: "1",
    })
    return flow
  }

  const seedCopies = async (seed: Seed) => {
    const flow = await insertFlow(seed.workspaceId)
    const [trigger] = await db
      .insert(triggerModel)
      .values({ workspaceId: seed.workspaceId, name: "Trigger", actions: [] })
      .returning({ id: triggerModel.id })
    const [keyword] = await db
      .insert(automatedResponseModel)
      .values({
        workspaceId: seed.workspaceId,
        keywords: ["hi"],
        status: true,
        text: "hello",
      })
      .returning({ id: automatedResponseModel.id })
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Sequence" })
      .returning({ id: sequenceModel.id })
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await track(seed, {
      category: "triggers",
      kind: "trigger",
      resourceId: trigger.id,
    })
    await track(seed, {
      category: "keywords",
      kind: "automatedResponse",
      resourceId: keyword.id,
      modified: true,
    })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    return { flow, trigger, keyword, sequence }
  }

  const request = async (seed: Seed) =>
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })

  const execute = async (seed: Seed) => {
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: seed.workspaceId,
    })
    return claim
  }

  const installationOf = async (seed: Seed) =>
    await templateInstallationRepository.findByIdAndWorkspace({
      id: seed.installationId,
      workspaceId: seed.workspaceId,
    })

  const count = async (
    table:
      | typeof flowModel
      | typeof triggerModel
      | typeof automatedResponseModel
      | typeof sequenceModel,
    workspaceId: string,
  ) => await db.$count(table, eq(table.workspaceId, workspaceId))

  test("deletes flows, triggers, keywords and sequences, counting the edited keyword as deletedModified", async () => {
    const seed = await seedInstallation()
    await seedCopies(seed)

    const requested = await request(seed)
    expect(requested.uninstallState).toBe("pending")
    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(0)
    expect(await count(triggerModel, seed.workspaceId)).toBe(0)
    expect(await count(automatedResponseModel, seed.workspaceId)).toBe(0)
    expect(await count(sequenceModel, seed.workspaceId)).toBe(0)

    const installation = await installationOf(seed)
    expect(installation?.status).toBe("uninstalled")
    expect(installation?.uninstallState).toBe("done")
    expect(installation?.uninstallCounts).toMatchObject({
      deleted: 4,
      deletedModified: 1,
      failed: 0,
    })
    const operation = await templateUninstallStateRepository.findOperation({
      id: requested.operationId,
      workspaceId: seed.workspaceId,
    })
    expect(operation?.state).toBe("done")
    expect(operation?.counts).toMatchObject({ deleted: 4, deletedModified: 1 })
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    expect(rows.every((row) => row.detachedAt !== null)).toBe(true)
  })

  test("a flow something the installer built still points at is kept, detached and unfrozen data survives", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    // The installer's own ref link points at the copied flow (it would cascade away).
    const [reflink] = await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "mine", flowId: flow.id })
      .returning({ id: reflinkModel.id })

    await request(seed)
    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    expect(await db.$count(reflinkModel, eq(reflinkModel.id, reflink.id))).toBe(
      1,
    )
    const row = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(row?.uninstallOutcome).toBe("keptHasDependents")
    expect(row?.detachedAt).not.toBeNull()
    expect((await installationOf(seed))?.uninstallCounts).toMatchObject({
      deleted: 0,
      keptHasDependents: 1,
    })
  })

  test("Phase A freezes producers and tombstones, and a resumed run finishes without deciding again", async () => {
    const seed = await seedInstallation()
    const copies = await seedCopies(seed)
    await request(seed)

    // Phase A only: claim and decide, then stop (a crash between A and B).
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: seed.workspaceId,
    })
    const [trigger] = await db.query.triggerModel.findMany({
      where: { id: copies.trigger.id },
    })
    expect(trigger.active).toBe(false)
    const tombstones = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    expect(tombstones.map((row) => row.uninstallOutcome).sort()).toEqual([
      "deleting",
      "deleting",
      "deleting",
      "deletingModified",
    ])
    // Everything is still there: nothing was deleted by deciding.
    expect(await count(flowModel, seed.workspaceId)).toBe(1)

    // The lease expires; the sweep's claim resumes at Phase B with no re-decision.
    await expireLease(seed)
    await execute(seed)
    expect(await count(flowModel, seed.workspaceId)).toBe(0)
    expect((await installationOf(seed))?.uninstallState).toBe("done")
  })

  test("a stale worker is fenced out by the claim token and the new holder finishes", async () => {
    const seed = await seedInstallation()
    await seedCopies(seed)
    await request(seed)

    const stale = await templateUninstallExecuteService.claim(seed)
    if (!stale) {
      throw new Error("not claimable")
    }
    await expireLease(seed)
    const winner = await templateUninstallExecuteService.claim(seed)
    expect(winner).not.toBeNull()
    expect(winner?.token).not.toBe(stale.token)

    // The first worker's batch transaction renews nothing: it aborts and deletes nothing.
    await expect(
      templateUninstallExecuteService.run({
        ...stale,
        workspaceId: seed.workspaceId,
      }),
    ).rejects.toBeInstanceOf(TemplateUninstallClaimLostError)
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    expect((await installationOf(seed))?.uninstallState).toBe("running")

    if (!winner) {
      throw new Error("no winner")
    }
    await templateUninstallExecuteService.run({
      ...winner,
      workspaceId: seed.workspaceId,
    })
    expect((await installationOf(seed))?.uninstallState).toBe("done")
    // And the loser can not finalize afterwards either.
    expect(
      await templateUninstallStateRepository.finalize({
        ...stale,
        state: "done",
        counts: (await installationOf(seed))?.uninstallCounts as never,
      }),
    ).toBe(false)
  })

  test("a flow a trigger of the installer points at through its actions JSON is kept", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await db.insert(triggerModel).values({
      workspaceId: seed.workspaceId,
      name: "Mine",
      actions: [{ type: "startFlow", flowId: flow.id }] as never,
    })

    await request(seed)
    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    const row = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(row?.uninstallOutcome).toBe("keptHasDependents")
  })

  test("a trigger of the same uninstall that points at the flow does not keep it", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const [trigger] = await db
      .insert(triggerModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Copy",
        actions: [{ type: "startFlow", flowId: flow.id }] as never,
      })
      .returning({ id: triggerModel.id })
    await track(seed, {
      category: "triggers",
      kind: "trigger",
      resourceId: trigger.id,
    })

    await request(seed)
    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(0)
    expect(await count(triggerModel, seed.workspaceId)).toBe(0)
  })

  const seedInstallFolder = async (seed: Seed) => {
    const [folder] = await db
      .insert(folderModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Install folder",
        folderType: "flow",
        paths: [],
      })
      .returning({ id: folderModel.id })
    await db.execute(
      sql`UPDATE "TemplateInstallation" SET "installFolderId" = ${folder.id}
          WHERE "id" = ${seed.installationId}`,
    )
    await db.insert(templateInstalledResourceModel).values({
      installationId: seed.installationId,
      workspaceId: seed.workspaceId,
      category: "flows",
      resourceKind: "folder",
      resourceId: folder.id,
      sourceResourceId: createId(),
      wasExisting: false,
    })
    return folder
  }

  test("the install folder is deleted when the uninstall leaves it empty", async () => {
    const seed = await seedInstallation()
    const folder = await seedInstallFolder(seed)
    const flow = await insertFlow(seed.workspaceId)
    await db
      .update(flowModel)
      .set({ folderId: folder.id })
      .where(eq(flowModel.id, flow.id))
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })

    await request(seed)
    await execute(seed)

    expect(await db.$count(folderModel, eq(folderModel.id, folder.id))).toBe(0)
    const tracked = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId, resourceKind: "folder" },
    })
    expect(tracked?.uninstallOutcome).toBe("deleted")
  })

  test("the install folder is kept when the installer put something else in it", async () => {
    const seed = await seedInstallation()
    const folder = await seedInstallFolder(seed)
    const [mine] = await db
      .insert(flowModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Mine",
        folderId: folder.id,
      })
      .returning({ id: flowModel.id })

    await request(seed)
    await execute(seed)

    expect(await db.$count(folderModel, eq(folderModel.id, folder.id))).toBe(1)
    expect(await db.$count(flowModel, eq(flowModel.id, mine.id))).toBe(1)
    const tracked = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId, resourceKind: "folder" },
    })
    expect(tracked?.uninstallOutcome).toBe("keptShared")
  })

  test("a retry after a partial run keeps the edited flag in the final counts", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, {
      category: "flows",
      kind: "flow",
      resourceId: flow.id,
      modified: true,
    })
    await request(seed)
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: seed.workspaceId,
    })
    // As the worker leaves it when the flow's delete failed.
    await db.execute(
      sql`UPDATE "TemplateInstalledResource" SET "uninstallOutcome" = 'failedModified'
          WHERE "installationId" = ${seed.installationId}`,
    )
    await templateUninstallExecuteService.finalize(claim)
    expect((await installationOf(seed))?.uninstallState).toBe("partial")

    await request(seed)
    await execute(seed)

    const installation = await installationOf(seed)
    expect(installation?.uninstallState).toBe("done")
    expect(installation?.uninstallCounts).toMatchObject({
      deleted: 1,
      deletedModified: 1,
      failed: 0,
    })
    expect(await count(flowModel, seed.workspaceId)).toBe(0)
  })

  const flowRow = async (id: string) =>
    await db.query.flowModel.findFirst({ where: { id } })

  const decideOnly = async (seed: Seed) => {
    await request(seed)
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: seed.workspaceId,
    })
    return claim
  }

  const outcomeOf = async (seed: Seed) =>
    (
      await db.query.templateInstalledResourceModel.findFirst({
        where: { installationId: seed.installationId },
      })
    )?.uninstallOutcome

  test("a broadcast of the installer that points at the flow keeps it (it would cascade away with its history)", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const [broadcast] = await db
      .insert(broadcastModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Spring sale",
        status: "draft",
        schedulesType: "now",
        schedulesAt: new Date(),
        subaction: "flow",
        channel: "messenger",
        flowId: flow.id,
      } as never)
      .returning({ id: broadcastModel.id })

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    expect(
      await db.$count(broadcastModel, eq(broadcastModel.id, broadcast.id)),
    ).toBe(1)
  })

  test("a SET NULL slot (a leaderboard's referral welcome flow) keeps the flow too, and the setting is untouched", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const [leaderboard] = await db
      .insert(leaderboardModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Referrals",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86_400_000),
        platform: "messenger",
        scope: {},
        rules: {},
        tagIds: [],
        rewardSettings: {},
        referralWelcomeFlowId: flow.id,
      } as never)
      .returning({ id: leaderboardModel.id })

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    const after = await db.query.leaderboardModel.findFirst({
      where: { id: leaderboard.id },
    })
    expect(after?.referralWelcomeFlowId).toBe(flow.id)
  })

  test("a pipeline with any deal in it is kept whole", async () => {
    const seed = await seedInstallation()
    const [pipeline] = await db
      .insert(pipelineModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Sales",
        type: "opportunity",
        referenceName: "sales",
        settings: {},
      } as never)
      .returning({ id: pipelineModel.id })
    const [stage] = await db
      .insert(pipelineStageModel)
      .values({
        workspaceId: seed.workspaceId,
        pipelineId: pipeline.id,
        name: "New",
        position: 1,
      } as never)
      .returning({ id: pipelineStageModel.id })
    const [contact] = await db
      .insert(contactModel)
      .values({ workspaceId: seed.workspaceId } as never)
      .returning({ id: contactModel.id })
    await db.insert(pipelineItemModel).values({
      contactId: contact.id,
      workspaceId: seed.workspaceId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      number: 1,
      title: "A deal",
      status: "open",
      priority: "medium",
      fieldValues: {},
      stageEnteredAt: new Date(),
    } as never)
    await db.insert(templateInstalledResourceModel).values({
      installationId: seed.installationId,
      workspaceId: seed.workspaceId,
      category: "pipelines",
      resourceKind: "pipeline",
      resourceId: pipeline.id,
      sourceResourceId: createId(),
      wasExisting: false,
      syncedHash: "x",
    })

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(
      await db.$count(pipelineModel, eq(pipelineModel.id, pipeline.id)),
    ).toBe(1)
    expect(
      await db.$count(
        pipelineItemModel,
        eq(pipelineItemModel.pipelineId, pipeline.id),
      ),
    ).toBe(1)
  })

  test("a tombstoned flow, and a failed one awaiting a retry, refuse new references and edits", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await request(seed)
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: seed.workspaceId,
    })

    const referenceIt = async () =>
      await db.transaction(
        async (tx) =>
          await assertReferencable({
            workspaceId: seed.workspaceId,
            parents: [{ kind: "flow", resourceId: flow.id }],
            tx,
          }),
      )
    const toggleIt = async () =>
      await db.transaction(
        async (tx) =>
          await assertEditable({
            workspaceId: seed.workspaceId,
            resourceKind: "flow",
            resourceIds: [flow.id],
            changedKeys: ["active"],
            lockedContentKeys: ["nodes"],
            tx,
          }),
      )
    await expect(referenceIt()).rejects.toMatchObject({
      code: "templateUninstallInProgress",
    })
    await expect(toggleIt()).rejects.toMatchObject({
      code: "templateUninstallInProgress",
    })

    // The batch failed: the row is `failed`, still doomed, still refusing.
    await db.execute(
      sql`UPDATE "TemplateInstalledResource" SET "uninstallOutcome" = 'failed'
          WHERE "installationId" = ${seed.installationId}`,
    )
    await expect(referenceIt()).rejects.toMatchObject({
      code: "templateUninstallInProgress",
    })
    await expect(toggleIt()).rejects.toMatchObject({
      code: "templateUninstallInProgress",
    })
  })

  test("a reference that slipped in before the retry is found again under the locks: the parent is kept", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await request(seed)
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: seed.workspaceId,
    })
    await db.execute(
      sql`UPDATE "TemplateInstalledResource" SET "uninstallOutcome" = 'failed'
          WHERE "installationId" = ${seed.installationId}`,
    )
    await templateUninstallExecuteService.finalize(claim)
    // The installer's ref link points at the flow by the time the retry runs
    // (written around the guard, as a bug or a direct write would).
    const [reflink] = await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "late", flowId: flow.id })
      .returning({ id: reflinkModel.id })

    await request(seed)
    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    expect(await db.$count(reflinkModel, eq(reflinkModel.id, reflink.id))).toBe(
      1,
    )
    expect(await outcomeOf(seed)).toBe("keptHasDependents")
  })

  test("running out of rounds with tombstones left never finishes as done", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await request(seed)
    const flowHandler = UNINSTALL_HANDLER_BY_KIND.flow
    if (!flowHandler) {
      throw new Error("no flow handler")
    }
    const spy = vi
      .spyOn(flowHandler, "drainHeavyChildren")
      .mockResolvedValue(true)
    try {
      await execute(seed)
    } finally {
      spy.mockRestore()
    }

    const installation = await installationOf(seed)
    expect(installation?.uninstallState).toBe("pending")
    expect(installation?.status).toBe("completed")
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    // Handed back: the sweep's claim finishes it.
    await execute(seed)
    expect((await installationOf(seed))?.uninstallState).toBe("done")
    expect(await count(flowModel, seed.workspaceId)).toBe(0)
  })

  const makePublisherInstallation = async () => {
    const seed = await seedInstallation()
    await db.execute(
      sql`UPDATE "TemplateInstallation"
          SET "publisherRef" = ${`ref${createId()}`}, "publisherUninstallGrant" = 1
          WHERE "id" = ${seed.installationId}`,
    )
    const installation = await installationOf(seed)
    return { seed, installation }
  }

  const revoke = async (
    seed: Seed,
    installation: Awaited<ReturnType<typeof installationOf>>,
  ) => {
    // The installer's own switch (the path the settings page and API use).
    await templateSyncRequestService.setPublisherUninstallGrant({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
      granted: false,
    })
    return installation
  }

  test("revoking the grant cancels a publisher uninstall that has not started", async () => {
    const { seed, installation } = await makePublisherInstallation()
    await insertFlow(seed.workspaceId).then(async (flow) =>
      track(seed, { category: "flows", kind: "flow", resourceId: flow.id }),
    )
    const requested = await templateUninstallService.uninstallAsPublisher({
      workspaceId: seed.workspaceId,
      templateId: installation?.templateId as string,
      publisherRef: installation?.publisherRef as string,
      actor: FULL,
    })
    expect(requested.uninstallState).toBe("pending")

    await revoke(seed, installation)

    const after = await installationOf(seed)
    expect(after?.uninstallState).toBe("skipped")
    expect(after?.uninstallErrorCode).toBe("templateUninstallNotGranted")
    const operation = await templateUninstallStateRepository.findOperation({
      id: requested.operationId,
      workspaceId: seed.workspaceId,
    })
    expect(operation?.state).toBe("skipped")
    // And the job that was already queued finds nothing to claim.
    expect(await templateUninstallExecuteService.claim(seed)).toBeNull()
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
  })

  test("revoking after Phase A ran gives the copies back: untombstoned and unfrozen", async () => {
    const { seed, installation } = await makePublisherInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const requested = await templateUninstallService.uninstallAsPublisher({
      workspaceId: seed.workspaceId,
      templateId: installation?.templateId as string,
      publisherRef: installation?.publisherRef as string,
      actor: FULL,
    })
    // A worker decided and froze, then lost the job (lease handed back).
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: seed.workspaceId,
    })
    await templateUninstallExecuteService.release(claim)
    expect((await flowRow(flow.id))?.active).toBe(false)
    expect(await outcomeOf(seed)).toBe("deleting")

    await revoke(seed, installation)

    expect((await flowRow(flow.id))?.active).toBe(true)
    expect(await outcomeOf(seed)).toBeNull()
    expect((await installationOf(seed))?.uninstallState).toBe("skipped")
    const operation = await templateUninstallStateRepository.findOperation({
      id: requested.operationId,
      workspaceId: seed.workspaceId,
    })
    expect(operation?.state).toBe("skipped")
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
  })

  test("a grant revoked after the request, before the job decides, stops it with nothing tombstoned", async () => {
    const { seed, installation } = await makePublisherInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await templateUninstallService.uninstallAsPublisher({
      workspaceId: seed.workspaceId,
      templateId: installation?.templateId as string,
      publisherRef: installation?.publisherRef as string,
      actor: FULL,
    })
    // The revoke lands after the job was claimed (so the pending cancel missed it).
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("not claimable")
    }
    await db.execute(
      sql`UPDATE "TemplateInstallation" SET "publisherUninstallGrant" = 0
          WHERE "id" = ${seed.installationId}`,
    )

    await expect(
      templateUninstallExecuteService.run({
        ...claim,
        workspaceId: seed.workspaceId,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallNotGranted" })

    expect(await outcomeOf(seed)).toBeNull()
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    const row = await db.query.triggerModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(row).toHaveLength(0)
  })

  test("an operation left pending when its members finished together is finalized by the sweep step", async () => {
    const seed = await seedInstallation()
    await insertFlow(seed.workspaceId).then(async (flow) =>
      track(seed, { category: "flows", kind: "flow", resourceId: flow.id }),
    )
    const requested = await request(seed)
    await execute(seed)
    // Simulate the lost race: the snapshot never got written.
    await db.execute(
      sql`UPDATE "TemplateUninstallOperation" SET "state" = 'pending', "counts" = NULL, "finishedAt" = NULL
          WHERE "id" = ${requested.operationId}`,
    )

    const { templateUninstallSweepService } = await import(
      "../../src/template/uninstall-sweep.service"
    )
    expect(
      await templateUninstallSweepService.finalizeStuckOperations(10),
    ).toBeGreaterThanOrEqual(1)

    const operation = await templateUninstallStateRepository.findOperation({
      id: requested.operationId,
      workspaceId: seed.workspaceId,
    })
    expect(operation?.state).toBe("done")
    expect(operation?.counts).toMatchObject({ deleted: 1 })
  })

  test("a copy kept after it was frozen gets its producer flag back", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const claim = await decideOnly(seed)
    expect((await flowRow(flow.id))?.active).toBe(false)
    // The installer's reference arrives after the decision.
    await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "late", flowId: flow.id })
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect((await flowRow(flow.id))?.active).toBe(true)
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
  })

  test("cancelling an unfinished uninstall unfreezes what waits and leaves what was deleted", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const [trigger] = await db
      .insert(triggerModel)
      .values({ workspaceId: seed.workspaceId, name: "Gone", actions: [] })
      .returning({ id: triggerModel.id })
    await track(seed, {
      category: "triggers",
      kind: "trigger",
      resourceId: trigger.id,
    })
    const claim = await decideOnly(seed)
    // The trigger's delete went through; the flow's failed: a partial run.
    await db.delete(triggerModel).where(eq(triggerModel.id, trigger.id))
    await db.execute(
      sql`UPDATE "TemplateInstalledResource"
          SET "uninstallOutcome" = 'deleted', "detachedAt" = now()
          WHERE "installationId" = ${seed.installationId} AND "resourceKind" = 'trigger'`,
    )
    await db.execute(
      sql`UPDATE "TemplateInstalledResource" SET "uninstallOutcome" = 'failed'
          WHERE "installationId" = ${seed.installationId} AND "resourceKind" = 'flow'`,
    )
    await templateUninstallExecuteService.finalize(claim)
    expect((await installationOf(seed))?.uninstallState).toBe("partial")
    expect((await flowRow(flow.id))?.active).toBe(false)

    const result = await templateUninstallCancelService.cancelAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })

    expect(result.restored).toBe(1)
    expect((await flowRow(flow.id))?.active).toBe(true)
    const installation = await installationOf(seed)
    expect(installation?.uninstallState).toBe("none")
    expect(installation?.status).toBe("completed")
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    const byKind = Object.fromEntries(
      rows.map((row) => [row.resourceKind, row]),
    )
    expect(byKind.flow.uninstallOutcome).toBeNull()
    expect(byKind.flow.detachedAt).toBeNull()
    expect(byKind.trigger.uninstallOutcome).toBe("deleted")
    expect(byKind.trigger.detachedAt).not.toBeNull()
    // A cancelled uninstall can be requested again.
    await request(seed)
    await execute(seed)
    expect(await count(flowModel, seed.workspaceId)).toBe(0)
  })

  test("cancelling is refused while the uninstall is running", async () => {
    const seed = await seedInstallation()
    await insertFlow(seed.workspaceId).then(async (flow) =>
      track(seed, { category: "flows", kind: "flow", resourceId: flow.id }),
    )
    await request(seed)
    await templateUninstallExecuteService.claim(seed)

    await expect(
      templateUninstallCancelService.cancelAsInstaller({
        workspaceId: seed.workspaceId,
        installationId: seed.installationId,
        actor: FULL,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallNotCancellable" })
  })

  const insertContacts = async (workspaceId: string, n: number) =>
    (
      await db
        .insert(contactModel)
        .values(Array.from({ length: n }, () => ({ workspaceId })) as never)
        .returning({ id: contactModel.id })
    ).map((row) => row.id)

  const seedSequenceWithEnrollments = async (seed: Seed, n: number) => {
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Drip" })
      .returning({ id: sequenceModel.id })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    const contacts = await insertContacts(seed.workspaceId, n)
    await db.insert(contactsOnSequenceModel).values(
      contacts.map((contactId, index) => ({
        workspaceId: seed.workspaceId,
        sequenceId: sequence.id,
        contactId,
        status: index % 2 === 0 ? "active" : "completed",
      })) as never,
    )
    return sequence
  }

  /** The installer's own flow whose subscribe step points at a sequence. */
  const insertSubscribingFlow = async (
    workspaceId: string,
    sequenceId: string,
  ) => {
    const [flow] = await db
      .insert(flowModel)
      .values({ workspaceId, name: "Mine" })
      .returning({ id: flowModel.id })
    await db.insert(flowVersionModel).values({
      workspaceId,
      flowId: flow.id,
      nodes: [{ id: "1", data: { sequenceId } }],
      edges: [],
      isDraft: true,
      startNodeId: "1",
    })
    return flow
  }

  const enrollmentCount = async (sequenceId: string) =>
    await db.$count(
      contactsOnSequenceModel,
      eq(contactsOnSequenceModel.sequenceId, sequenceId),
    )

  test("a template sequence an installer flow's subscribe step uses is kept whole at the decision", async () => {
    const seed = await seedInstallation()
    const sequence = await seedSequenceWithEnrollments(seed, 4)
    await insertSubscribingFlow(seed.workspaceId, sequence.id)

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(await count(sequenceModel, seed.workspaceId)).toBe(1)
    expect(await enrollmentCount(sequence.id)).toBe(4)
  })

  test("a holder found at the point of no return keeps an intact copy (enrollments), unfrozen", async () => {
    const seed = await seedInstallation()
    const sequence = await seedSequenceWithEnrollments(seed, 4)
    const claim = await decideOnly(seed)
    expect(
      (await db.query.sequenceModel.findFirst({ where: { id: sequence.id } }))
        ?.active,
    ).toBe(false)
    // The installer's reference arrives between the decision and the delete.
    await insertSubscribingFlow(seed.workspaceId, sequence.id)
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(await enrollmentCount(sequence.id)).toBe(4)
    const kept = await db.query.sequenceModel.findFirst({
      where: { id: sequence.id },
    })
    expect(kept?.active).toBe(true)
    const row = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(row?.uninstallDrainStartedAt).toBeNull()
    expect(row?.detachedAt).not.toBeNull()
  })

  test("a holder found at the point of no return keeps a flow with its versions, unfrozen", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const claim = await decideOnly(seed)
    await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "late", flowId: flow.id })
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect((await flowRow(flow.id))?.active).toBe(true)
    expect(
      await db.$count(flowVersionModel, eq(flowVersionModel.flowId, flow.id)),
    ).toBe(1)
  })

  /**
   * Drives a flow past its point of no return, then an unguarded writer adds
   * a holder: the parent delete is blocked, the row ends `blockedByReference`.
   */
  const blockedFlow = async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await request(seed)
    const flowHandler = UNINSTALL_HANDLER_BY_KIND.flow
    if (!flowHandler) {
      throw new Error("no flow handler")
    }
    const spy = vi
      .spyOn(flowHandler, "drainHeavyChildren")
      .mockResolvedValue(true)
    try {
      await execute(seed)
    } finally {
      spy.mockRestore()
    }
    const committed = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(committed?.uninstallDrainStartedAt).not.toBeNull()
    const [reflink] = await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "late", flowId: flow.id })
      .returning({ id: reflinkModel.id })
    await execute(seed)
    return { seed, flow, reflink }
  }

  test("an unguarded holder after the point of no return blocks the parent delete; removing it lets a retry finish", async () => {
    const { seed, flow, reflink } = await blockedFlow()

    expect(await outcomeOf(seed)).toBe("blockedByReference")
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
    expect(await db.$count(reflinkModel, eq(reflinkModel.id, reflink.id))).toBe(
      1,
    )
    const installation = await installationOf(seed)
    expect(installation?.uninstallState).toBe("partial")
    expect(installation?.uninstallCounts).toMatchObject({
      blockedByReference: 1,
    })
    // Still tombstoned and frozen: never reactivated.
    expect((await flowRow(flow.id))?.active).toBe(false)

    // The installer removes the reference and retries: the row resumes and goes.
    await db.delete(reflinkModel).where(eq(reflinkModel.id, reflink.id))
    await request(seed)
    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(0)
    expect((await installationOf(seed))?.uninstallState).toBe("done")
  })

  test("a committed flow a reference blocked is given back by cancel: kept and detached, but left inactive for review", async () => {
    const { seed, flow } = await blockedFlow()

    const result = await templateUninstallCancelService.cancelAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })

    // A flow's drain removed history: handed back detached but INACTIVE.
    expect(result).toEqual({
      restored: 0,
      alreadyCommitted: 0,
      keptPartlyRemoved: 1,
      keptInactiveForReview: 1,
      keptHistoryRemoved: 0,
    })
    expect((await flowRow(flow.id))?.active).toBe(false)
    const handedBack = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(handedBack?.detachedAt).not.toBeNull()
    expect(handedBack?.uninstallFrozenFrom).toBeNull()
    expect(await outcomeOf(seed)).toBe("keptPartlyRemoved")
    expect(
      await templateUninstallStateRepository.isInProgress(seed.installationId),
    ).toBe(false)
    expect((await installationOf(seed))?.uninstallState).toBe("none")
  })

  test("a busy sequence (several batches of enrollments) is fully deleted across rounds", async () => {
    const seed = await seedInstallation()
    const sequence = await seedSequenceWithEnrollments(seed, 1100)
    expect(await enrollmentCount(sequence.id)).toBe(1100)

    await request(seed)
    await execute(seed)

    expect(await enrollmentCount(sequence.id)).toBe(0)
    expect(await count(sequenceModel, seed.workspaceId)).toBe(0)
    expect((await installationOf(seed))?.uninstallState).toBe("done")
  })

  test("revoking leaves a publisher uninstall that is already committed to finish", async () => {
    const { seed, installation } = await makePublisherInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    await templateUninstallService.uninstallAsPublisher({
      workspaceId: seed.workspaceId,
      templateId: installation?.templateId as string,
      publisherRef: installation?.publisherRef as string,
      actor: FULL,
    })
    const flowHandler = UNINSTALL_HANDLER_BY_KIND.flow
    if (!flowHandler) {
      throw new Error("no flow handler")
    }
    const spy = vi
      .spyOn(flowHandler, "drainHeavyChildren")
      .mockResolvedValue(true)
    try {
      await execute(seed)
    } finally {
      spy.mockRestore()
    }
    expect((await installationOf(seed))?.uninstallState).toBe("pending")

    await revoke(seed, installation)

    // Committed to deletion: not skipped, not given back; it finishes.
    expect((await installationOf(seed))?.uninstallState).toBe("pending")
    expect((await flowRow(flow.id))?.active).toBe(false)
    await execute(seed)
    expect(await count(flowModel, seed.workspaceId)).toBe(0)
  })

  test("without a block, a sequence's live enrollments go with it in the same transaction", async () => {
    const seed = await seedInstallation()
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Drip" })
      .returning({ id: sequenceModel.id })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    const [contact] = await db
      .insert(contactModel)
      .values({ workspaceId: seed.workspaceId } as never)
      .returning({ id: contactModel.id })
    await db.insert(contactsOnSequenceModel).values({
      workspaceId: seed.workspaceId,
      sequenceId: sequence.id,
      contactId: contact.id,
      status: "active",
    } as never)

    await request(seed)
    await execute(seed)

    expect(await count(sequenceModel, seed.workspaceId)).toBe(0)
    expect(
      await db.$count(
        contactsOnSequenceModel,
        eq(contactsOnSequenceModel.sequenceId, sequence.id),
      ),
    ).toBe(0)
  })

  test("revoking with two skipped installations of one pair locks every key once and undoes both", async () => {
    const { seed, installation } = await makePublisherInstallation()
    const flowOne = await insertFlow(seed.workspaceId)
    await track(seed, {
      category: "flows",
      kind: "flow",
      resourceId: flowOne.id,
    })
    // A second installation of the same template into the same workspace.
    const second = await templateInstallationRepository.create({
      workspaceId: seed.workspaceId,
      templateId: installation?.templateId as string,
      sourceTemplateId: installation?.sourceTemplateId as string,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: 1,
      status: "completed",
      permissions: { allowEdit: true, allowDelete: true },
    })
    await db.execute(
      sql`UPDATE "TemplateInstallation"
          SET "publisherRef" = ${installation?.publisherRef as string}, "publisherUninstallGrant" = 1
          WHERE "id" = ${second.id}`,
    )
    const secondSeed = {
      workspaceId: seed.workspaceId,
      installationId: second.id,
    }
    const flowTwo = await insertFlow(seed.workspaceId)
    await track(secondSeed, {
      category: "flows",
      kind: "flow",
      resourceId: flowTwo.id,
    })
    await templateUninstallService.uninstallAsPublisher({
      workspaceId: seed.workspaceId,
      templateId: installation?.templateId as string,
      publisherRef: installation?.publisherRef as string,
      actor: FULL,
    })
    for (const target of [seed, secondSeed]) {
      const claim = await templateUninstallExecuteService.claim(target)
      if (!claim) {
        throw new Error("not claimable")
      }
      await templateUninstallExecuteService.decide({
        ...claim,
        workspaceId: seed.workspaceId,
      })
      await templateUninstallExecuteService.release(claim)
    }
    expect((await flowRow(flowOne.id))?.active).toBe(false)
    expect((await flowRow(flowTwo.id))?.active).toBe(false)

    await revoke(seed, installation)

    expect((await flowRow(flowOne.id))?.active).toBe(true)
    expect((await flowRow(flowTwo.id))?.active).toBe(true)
    expect((await installationOf(seed))?.uninstallState).toBe("skipped")
    expect(
      (
        await templateInstallationRepository.findByIdAndWorkspace({
          id: second.id,
          workspaceId: seed.workspaceId,
        })
      )?.uninstallState,
    ).toBe("skipped")
  })

  test("cancelling gives back only what the member may use: the category check runs under the lock", async () => {
    const seed = await seedInstallation()
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Drip" })
      .returning({ id: sequenceModel.id })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    const claim = await decideOnly(seed)
    await db.execute(
      sql`UPDATE "TemplateInstalledResource" SET "uninstallOutcome" = 'failed'
          WHERE "installationId" = ${seed.installationId}`,
    )
    await templateUninstallExecuteService.finalize(claim)

    await expect(
      templateUninstallCancelService.cancelAsInstaller({
        workspaceId: seed.workspaceId,
        installationId: seed.installationId,
        // May manage templates (flows), but has no `broadcast` for sequences.
        actor: { kind: "member", permissions: { flows: true } as never },
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
    // Nothing was given back.
    expect(await outcomeOf(seed)).toBe("failed")
    expect((await installationOf(seed))?.uninstallState).toBe("partial")
  })

  test("freezing a cached producer drops its cache right after Phase A commits", async () => {
    const dropped = vi.fn().mockResolvedValue(undefined)
    registerUninstallEffect("trigger.invalidateCache", dropped)
    const seed = await seedInstallation()
    const [trigger] = await db
      .insert(triggerModel)
      .values({ workspaceId: seed.workspaceId, name: "T", actions: [] })
      .returning({ id: triggerModel.id })
    await track(seed, {
      category: "triggers",
      kind: "trigger",
      resourceId: trigger.id,
    })

    await decideOnly(seed)

    expect(dropped).toHaveBeenCalledWith({ workspaceId: seed.workspaceId })
    // Flushed and cleared: nothing is left for the sweep.
    const row = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(row?.uninstallEffects).toBeNull()
  })

  test("the locked parent row makes a concurrent holder wait, then fail on the foreign key", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const deleting = db.transaction(async (tx) => {
      await lockParentRows(tx, seed.workspaceId, [
        { resourceKind: "flow", resourceId: flow.id },
      ])
      await gate
      await tx.delete(flowModel).where(eq(flowModel.id, flow.id))
    })
    await new Promise((resolve) => setTimeout(resolve, 150))

    let settled = false
    const insert = db
      .insert(reflinkModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "racing",
        flowId: flow.id,
      })
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      )
    insert.finally(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    // Blocked on the parent's lock: it did not slip in and get cascaded away.
    expect(settled).toBe(false)

    release()
    await deleting
    const outcome = await insert
    expect(outcome.ok).toBe(false)
    expect(
      await db.$count(
        reflinkModel,
        eq(reflinkModel.workspaceId, seed.workspaceId),
      ),
    ).toBe(0)
  })

  test("an operation with no members left is finalized by the sweep step", async () => {
    const seed = await seedInstallation()
    const operation = await templateUninstallStateRepository.createOperation({
      workspaceId: seed.workspaceId,
      templateId: null,
      publisherRef: "orphan",
      requestedByKind: "installer",
      requestedBy: null,
    })
    const { templateUninstallSweepService } = await import(
      "../../src/template/uninstall-sweep.service"
    )

    await templateUninstallSweepService.finalizeStuckOperations(50)

    const after = await templateUninstallStateRepository.findOperation({
      id: operation.id,
      workspaceId: seed.workspaceId,
    })
    expect(after?.state).toBe("skipped")
  })

  const expireLease = async (seed: Seed) => {
    await db.execute(
      sql`UPDATE "TemplateInstallation"
          SET "uninstallClaimedAt" = now() - interval '10 minutes'
          WHERE "id" = ${seed.installationId}`,
    )
  }

  /** B's draft nodes point at A (a go-to-flow style reference). */
  const pointFlowAt = async (fromFlowId: string, toFlowId: string) => {
    await db
      .update(flowVersionModel)
      .set({ nodes: [{ id: "n1", data: { flowId: toFlowId } }] as never })
      .where(eq(flowVersionModel.flowId, fromFlowId))
  }

  test("a holder that appears on flow B keeps B and the flow A it points at, both whole", async () => {
    const seed = await seedInstallation()
    const a = await insertFlow(seed.workspaceId)
    const b = await insertFlow(seed.workspaceId)
    await pointFlowAt(b.id, a.id)
    await track(seed, { category: "flows", kind: "flow", resourceId: a.id })
    await track(seed, { category: "flows", kind: "flow", resourceId: b.id })
    const claim = await decideOnly(seed)
    await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "late", flowId: b.id })
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    expect(await count(flowModel, seed.workspaceId)).toBe(2)
    expect(
      await db.$count(flowVersionModel, eq(flowVersionModel.flowId, a.id)),
    ).toBe(1)
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    expect(rows.map((row) => row.uninstallOutcome)).toEqual([
      "keptHasDependents",
      "keptHasDependents",
    ])
    expect(rows.every((row) => row.uninstallDrainStartedAt === null)).toBe(true)
  })

  test("the commit is one decision for more than one batch: a late holder on a row in a later batch keeps the earlier-batch flow it points at", async () => {
    const seed = await seedInstallation()
    const flows: { id: string }[] = []
    for (let i = 0; i < 40; i++) {
      flows.push(await insertFlow(seed.workspaceId))
    }
    // Delete order within a category is by id string: first batch holds the lowest.
    const sorted = [...flows].sort((x, y) => (x.id < y.id ? -1 : 1))
    const [first] = sorted
    const last = sorted.at(-1)
    if (!(first && last)) {
      throw new Error("expected seeded flows")
    }
    await pointFlowAt(last.id, first.id)
    for (const flow of flows) {
      await track(seed, {
        category: "flows",
        kind: "flow",
        resourceId: flow.id,
      })
    }
    const claim = await decideOnly(seed)
    await db
      .insert(reflinkModel)
      .values({ workspaceId: seed.workspaceId, name: "late", flowId: last.id })
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    const remaining = await db.query.flowModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(remaining.map((flow) => flow.id).sort()).toEqual(
      [first.id, last.id].sort(),
    )
    expect(
      await db.$count(flowVersionModel, eq(flowVersionModel.flowId, first.id)),
    ).toBe(1)
  })

  test("a sync or reinstall is refused while a doomed (blocked) copy awaits the retry", async () => {
    const { seed } = await blockedFlow()
    expect(await outcomeOf(seed)).toBe("blockedByReference")

    for (const trigger of ["manual", "reinstall"] as const) {
      await expect(
        templateSyncRequestService.request({
          workspaceId: seed.workspaceId,
          installationId: seed.installationId,
          actor: FULL,
          trigger,
        }),
      ).rejects.toMatchObject({ code: "templateUninstallInProgress" })
    }
  })

  const insertFilteredBroadcast = async (
    workspaceId: string,
    field: string,
    value: string[],
  ) => {
    await db.insert(broadcastModel).values({
      workspaceId,
      name: "Filtered",
      status: "draft",
      schedulesType: "now",
      schedulesAt: new Date(),
      subaction: "flow",
      channel: "messenger",
      contactFilter: {
        operator: "and",
        conditions: [{ field, operator: "in", value }],
      },
    } as never)
  }

  test("a broadcast filtered on 'subscribed to sequence X' keeps X", async () => {
    const seed = await seedInstallation()
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Drip" })
      .returning({ id: sequenceModel.id })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    await insertFilteredBroadcast(
      seed.workspaceId,
      "subscribedToDripCampaign",
      [sequence.id],
    )

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(await count(sequenceModel, seed.workspaceId)).toBe(1)
  })

  test("a broadcast whose filter holds the same id under a non-sequence field does not keep it", async () => {
    const seed = await seedInstallation()
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Drip" })
      .returning({ id: sequenceModel.id })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    await insertFilteredBroadcast(seed.workspaceId, "inbox", [sequence.id])

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("deleted")
    expect(await count(sequenceModel, seed.workspaceId)).toBe(0)
  })

  test("an order line added to a committed product leads to blockedByReference; cancel gives it back active and detached, and a sync is allowed again", async () => {
    const seed = await seedInstallation()
    const [product] = await db
      .insert(productModel)
      .values({ workspaceId: seed.workspaceId, name: "Shirt" } as never)
      .returning({ id: productModel.id })
    await track(seed, {
      category: "products",
      kind: "product",
      resourceId: product.id,
    })
    const claim = await decideOnly(seed)
    // Phase A froze the product: it takes no new order line from the shop.
    expect(
      (await db.query.productModel.findFirst({ where: { id: product.id } }))
        ?.isActive,
    ).toBe(false)
    // The point of no return was taken; then an order line slips in.
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    await templateUninstallStateRepository.markDeleteCommitted(
      rows.map((row) => row.id),
    )
    const [order] = await db
      .insert(orderModel)
      .values({
        workspaceId: seed.workspaceId,
        number: 1,
        source: "manual",
        currency: "USD",
        subtotal: 0,
        discountTotal: 0,
        shippingTotal: 0,
        serviceFeeTotal: 0,
        taxTotal: 0,
        total: 0,
      } as never)
      .returning({ id: orderModel.id })
    await db.insert(orderItemModel).values({
      orderId: order.id,
      workspaceId: seed.workspaceId,
      productId: product.id,
      name: "Shirt",
      unitPrice: 0,
      quantity: 1,
      discountPercent: 0,
      taxPercent: 0,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 0,
    } as never)
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    // Products have no fingerprint, so the blocked outcome keeps the unverified flag.
    expect(await outcomeOf(seed)).toBe("blockedByReferenceUnverified")
    expect(await db.$count(productModel, eq(productModel.id, product.id))).toBe(
      1,
    )
    expect(
      await templateUninstallStateRepository.isInProgress(seed.installationId),
    ).toBe(true)

    const cancelled = await templateUninstallCancelService.cancelAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })

    expect(cancelled.keptPartlyRemoved).toBe(1)
    expect(cancelled.keptInactiveForReview).toBe(0)
    expect(cancelled.alreadyCommitted).toBe(0)
    const kept = await db.query.productModel.findFirst({
      where: { id: product.id },
    })
    expect(kept?.isActive).toBe(true)
    const row = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(row?.uninstallOutcome).toBe("keptPartlyRemoved")
    expect(row?.detachedAt).not.toBeNull()
    expect(
      await templateUninstallStateRepository.isInProgress(seed.installationId),
    ).toBe(false)
    // The seed has no template version, so the request now gets past the
    // uninstall gate and stops only at "nothing to sync".
    await expect(
      templateSyncRequestService.request({
        workspaceId: seed.workspaceId,
        installationId: seed.installationId,
        actor: FULL,
        trigger: "manual",
      }),
    ).rejects.toMatchObject({ code: "templateInstallationNotSyncable" })
  })

  test("a Messenger persistent-menu button that points at a template flow keeps that flow", async () => {
    const seed = await seedInstallation()
    const flow = await insertFlow(seed.workspaceId)
    await track(seed, { category: "flows", kind: "flow", resourceId: flow.id })
    const [inbox] = await db
      .insert(inboxModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Page",
        channel: "messenger",
        sourceId: `page-${createId()}`,
      } as never)
      .returning({ id: inboxModel.id })
    await db.insert(integrationMessengerModel).values({
      workspaceId: seed.workspaceId,
      inboxId: inbox.id,
      pageId: `page-${createId()}`,
      name: "Page",
      auth: {},
      conversationStarters: [],
      personas: [],
      persistentMenus: [{ type: "flow", title: "Start", flowId: flow.id }],
    } as never)

    await request(seed)
    await execute(seed)

    expect(await outcomeOf(seed)).toBe("keptHasDependents")
    expect(await count(flowModel, seed.workspaceId)).toBe(1)
  })

  test("cancel hands a blocked sequence back inactive for review and a blocked product back active", async () => {
    const seed = await seedInstallation()
    const [sequence] = await db
      .insert(sequenceModel)
      .values({ workspaceId: seed.workspaceId, name: "Drip" })
      .returning({ id: sequenceModel.id })
    const [product] = await db
      .insert(productModel)
      .values({ workspaceId: seed.workspaceId, name: "Shirt" } as never)
      .returning({ id: productModel.id })
    await track(seed, {
      category: "sequences",
      kind: "sequence",
      resourceId: sequence.id,
    })
    await track(seed, {
      category: "products",
      kind: "product",
      resourceId: product.id,
    })
    const claim = await decideOnly(seed)
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    await templateUninstallStateRepository.markDeleteCommitted(
      rows.map((row) => row.id),
    )
    // Written around the guards: a raw insert, as a bug or direct write would.
    await insertFilteredBroadcast(
      seed.workspaceId,
      "subscribedToDripCampaign",
      [sequence.id],
    )
    const [order] = await db
      .insert(orderModel)
      .values({
        workspaceId: seed.workspaceId,
        number: 1,
        source: "manual",
        currency: "USD",
        subtotal: 0,
        discountTotal: 0,
        shippingTotal: 0,
        serviceFeeTotal: 0,
        taxTotal: 0,
        total: 0,
      } as never)
      .returning({ id: orderModel.id })
    await db.insert(orderItemModel).values({
      orderId: order.id,
      workspaceId: seed.workspaceId,
      productId: product.id,
      name: "Shirt",
      unitPrice: 0,
      quantity: 1,
      discountPercent: 0,
      taxPercent: 0,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 0,
    } as never)
    await templateUninstallExecuteService.release(claim)

    await execute(seed)

    const blocked = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    expect(
      blocked.every((row) =>
        row.uninstallOutcome?.startsWith("blockedByReference"),
      ),
    ).toBe(true)

    const cancelled = await templateUninstallCancelService.cancelAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })

    expect(cancelled).toMatchObject({
      keptPartlyRemoved: 2,
      keptInactiveForReview: 1,
      keptHistoryRemoved: 0,
      alreadyCommitted: 0,
    })
    const keptSequence = await db.query.sequenceModel.findFirst({
      where: { id: sequence.id },
    })
    expect(keptSequence?.active).toBe(false)
    const keptProduct = await db.query.productModel.findFirst({
      where: { id: product.id },
    })
    expect(keptProduct?.isActive).toBe(true)
    const after = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    expect(after.every((row) => row.detachedAt !== null)).toBe(true)
    // Nothing can restore the review row's stored flags later.
    expect(
      after.find((row) => row.resourceKind === "sequence")?.uninstallFrozenFrom,
    ).toBeNull()
    expect(
      await templateUninstallStateRepository.isInProgress(seed.installationId),
    ).toBe(false)
  })

  test("a blocked AI file is handed back with its run failed and a reindex recorded, counted as history removed (not inactive)", async () => {
    const seed = await seedInstallation()
    const [file] = await db
      .insert(aiFileModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Guide",
        path: `public/space/${seed.workspaceId}/guide.pdf`,
        size: 10,
        mimeType: "application/pdf",
        processingRun: {
          id: createId(),
          status: "completed",
          error: null,
          queuedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          heartbeatAt: null,
          finishedAt: new Date().toISOString(),
        },
      } as never)
      .returning({ id: aiFileModel.id })
    await track(seed, {
      category: "aiFiles",
      kind: "aiFile",
      resourceId: file.id,
    })
    const claim = await decideOnly(seed)
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: seed.installationId },
    })
    await templateUninstallStateRepository.markDeleteCommitted(
      rows.map((row) => row.id),
    )
    // An agent of the installer takes the file as a tool, around the guards.
    await db.insert(aiAgentModel).values({
      workspaceId: seed.workspaceId,
      name: "Agent",
      actionRules: [],
      messages: [],
      tools: [`file:${file.id}`],
      webSearchAuthorizedDomains: [],
      models: [],
      temperature: 0.5,
      maxOutputTokens: 100,
    } as never)
    await templateUninstallExecuteService.release(claim)

    await execute(seed)
    expect(await outcomeOf(seed)).toBe("blockedByReferenceUnverified")

    const cancelled = await templateUninstallCancelService.cancelAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })

    expect(cancelled).toMatchObject({
      keptPartlyRemoved: 1,
      keptInactiveForReview: 0,
      keptHistoryRemoved: 1,
    })
    const kept = await db.query.aiFileModel.findFirst({
      where: { id: file.id },
    })
    expect(kept?.processingRun).toMatchObject({
      status: "error",
      error: "enqueueFailed",
    })
    const row = await db.query.templateInstalledResourceModel.findFirst({
      where: { installationId: seed.installationId },
    })
    expect(row?.detachedAt).not.toBeNull()
    expect(row?.uninstallEffects).toEqual([
      {
        name: "aiFile.reindex",
        args: { workspaceId: seed.workspaceId, aiFileId: file.id },
      },
    ])
  })
})
