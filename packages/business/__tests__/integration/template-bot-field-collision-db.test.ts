// @vitest-environment node

/**
 * Bot-field name collisions, against a real Postgres: an install or a
 * single-flow import that meets a same-named bot field of ANOTHER type creates
 * `<name>_<n>` (the custom-field policy), reuses a same-typed one, and the
 * install preview predicts exactly that. `{{bot_field:<id>}}` tokens follow the
 * id map, so a rename needs no token rewrite.
 *
 * Commits for real, so each test deletes its workspaces afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  botFieldModel,
  flowVersionModel,
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
const { previewInstallCollisions } = await import(
  "../../src/template/install-preview"
)
const { flowService } = await import("../../src/flow/service")
const { buildTemplateSnapshot } = await import(
  "../../src/template/snapshot.service"
)

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: true, allowDelete: true }
const TEMPLATE_NAME = "Bot field template"

type SeedField = { name: string; type: string }

describe.skipIf(!databaseUrl)("bot-field collisions on a real database", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const createWorkspace = async (label: string, existing: SeedField[] = []) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `bf-${label}-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `bf-${label}-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    for (const field of existing) {
      await db.insert(botFieldModel).values({
        workspaceId: workspace.id,
        name: field.name,
        type: field.type as never,
      })
    }
    return { workspaceId: workspace.id, suffix }
  }

  const botFieldsOf = async (workspaceId: string) =>
    (
      await db.query.botFieldModel.findMany({
        where: { workspaceId },
        columns: { id: true, name: true, type: true },
      })
    ).sort((a, b) => a.name.localeCompare(b.name))

  const envelope = (botFields: Record<string, unknown>[]) => {
    const parsed = parseTemplateExport({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "999000", tenantId: "1" },
      manifests: {},
      resources: { settings: { savedReplies: [], botFields } },
    })
    if (!parsed.ok) {
      throw new Error(parsed.reason)
    }
    return parsed.data
  }

  const parse = (raw: unknown) => {
    const parsed = parseTemplateExport(raw)
    if (!parsed.ok) {
      throw new Error(parsed.reason)
    }
    return parsed.data
  }

  const botFieldEntry = (sourceId: string, name: string, type: string) => ({
    sourceId,
    name,
    type,
    value: "v",
    description: null,
    folderId: null,
  })

  const install = async (
    payload: ReturnType<typeof envelope>,
    existing: SeedField[],
  ) => {
    const { workspaceId, suffix } = await createWorkspace("target", existing)
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
    const claim = await templateInstallService.claim({
      workspaceId,
      installationId: installation.id,
    })
    if (!claim) {
      throw new Error("the install could not be claimed")
    }
    await templateInstallService.run({
      installationId: installation.id,
      workspaceId,
      claimToken: claim.claimToken,
      permissions,
      payload,
      templateName: TEMPLATE_NAME,
      createInstallFolder: false,
      sourceVersion: 1,
    })
    const done = await templateInstallationRepository.findByIdAndWorkspace({
      id: installation.id,
      workspaceId,
    })
    return { workspaceId, warnings: JSON.stringify(done?.warnings ?? []) }
  }

  test("install creates <name>_1 when the name is held by another type, and warns once", async () => {
    const { workspaceId, warnings } = await install(
      envelope([botFieldEntry("b1", "Score", "shortText")]),
      [{ name: "Score", type: "number" }],
    )

    const fields = await botFieldsOf(workspaceId)
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ["Score", "number"],
      ["Score_1", "shortText"],
    ])
    expect(warnings.match(/botFieldRenamed/g)).toHaveLength(1)
  })

  test("install reuses a same-typed bot field and renames nothing", async () => {
    const { workspaceId, warnings } = await install(
      envelope([botFieldEntry("b1", "Score", "number")]),
      [{ name: "score", type: "number" }],
    )

    const fields = await botFieldsOf(workspaceId)
    expect(fields.map((f) => f.name)).toEqual(["score"])
    expect(warnings).not.toContain("botFieldRenamed")
  })

  test("the suffix skips names taken by any type, case-insensitively", async () => {
    const { workspaceId } = await install(
      envelope([botFieldEntry("b1", "Score", "shortText")]),
      [
        { name: "Score", type: "number" },
        { name: "SCORE_1", type: "date" },
      ],
    )

    const names = (await botFieldsOf(workspaceId)).map((f) => f.name)
    expect(names).toContain("Score_2")
  })

  test("the preview predicts the rename and the reuse the install performs", async () => {
    const { workspaceId } = await createWorkspace("preview", [
      { name: "Score", type: "number" },
      { name: "Tier", type: "shortText" },
    ])

    const { collisions } = await previewInstallCollisions({
      workspaceId,
      manifests: envelope([]).manifests,
      botFields: [
        { sourceId: "b1", name: "Score", type: "shortText" },
        { sourceId: "b2", name: "Tier", type: "shortText" },
        { sourceId: "b3", name: "Fresh", type: "shortText" },
      ],
    })

    expect(collisions.map((c) => [c.manifest, c.sourceId, c.action])).toEqual([
      ["botFields", "b1", "rename"],
      ["botFields", "b2", "reuse"],
      ["botFields", "b3", "create"],
    ])
  })

  const importWithBotField = async (existing: SeedField[], type: string) => {
    const { workspaceId } = await createWorkspace("import", existing)
    const nodeId = createId()
    const { flowId, renamedBotFields } = await flowService.importFlowExport({
      workspaceId,
      name: "Imported",
      active: true,
      enableInInbox: true,
      startNodeId: nodeId,
      nodes: [
        {
          id: nodeId,
          type: "sendMessage",
          data: {
            name: "Step",
            isStartNode: true,
            details: {
              steps: [
                {
                  id: createId(),
                  stepType: "sendText",
                  text: "hi {{bot_field:srcField}}",
                  buttons: [],
                },
              ],
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
            },
          },
          measured: { width: 288, height: 100 },
          position: { x: 100, y: 100 },
        },
      ] as never,
      edges: [],
      customFields: {},
      botFields: { srcField: { name: "Score", type: type as never } },
    })
    const [version] = await db
      .select({ nodes: flowVersionModel.nodes })
      .from(flowVersionModel)
      .where(eq(flowVersionModel.flowId, flowId))
    return {
      fields: await botFieldsOf(workspaceId),
      nodes: JSON.stringify(version.nodes),
      renamedBotFields,
    }
  }

  test("single-flow import renames a bot field whose name is held by another type and remaps its token by id", async () => {
    const { fields, nodes, renamedBotFields } = await importWithBotField(
      [{ name: "Score", type: "number" }],
      "shortText",
    )

    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ["Score", "number"],
      ["Score_1", "shortText"],
    ])
    const renamed = fields.find((f) => f.name === "Score_1")
    expect(nodes).toContain(`{{bot_field:${renamed?.id}}}`)
    expect(nodes).not.toContain("srcField")
    expect(renamedBotFields).toEqual([
      { from: "Score", to: "Score_1", type: "shortText" },
    ])
  })

  test("single-flow import reuses a same-typed bot field", async () => {
    const { fields, nodes, renamedBotFields } = await importWithBotField(
      [{ name: "Score", type: "number" }],
      "number",
    )

    expect(fields).toHaveLength(1)
    expect(nodes).toContain(`{{bot_field:${fields[0].id}}}`)
    expect(renamedBotFields).toEqual([])
  })

  test("a bot field named only by a trigger action's text ships with the trigger, and the copy points at the new field", async () => {
    const source = await createWorkspace("source")
    const [field] = await db
      .insert(botFieldModel)
      .values({
        workspaceId: source.workspaceId,
        name: "Promo",
        type: "shortText",
        value: "SAVE10",
      })
      .returning({ id: botFieldModel.id })
    const [trigger] = await db
      .insert(triggerModel)
      .values({
        workspaceId: source.workspaceId,
        name: "Uses the field",
        active: true,
        actions: [
          { type: "other", note: `Use code {{bot_field:${field.id}}}` },
        ] as never,
      })
      .returning({ id: triggerModel.id })

    const snapshot = await buildTemplateSnapshot({
      workspaceId: source.workspaceId,
      tenantId: "1",
      selection: { triggers: { mode: "ids", ids: [trigger.id] } },
    })

    expect(
      snapshot.payload.resources.settings.botFields.map((f) => f.sourceId),
    ).toEqual([field.id])

    const { workspaceId } = await install(parse(snapshot.payload), [])
    const [copied] = await botFieldsOf(workspaceId)
    const [copiedTrigger] = await db.query.triggerModel.findMany({
      where: { workspaceId },
    })
    expect(JSON.stringify(copiedTrigger.actions)).toContain(
      `{{bot_field:${copied.id}}}`,
    )
    expect(JSON.stringify(copiedTrigger.actions)).not.toContain(field.id)
  })

  const triggerWithText = async (workspaceId: string, note: string) => {
    const [trigger] = await db
      .insert(triggerModel)
      .values({
        workspaceId,
        name: "Names fields",
        active: true,
        actions: [{ type: "other", note }] as never,
      })
      .returning({ id: triggerModel.id })
    return trigger.id
  }

  test("a malformed {{bot_field:...}} token is ignored instead of failing the save", async () => {
    const source = await createWorkspace("malformed")
    const triggerId = await triggerWithText(
      source.workspaceId,
      "{{bot_field:abc}} and {{bot_field:}} and {{bot_field:1; drop}}",
    )

    const snapshot = await buildTemplateSnapshot({
      workspaceId: source.workspaceId,
      tenantId: "1",
      selection: { triggers: { mode: "ids", ids: [triggerId] } },
    })

    expect(snapshot.payload.resources.settings.botFields).toEqual([])
    expect(snapshot.droppedReferenceCount).toBe(0)
  })

  test("bot-field ids that no longer exist count as dropped, never toward the resource cap", async () => {
    const source = await createWorkspace("dangling-tokens")
    const ids = Array.from({ length: 250 }, (_, i) => 990_800_000_000_000 + i)
    const triggerId = await triggerWithText(
      source.workspaceId,
      ids.map((id) => `{{bot_field:${id}}}`).join(" "),
    )

    const snapshot = await buildTemplateSnapshot({
      workspaceId: source.workspaceId,
      tenantId: "1",
      selection: { triggers: { mode: "ids", ids: [triggerId] } },
    })

    expect(snapshot.payload.resources.settings.botFields).toEqual([])
    expect(snapshot.droppedReferenceCount).toBe(250)
  })
})
