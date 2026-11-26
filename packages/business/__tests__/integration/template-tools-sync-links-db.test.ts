// @vitest-environment node

/**
 * A sync rebuilds the magic-link name bindings from what this installation
 * already copied, so a synced flow's link follows the copy even after the
 * installer renamed it.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
  magicLinkModel,
  templateModel,
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
const NODE_B = "81010"

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

const payloadOf = (input: unknown[] | Record<string, unknown>) => {
  const resources = Array.isArray(input) ? { flows: input } : input
  const parsed = parseTemplateExport({
    formatVersion: 3,
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
        categoryCounts: { flows: 1, magicLinks: 1 },
        formatVersion: 3,
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
            formatVersion: 3,
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
      formatVersion: 3,
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

  const linkedFlow = (text: string) => {
    const flow = textFlow(FLOW_B, NODE_B, "Promo flow")
    const step = flow.nodes[0].data.details.steps[0]
    step.text = text
    return flow
  }

  test("a synced flow's link follows the magic link copy the installer renamed", async () => {
    const link = { sourceId: "11", name: "promo", url: "https://shop.example" }
    let renamedTo = ""
    const workspaceId = await installThenSync({
      first: payloadOf({
        magicLinks: [link],
        flows: [linkedFlow("Sale https://x.io/r/999000/promo")],
      }),
      second: payloadOf({
        magicLinks: [link],
        flows: [linkedFlow("Sale again https://x.io/r/999000/promo?utm=a")],
      }),
      createInstallFolder: false,
      beforeSync: async ({ workspaceId: installed }) => {
        // The installer renamed the copy after installing.
        renamedTo = "promo-renamed"
        await db
          .update(magicLinkModel)
          .set({ name: renamedTo })
          .where(eq(magicLinkModel.workspaceId, installed))
      },
    })
    const [flow] = await db.query.flowModel.findMany({ where: { workspaceId } })
    const draft = await db.query.flowVersionModel.findFirst({
      where: { flowId: flow.id, isDraft: true },
    })
    const text = JSON.stringify(draft?.nodes)
    expect(text).toContain(
      `Sale again https://x.io/r/${workspaceId}/${renamedTo}?utm=a`,
    )
    expect(text).not.toContain("999000")
  })
})
