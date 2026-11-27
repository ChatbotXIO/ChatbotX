// @vitest-environment node

/**
 * Template dependency collection and the install safety net, against a real
 * Postgres: a flow a trigger action names travels with the template, a flow
 * cycle ends, an id no map resolves is never written at the source workspace's
 * id, pipelines named by a flow step ship and resolve, and "install into a
 * dedicated folder" nests root-level copies.
 *
 * Commits for real, so each test deletes its workspaces afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import { placeCategoryRepository } from "@chatbotx.io/database/repositories/place-category"
import {
  flowModel,
  flowVersionModel,
  pipelineModel,
  pipelineStageModel,
  placeCategoryModel,
  placeLocationModel,
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
const { buildTemplateSnapshot } = await import(
  "../../src/template/snapshot.service"
)

const { previewDependencies } = await import(
  "../../src/template/install-preview"
)

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: true, allowDelete: true }
const TEMPLATE_NAME = "Parity template"

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

const stateTriple = () =>
  ["success", "error", "skip"].map((stateType) => ({
    id: createId(),
    stateType,
  }))

/** A one-node flow graph whose single step is `step`; a text step needs a message node. */
const graphWith = (step: Record<string, unknown>) => {
  const nodeId = createId()
  const isText = step.stepType === "sendText"
  return {
    startNodeId: nodeId,
    nodes: [
      {
        id: nodeId,
        type: isText ? "sendMessage" : "performAction",
        data: {
          name: "Step",
          isStartNode: true,
          details: {
            steps: [{ id: createId(), ...step }],
            ...(isText
              ? {
                  beforeStep: {
                    id: createId(),
                    channel: "webchat",
                    stepType: "chooseChannel",
                  },
                  quickReplies: [],
                  quickReplySettings: {
                    retry: {
                      id: createId(),
                      target: null,
                      enabled: false,
                      message: "",
                      maxRetries: 3,
                    },
                    followUp: {
                      id: createId(),
                      unit: "days",
                      target: null,
                      enabled: false,
                      duration: 1,
                    },
                  },
                }
              : {}),
          },
        },
        measured: { width: 288, height: 100 },
        position: { x: 100, y: 100 },
      },
    ],
    edges: [],
  }
}

describe.skipIf(!databaseUrl)(
  "template reference safety on a real database",
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

    const createWorkspace = async (label: string) => {
      const suffix = createId()
      const [owner] = await db
        .insert(userModel)
        .values({ email: `template-${label}-${suffix}@example.test` })
        .returning({ id: userModel.id })
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `template-${label}-${suffix}`, ownerId: owner.id })
        .returning({ id: workspaceModel.id })
      created.push({ workspaceId: workspace.id, userId: owner.id })
      return { workspaceId: workspace.id, suffix }
    }

    const insertFlow = async (
      workspaceId: string,
      name: string,
      step: Record<string, unknown>,
    ) => {
      const [flow] = await db
        .insert(flowModel)
        .values({ workspaceId, name })
        .returning({ id: flowModel.id })
      const graph = graphWith(step)
      await db.insert(flowVersionModel).values({
        workspaceId,
        flowId: flow.id,
        nodes: graph.nodes,
        edges: graph.edges,
        isDraft: true,
        isLatest: false,
        startNodeId: graph.startNodeId,
      })
      return flow.id
    }

    const seedPendingInstall = async () => {
      const { workspaceId, suffix } = await createWorkspace("target")
      const [template] = await db
        .insert(templateModel)
        .values({
          workspaceId,
          tenantId: "1",
          name: TEMPLATE_NAME,
          selection: { mode: "all" } as never,
          payload: {},
          categoryCounts: {},
          formatVersion: 1,
          shareToken: `tok-${suffix}`,
          defaultPermissions: permissions,
        })
        .returning({ id: templateModel.id })
      const installation = await templateInstallationRepository.create({
        workspaceId,
        templateId: template.id,
        sourceTemplateId: template.id,
        templateName: TEMPLATE_NAME,
        sourceWorkspaceId: "999000",
        formatVersion: 1,
        status: "pending",
        permissions,
      })
      return { workspaceId, installationId: installation.id }
    }

    const parse = (raw: unknown) => {
      const parsed = parseTemplateExport(raw)
      if (!parsed.ok) {
        throw new Error(parsed.reason)
      }
      return parsed.data
    }

    const install = async (
      payload: ReturnType<typeof parse>,
      createInstallFolder = false,
      /** Seeds the target workspace before the install runs. */
      beforeRun?: (workspaceId: string) => Promise<void>,
    ) => {
      const seed = await seedPendingInstall()
      await beforeRun?.(seed.workspaceId)
      const claim = await templateInstallService.claim(seed)
      if (!claim) {
        throw new Error("the install could not be claimed")
      }
      await templateInstallService.run({
        installationId: seed.installationId,
        workspaceId: seed.workspaceId,
        claimToken: claim.claimToken,
        permissions,
        payload,
        templateName: TEMPLATE_NAME,
        createInstallFolder,
        sourceVersion: 1,
      })
      const installation =
        await templateInstallationRepository.findByIdAndWorkspace({
          id: seed.installationId,
          workspaceId: seed.workspaceId,
        })
      return { seed, installation }
    }

    const envelope = (resources: Record<string, unknown>, manifests = {}) => ({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "999000", tenantId: "1" },
      manifests,
      resources,
    })

    test("a trigger action that names a flow the template does not carry installs without that action", async () => {
      const SOURCE_FLOW_ID = "11753572790853543"
      const { seed } = await install(
        parse(
          envelope({
            triggers: [
              {
                sourceId: "700",
                name: "Pipeline priority runs flow",
                active: true,
                folderId: null,
                actions: [
                  { type: "startAnotherFlow", flowId: SOURCE_FLOW_ID },
                  { type: "other", note: "kept" },
                ],
              },
            ],
          }),
        ),
      )

      const [trigger] = await db.query.triggerModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(JSON.stringify(trigger.actions)).not.toContain(SOURCE_FLOW_ID)
      expect(trigger.actions).toEqual([{ type: "other", note: "kept" }])
      const installation =
        await templateInstallationRepository.findByIdAndWorkspace({
          id: seed.installationId,
          workspaceId: seed.workspaceId,
        })
      const warnings = JSON.stringify(installation?.warnings ?? [])
      expect(warnings).toContain("referenceRemoved")
    })

    test("a flow a trigger action starts ships with the template and the copy points at the new flow", async () => {
      const source = await createWorkspace("source")
      const targetFlowId = await insertFlow(source.workspaceId, "Target flow", {
        stepType: "sendText",
        text: "hi",
        buttons: [],
      })
      const [trigger] = await db
        .insert(triggerModel)
        .values({
          workspaceId: source.workspaceId,
          name: "Starts the flow",
          active: true,
          actions: [
            { type: "startAnotherFlow", flowId: targetFlowId },
          ] as never,
        })
        .returning({ id: triggerModel.id })

      const snapshot = await buildTemplateSnapshot({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { triggers: { mode: "ids", ids: [trigger.id] } },
      })

      const shippedFlowIds = snapshot.payload.resources.flows.map(
        (flow) => flow.sourceId,
      )
      expect(shippedFlowIds).toEqual([targetFlowId])

      const { seed } = await install(parse(snapshot.payload))
      const [copiedFlow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const [copiedTrigger] = await db.query.triggerModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(copiedTrigger.actions).toEqual([
        { type: "startAnotherFlow", flowId: copiedFlow.id },
      ])
      expect(copiedFlow.id).not.toBe(targetFlowId)
    })

    test("the dependency preview names each row it pulls in", async () => {
      const source = await createWorkspace("preview")
      const targetFlowId = await insertFlow(
        source.workspaceId,
        "Welcome flow",
        {
          stepType: "sendText",
          text: "hi",
          buttons: [],
        },
      )
      const [trigger] = await db
        .insert(triggerModel)
        .values({
          workspaceId: source.workspaceId,
          name: "Starts it",
          active: true,
          actions: [
            { type: "startAnotherFlow", flowId: targetFlowId },
          ] as never,
        })
        .returning({ id: triggerModel.id })

      const preview = await previewDependencies({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { triggers: { mode: "ids", ids: [trigger.id] } },
      })

      expect(preview.includedDependencies).toEqual([
        { category: "flows", sourceId: targetFlowId, name: "Welcome flow" },
      ])
    })

    test("two flows that start each other are both collected and the walk ends", async () => {
      const source = await createWorkspace("cycle")
      const flowA = await insertFlow(source.workspaceId, "A", {
        stepType: "startExternalFlow",
        states: stateTriple(),
        flowId: "1",
      })
      const flowB = await insertFlow(source.workspaceId, "B", {
        stepType: "startExternalFlow",
        states: stateTriple(),
        flowId: flowA,
      })
      // Point A at B now that B exists.
      const [draftA] = await db.query.flowVersionModel.findMany({
        where: { flowId: flowA },
      })
      const nodes = JSON.parse(
        JSON.stringify(draftA.nodes).replace(
          '"flowId":"1"',
          `"flowId":"${flowB}"`,
        ),
      )
      await db
        .update(flowVersionModel)
        .set({ nodes })
        .where(eq(flowVersionModel.id, draftA.id))

      const snapshot = await buildTemplateSnapshot({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { flows: { mode: "ids", ids: [flowA] } },
      })

      expect(
        snapshot.payload.resources.flows.map((flow) => flow.sourceId).sort(),
      ).toEqual([flowA, flowB].sort())
    })

    test("pipelines a flow step names ship and the installed step points at the new pipeline and stage", async () => {
      const source = await createWorkspace("pipelines")
      const [pipeline] = await db
        .insert(pipelineModel)
        .values({
          workspaceId: source.workspaceId,
          name: "Sales",
          type: "opportunity",
          referenceName: "sales",
          settings: {},
        } as never)
        .returning({ id: pipelineModel.id })
      const [stage] = await db
        .insert(pipelineStageModel)
        .values({
          workspaceId: source.workspaceId,
          pipelineId: pipeline.id,
          name: "New",
          position: 0,
        })
        .returning({ id: pipelineStageModel.id })
      const flowId = await insertFlow(source.workspaceId, "Adds a deal", {
        stepType: "pipeline",
        action: "addToPipeline",
        states: stateTriple(),
        pipelineId: pipeline.id,
        stageId: stage.id,
        status: "open",
        description: "",
        dueDate: { mode: "none" },
        fieldValues: [],
        assigneeMemberIds: [],
        assigneeInboxTeamIds: [],
        title: "Deal",
      })

      const snapshot = await buildTemplateSnapshot({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { flows: { mode: "ids", ids: [flowId] } },
      })
      expect(Object.keys(snapshot.payload.manifests.pipelines)).toEqual([
        pipeline.id,
      ])

      const { seed } = await install(parse(snapshot.payload))
      const [targetPipeline] = await db.query.pipelineModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const [targetStage] = await db.query.pipelineStageModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(targetPipeline.name).toBe("Sales")
      const [copied] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const version = await db.query.flowVersionModel.findFirst({
        where: { flowId: copied.id },
      })
      const step = (
        version?.nodes[0] as unknown as {
          data: { details: { steps: Record<string, unknown>[] } }
        }
      ).data.details.steps[0]
      expect(step.pipelineId).toBe(targetPipeline.id)
      expect(step.stageId).toBe(targetStage.id)
    })

    /** A source flow whose Places Near Me step filters by a "SHOP" category with one location. */
    const placesFlowSnapshot = async (label: string) => {
      const source = await createWorkspace(label)
      const [category] = await db
        .insert(placeCategoryModel)
        .values({ workspaceId: source.workspaceId, name: "SHOP" } as never)
        .returning({ id: placeCategoryModel.id })
      await db.insert(placeLocationModel).values({
        workspaceId: source.workspaceId,
        categoryId: category.id,
        name: "Main store",
        latitude: 16.06,
        longitude: 108.2,
      } as never)
      const flowId = await insertFlow(source.workspaceId, "Find a store", {
        stepType: "findPlacesNearMe",
        placeCategoryId: category.id,
      })
      const snapshot = await buildTemplateSnapshot({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { flows: { mode: "ids", ids: [flowId] } },
      })
      return { categoryId: category.id, snapshot }
    }

    const installedPlacesStep = async (workspaceId: string) => {
      const [copied] = await db.query.flowModel.findMany({
        where: { workspaceId },
      })
      const version = await db.query.flowVersionModel.findFirst({
        where: { flowId: copied.id },
      })
      return (
        version?.nodes[0] as unknown as {
          data: { details: { steps: Record<string, unknown>[] } }
        }
      ).data.details.steps[0]
    }

    test("a place category a flow step filters by ships by name and is created empty on install", async () => {
      const { categoryId, snapshot } = await placesFlowSnapshot("places")
      expect(snapshot.payload.manifests.placeCategories).toEqual({
        [categoryId]: { name: "SHOP" },
      })
      expect(snapshot.droppedReferenceCount).toBe(0)

      const { seed } = await install(parse(snapshot.payload))

      const categories = await db.query.placeCategoryModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(categories.map((row) => row.name)).toEqual(["SHOP"])
      // Locations are the publisher's own addresses: never copied.
      const locations = await db.query.placeLocationModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(locations).toEqual([])
      expect(
        (await installedPlacesStep(seed.workspaceId)).placeCategoryId,
      ).toBe(categories[0].id)
      const tracked = await db.query.templateInstalledResourceModel.findMany({
        where: {
          installationId: seed.installationId,
          resourceKind: "placeCategory",
        },
      })
      expect(tracked).toMatchObject([
        { resourceId: categories[0].id, wasExisting: false },
      ])
    })

    test("find-or-create matches names the way the unique index does, in one call", async () => {
      const { workspaceId } = await createWorkspace("places-names")
      const [existing] = await db
        .insert(placeCategoryModel)
        .values({ workspaceId, name: "shop" } as never)
        .returning({ id: placeCategoryModel.id })

      const { idByName, createdIds } =
        await placeCategoryRepository.findOrCreateByNames({
          workspaceId,
          // Two case variants of an existing name, plus one new name twice.
          names: ["SHOP", "Shop", " F&B ", "f&b"],
        })

      expect(idByName.get("SHOP")).toBe(existing.id)
      expect(idByName.get("Shop")).toBe(existing.id)
      expect(idByName.get("F&B")).toBe(idByName.get("f&b"))
      expect(createdIds.size).toBe(1)
      expect(createdIds.has(idByName.get("F&B") ?? "")).toBe(true)
      const rows = await db.query.placeCategoryModel.findMany({
        where: { workspaceId },
      })
      expect(rows).toHaveLength(2)
    })

    test("a same-named place category in another case is reused, not duplicated", async () => {
      const { snapshot } = await placesFlowSnapshot("places-reuse")
      let existingId = ""

      const { seed } = await install(
        parse(snapshot.payload),
        false,
        async (workspaceId) => {
          const [row] = await db
            .insert(placeCategoryModel)
            .values({ workspaceId, name: "shop" } as never)
            .returning({ id: placeCategoryModel.id })
          existingId = row.id
        },
      )

      const categories = await db.query.placeCategoryModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(categories.map((row) => row.id)).toEqual([existingId])
      expect(
        (await installedPlacesStep(seed.workspaceId)).placeCategoryId,
      ).toBe(existingId)
      const tracked = await db.query.templateInstalledResourceModel.findMany({
        where: {
          installationId: seed.installationId,
          resourceKind: "placeCategory",
        },
      })
      // Reused: an uninstall leaves it in place.
      expect(tracked).toMatchObject([
        { resourceId: existingId, wasExisting: true },
      ])
    })

    test("pipelines a flow step names that no longer exist count as dropped references", async () => {
      const source = await createWorkspace("dangling")
      const flowId = await insertFlow(source.workspaceId, "Dangling deal", {
        stepType: "pipeline",
        action: "transfer",
        states: stateTriple(),
        pipelineId: "990300000000000",
        destinationPipelineId: "990300000000001",
        destinationStageId: "990300000000002",
      })

      const snapshot = await buildTemplateSnapshot({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { flows: { mode: "ids", ids: [flowId] } },
      })

      expect(snapshot.payload.manifests.pipelines).toEqual({})
      expect(snapshot.droppedReferenceCount).toBe(3)
    })

    test("a flow that starts a flow that no longer exists counts it once", async () => {
      const source = await createWorkspace("dangling-flow")
      const flowId = await insertFlow(source.workspaceId, "Starter", {
        stepType: "startExternalFlow",
        flowId: "990300000000009",
      })

      const snapshot = await buildTemplateSnapshot({
        workspaceId: source.workspaceId,
        tenantId: "1",
        selection: { flows: { mode: "ids", ids: [flowId] } },
      })

      expect(snapshot.droppedReferenceCount).toBe(1)
    })

    test("with an install folder, root-level flows, keywords and triggers are nested under a folder named after the template", async () => {
      const { seed, installation } = await install(
        parse(
          envelope({
            flows: [flowEntry("801", "First")],
            keywords: [
              {
                sourceId: "901",
                type: "inbound",
                keywords: ["first"],
                text: null,
                flowId: "801",
                folderId: null,
              },
              {
                sourceId: "902",
                type: "outbound",
                keywords: ["second"],
                text: "hello",
                flowId: null,
                folderId: null,
              },
            ],
            triggers: [
              {
                sourceId: "700",
                name: "T",
                active: true,
                folderId: null,
                actions: [],
              },
            ],
          }),
        ),
        true,
      )

      expect(installation?.installFolderId).toBeTruthy()
      const folders = await db.query.folderModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const folderOf = (folderType: string) =>
        folders.find((folder) => folder.folderType === folderType)
      for (const type of [
        "flow",
        "trigger",
        "automatedResponse",
        "outboundAutomatedResponse",
      ]) {
        expect(folderOf(type)?.name).toBe(TEMPLATE_NAME)
      }
      const [flow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const [trigger] = await db.query.triggerModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const keywords = await db.query.automatedResponseModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(flow.folderId).toBe(folderOf("flow")?.id)
      expect(trigger.folderId).toBe(folderOf("trigger")?.id)
      expect(keywords.find((row) => row.type === "inbound")?.folderId).toBe(
        folderOf("automatedResponse")?.id,
      )
      expect(keywords.find((row) => row.type === "outbound")?.folderId).toBe(
        folderOf("outboundAutomatedResponse")?.id,
      )
    })

    test("without an install folder, root-level copies stay at the root", async () => {
      const { seed, installation } = await install(
        parse(envelope({ flows: [flowEntry("801", "First")] })),
      )
      expect(installation?.installFolderId).toBeNull()
      const [flow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(flow.folderId).toBeNull()
    })

    const flowPayloadEntry = (
      sourceId: string,
      name: string,
      step: Record<string, unknown>,
    ) => {
      const graph = graphWith(step)
      return {
        sourceId,
        name,
        active: true,
        enableInInbox: true,
        startNodeId: graph.startNodeId,
        nodes: graph.nodes,
        edges: graph.edges,
        folderId: null,
      }
    }

    const installedStepsOf = async (workspaceId: string, name: string) => {
      const flow = await db.query.flowModel.findFirst({
        where: { workspaceId, name },
      })
      if (!flow) {
        return
      }
      const version = await db.query.flowVersionModel.findFirst({
        where: { flowId: flow.id },
      })
      return (
        version?.nodes[0] as unknown as {
          data: { details: { steps: Record<string, unknown>[] } }
        }
      ).data.details.steps
    }

    test("a flow whose step has an unresolved required reference is skipped whole, not installed with the step missing", async () => {
      const { seed, installation } = await install(
        parse(
          envelope({
            flows: [
              flowPayloadEntry("901", "Transcribes", {
                stepType: "aiSpeechToText",
                provider: "openai",
                model: "whisper-1",
                inputFieldId: "990500000000001",
                outputFieldId: "990500000000002",
              }),
              flowPayloadEntry("902", "Plain", {
                stepType: "sendText",
                text: "hi",
                buttons: [],
              }),
            ],
          }),
        ),
      )

      expect(await installedStepsOf(seed.workspaceId, "Transcribes")).toBe(
        undefined,
      )
      expect(await installedStepsOf(seed.workspaceId, "Plain")).toBeDefined()
      const warnings = JSON.stringify(installation?.warnings ?? [])
      expect(warnings).toContain("flowSkippedRequiredReference")
    })

    test("an unresolved optional reference is deleted and the step stays", async () => {
      const { seed, installation } = await install(
        parse(
          envelope({
            flows: [
              flowPayloadEntry("903", "Subscribes", {
                stepType: "subscribeSequence",
                sequenceId: "990500000000003",
              }),
            ],
          }),
        ),
      )

      const steps = await installedStepsOf(seed.workspaceId, "Subscribes")
      expect(steps).toHaveLength(1)
      expect(steps?.[0]).not.toHaveProperty("sequenceId")
      const warnings = JSON.stringify(installation?.warnings ?? [])
      expect(warnings).toContain("referenceRemoved")
      expect(warnings).not.toContain("flowSkippedRequiredReference")
    })
  },
)
