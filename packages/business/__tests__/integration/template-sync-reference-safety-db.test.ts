// @vitest-environment node

/**
 * A sync must not strip a valid reference to something it leaves alone: a jump
 * into a node of a flow copy the new version no longer ships stays, because the
 * copy still exists in the workspace.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
  folderModel,
  templateInstallationModel,
  templateModel,
  triggerModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
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

const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { templateSyncRequestService } = await import(
  "../../src/template/sync-request.service"
)
const { templateSyncExecuteService } = await import(
  "../../src/template/sync-execute.service"
)

const databaseUrl = realDatabaseUrl()
const actor = { kind: "apiToken", permission: "full" } as const
const permissions = { allowEdit: true, allowDelete: true }

const FLOW_B = "8101"
const FLOW_A = "8102"
const NODE_B = "81010"
const NODE_A = "81020"

const textFlow = (sourceId: string, nodeId: string, name: string) => ({
  sourceId,
  name,
  active: true,
  enableInInbox: true,
  startNodeId: nodeId,
  folderId: null,
  edges: [],
  nodes: [
    {
      id: nodeId,
      type: "sendMessage",
      data: {
        name: "Text",
        isStartNode: true,
        details: {
          steps: [
            { id: `${nodeId}1`, stepType: "sendText", text: "hi", buttons: [] },
          ],
          beforeStep: {
            id: `${nodeId}2`,
            channel: "webchat",
            stepType: "chooseChannel",
          },
          quickReplies: [],
          quickReplySettings: {
            retry: {
              id: `${nodeId}3`,
              target: null,
              enabled: false,
              message: "",
              maxRetries: 3,
            },
            followUp: {
              id: `${nodeId}4`,
              unit: "days",
              target: null,
              enabled: false,
              duration: 1,
            },
          },
        },
      },
      measured: { width: 288, height: 100 },
      position: { x: 0, y: 0 },
    },
  ],
})

const jumpFlow = (name: string) => ({
  sourceId: FLOW_A,
  name,
  active: true,
  enableInInbox: true,
  startNodeId: NODE_A,
  folderId: null,
  edges: [],
  nodes: [
    {
      id: NODE_A,
      type: "performAction",
      data: {
        name: "Jump",
        isStartNode: true,
        details: {
          steps: [
            {
              id: `${NODE_A}1`,
              stepType: "startExternalNode",
              flowId: FLOW_B,
              nodeId: NODE_B,
            },
          ],
        },
      },
      measured: { width: 288, height: 100 },
      position: { x: 0, y: 0 },
    },
  ],
})

const payloadOf = (input: unknown[] | Record<string, unknown>) => {
  const resources = Array.isArray(input) ? { flows: input } : input
  const parsed = parseTemplateExport({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: "999000", tenantId: "1" },
    manifests: {},
    resources,
  })
  if (!parsed.ok) {
    throw new Error(parsed.reason)
  }
  return parsed.data
}

describe.skipIf(!databaseUrl)("template sync reference safety", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const installThenSync = async (input: {
    first: ReturnType<typeof payloadOf>
    second: ReturnType<typeof payloadOf>
    createInstallFolder: boolean
    /** Runs after the install, before the sync is requested. */
    beforeSync?: (ids: {
      workspaceId: string
      installationId: string
    }) => Promise<void>
  }) => {
    const { first, second } = input
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `template-sync-ref-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `template-sync-ref-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })

    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: first,
        categoryCounts: { flows: 2 },
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
        version: 2,
      })
      .returning({ id: templateModel.id })
    for (const [version, payload] of [
      [1, first],
      [2, second],
    ] as const) {
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
      createInstallFolder: input.createInstallFolder,
      sourceVersion: 1,
    })

    await input.beforeSync?.({
      workspaceId: workspace.id,
      installationId: installation.id,
    })
    const { syncId } = await templateSyncRequestService.request({
      workspaceId: workspace.id,
      installationId: installation.id,
      actor,
      trigger: "manual",
    })
    const claimed = await templateSyncExecuteService.claim({
      syncId,
      workspaceId: workspace.id,
    })
    if (!claimed) {
      throw new Error("the sync could not be claimed")
    }
    await templateSyncExecuteService.run({
      sync: claimed.sync,
      claimToken: claimed.claimToken,
    })

    return workspace.id
  }

  test("a jump into a flow copy the new version leaves alone survives the sync", async () => {
    const workspaceId = await installThenSync({
      // Version 2 renames A and no longer ships B at all.
      first: payloadOf([textFlow(FLOW_B, NODE_B, "B"), jumpFlow("A")]),
      second: payloadOf([jumpFlow("A renamed")]),
      createInstallFolder: false,
    })
    const flows = await db.query.flowModel.findMany({
      where: { workspaceId },
    })
    const copyB = flows.find((flow) => flow.name === "B")
    const copyA = flows.find((flow) => flow.name === "A renamed")
    expect(copyB).toBeDefined()
    expect(copyA).toBeDefined()
    const draftA = await db.query.flowVersionModel.findFirst({
      where: { flowId: copyA?.id, isDraft: true },
    })
    const step = (
      draftA?.nodes[0] as unknown as {
        data: { details: { steps: Record<string, unknown>[] } }
      }
    ).data.details.steps[0]
    expect(step).toMatchObject({ flowId: copyB?.id, nodeId: NODE_B })
  })

  test("a flow a later version adds at the root is nested under the install folder", async () => {
    const workspaceId = await installThenSync({
      first: payloadOf([textFlow(FLOW_B, NODE_B, "B")]),
      second: payloadOf([textFlow(FLOW_B, NODE_B, "B"), jumpFlow("A")]),
      createInstallFolder: true,
    })
    const flows = await db.query.flowModel.findMany({ where: { workspaceId } })
    const folders = await db.query.folderModel.findMany({
      where: { workspaceId },
    })
    expect(folders).toHaveLength(1)
    expect(flows).toHaveLength(2)
    for (const flow of flows) {
      expect(flow.folderId).toBe(folders[0].id)
    }
  })

  const trigger = (sourceId: string, name: string) => ({
    sourceId,
    name,
    active: true,
    folderId: null,
    actions: [],
  })
  const triggerRoots = async (workspaceId: string) =>
    await db.query.folderModel.findMany({
      where: { workspaceId, folderType: "trigger" },
    })
  const activeRootRows = async (installationId: string) =>
    (
      await db.query.templateInstalledResourceModel.findMany({
        where: { installationId, resourceKind: "folder" },
      })
    ).filter((row) => row.detachedAt === null)

  test("a root the installer renamed is still the root after a sync", async () => {
    const workspaceId = await installThenSync({
      first: payloadOf({ triggers: [trigger("701", "T1")] }),
      second: payloadOf({
        triggers: [trigger("701", "T1"), trigger("702", "T2")],
      }),
      createInstallFolder: true,
      beforeSync: async (ids) => {
        await db
          .update(folderModel)
          .set({ name: "My renamed folder" })
          .where(eq(folderModel.workspaceId, ids.workspaceId))
      },
    })
    const roots = await triggerRoots(workspaceId)
    expect(roots).toHaveLength(1)
    expect(roots[0].name).toBe("My renamed folder")
    const triggers = await db.query.triggerModel.findMany({
      where: { workspaceId },
    })
    expect(triggers).toHaveLength(2)
    for (const row of triggers) {
      expect(row.folderId).toBe(roots[0].id)
    }
  })

  test("a root the installer deleted is re-created and tracked once by a sync", async () => {
    let installationId = ""
    const workspaceId = await installThenSync({
      first: payloadOf({ triggers: [trigger("701", "T1")] }),
      second: payloadOf({
        triggers: [trigger("701", "T1"), trigger("702", "T2")],
      }),
      createInstallFolder: true,
      beforeSync: async (ids) => {
        installationId = ids.installationId
        // The installer empties and deletes the root.
        await db
          .update(triggerModel)
          .set({ folderId: null })
          .where(eq(triggerModel.workspaceId, ids.workspaceId))
        await db
          .delete(folderModel)
          .where(eq(folderModel.workspaceId, ids.workspaceId))
      },
    })
    const roots = await triggerRoots(workspaceId)
    expect(roots).toHaveLength(1)
    const rows = await activeRootRows(installationId)
    expect(rows).toHaveLength(1)
    expect(rows[0].resourceId).toBe(roots[0].id)
    const added = await db.query.triggerModel.findFirst({
      where: { workspaceId, name: "T2" },
    })
    expect(added?.folderId).toBe(roots[0].id)
  })

  test("a template name that changed since the install does not break a sync", async () => {
    const workspaceId = await installThenSync({
      first: payloadOf({ triggers: [trigger("701", "T1")] }),
      second: payloadOf({
        triggers: [trigger("701", "T1"), trigger("702", "T2")],
      }),
      createInstallFolder: true,
      beforeSync: async (ids) => {
        await db
          .update(templateInstallationModel)
          .set({ templateName: "Renamed template" })
          .where(eq(templateInstallationModel.id, ids.installationId))
      },
    })
    const roots = await triggerRoots(workspaceId)
    expect(roots).toHaveLength(1)
    expect(roots[0].name).toBe("Template")
    expect(
      await db.$count(triggerModel, eq(triggerModel.workspaceId, workspaceId)),
    ).toBe(2)
  })
})
