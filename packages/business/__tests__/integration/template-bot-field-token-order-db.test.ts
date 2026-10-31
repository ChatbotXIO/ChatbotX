// @vitest-environment node

/**
 * `{{bot_field:<id>}}` text follows the bot field it names in EVERY category,
 * including the ones written before settings (questionnaires, products) and
 * the saved replies written with the bot fields themselves, on install and on
 * a sync that adds new entries. Real Postgres; commits for real.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
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
const SOURCE_FIELD_ID = "990700000000111"

const token = `{{bot_field:${SOURCE_FIELD_ID}}}`

const botFieldEntry = {
  sourceId: SOURCE_FIELD_ID,
  name: "Promo",
  type: "shortText",
  value: "SAVE10",
  description: null,
  folderId: null,
}
const savedReplyEntry = (sourceId: string, shortcut: string) => ({
  sourceId,
  shortcut,
  text: `Code ${token}`,
  images: [],
})
const questionnaireEntry = {
  sourceId: "990700000000201",
  name: `Quiz ${token}`,
  enableScore: false,
  enableRetryMessages: false,
  enableCustomFieldMapping: false,
  triggerFlowId: null,
  questions: [],
}
const productEntry = {
  sourceId: "990700000000301",
  name: "Product",
  shortDescription: `Use ${token}`,
  price: 10,
}

const SOURCE_COUPON_TOPIC_ID = "990700000000501"
const couponTopicEntry = {
  sourceId: SOURCE_COUPON_TOPIC_ID,
  name: "Spring",
  description: null,
  expiresAt: null,
  status: "active",
}
const couponBotFieldEntry = {
  ...botFieldEntry,
  value: `Coupon {{coupon:${SOURCE_COUPON_TOPIC_ID}}}`,
}

const parse = (resources: Record<string, unknown>) => {
  const parsed = parseTemplateExport({
    // Coupon topics need format 2.
    formatVersion: 2,
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

describe.skipIf(!databaseUrl)("bot-field tokens across install order", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedWorkspace = async (payloads: ReturnType<typeof parse>[]) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `bf-order-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `bf-order-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: payloads[0],
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
        version: payloads.length,
      })
      .returning({ id: templateModel.id })
    for (const [index, payload] of payloads.entries()) {
      await db.transaction(async (tx) => {
        await templateVersionRepository.insert(
          {
            id: createId(),
            templateId: template.id,
            workspaceId: workspace.id,
            version: index + 1,
            payload,
            payloadHash: `hash-${index + 1}`,
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
      payload: payloads[0],
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
    return { workspaceId: workspace.id, installationId: installation.id }
  }

  const copiedText = async (workspaceId: string) => {
    const [field] = await db.query.botFieldModel.findMany({
      where: { workspaceId },
    })
    const replies = await db.query.savedReplyModel.findMany({
      where: { workspaceId },
    })
    const questionnaires = await db.query.questionnaireModel.findMany({
      where: { workspaceId },
    })
    const products = await db.query.productModel.findMany({
      where: { workspaceId },
    })
    return {
      fieldId: field?.id,
      replies: replies.map((reply) => reply.text),
      questionnaires: questionnaires.map((row) => row.name),
      products: products.map((row) => row.shortDescription),
    }
  }

  test("install remaps the token in a questionnaire, a product and a saved reply", async () => {
    const { workspaceId } = await seedWorkspace([
      parse({
        questionnaires: [questionnaireEntry],
        products: [productEntry],
        settings: {
          savedReplies: [savedReplyEntry("990700000000401", "/code")],
          botFields: [botFieldEntry],
        },
      }),
    ])

    const copied = await copiedText(workspaceId)
    expect(copied.fieldId).toBeDefined()
    const expected = `{{bot_field:${copied.fieldId}}}`
    expect(copied.replies).toEqual([`Code ${expected}`])
    expect(copied.questionnaires).toEqual([`Quiz ${expected}`])
    expect(copied.products).toEqual([`Use ${expected}`])
  })

  test("a sync that adds a bot field and entries remaps the tokens of the new entries", async () => {
    const seed = await seedWorkspace([
      parse({
        settings: {
          savedReplies: [
            { ...savedReplyEntry("990700000000401", "/old"), text: "plain" },
          ],
          botFields: [],
        },
      }),
      parse({
        questionnaires: [questionnaireEntry],
        products: [productEntry],
        settings: {
          savedReplies: [
            { ...savedReplyEntry("990700000000401", "/old"), text: "plain" },
            savedReplyEntry("990700000000402", "/new"),
          ],
          botFields: [botFieldEntry],
        },
      }),
    ])

    const { syncId } = await templateSyncRequestService.request({
      ...seed,
      actor,
      trigger: "manual",
    })
    const claimed = await templateSyncExecuteService.claim({
      syncId,
      workspaceId: seed.workspaceId,
    })
    if (!claimed) {
      throw new Error("the sync could not be claimed")
    }
    await templateSyncExecuteService.run({
      sync: claimed.sync,
      claimToken: claimed.claimToken,
    })

    const copied = await copiedText(seed.workspaceId)
    expect(copied.fieldId).toBeDefined()
    const expected = `{{bot_field:${copied.fieldId}}}`
    expect(copied.replies.sort()).toEqual([`Code ${expected}`, "plain"])
    expect(copied.questionnaires).toEqual([`Quiz ${expected}`])
    expect(copied.products).toEqual([`Use ${expected}`])
  })

  const botFieldValue = async (workspaceId: string) => {
    const [field] = await db.query.botFieldModel.findMany({
      where: { workspaceId },
    })
    return field?.value
  }
  const topicIdOf = async (workspaceId: string) => {
    const [topic] = await db.query.couponTopicModel.findMany({
      where: { workspaceId },
    })
    return topic?.id
  }

  test("install rewrites a coupon token in a bot field value (the field is inserted early)", async () => {
    const { workspaceId } = await seedWorkspace([
      parse({
        couponTopics: [couponTopicEntry],
        settings: { savedReplies: [], botFields: [couponBotFieldEntry] },
      }),
    ])

    const topicId = await topicIdOf(workspaceId)
    expect(topicId).toBeDefined()
    expect(await botFieldValue(workspaceId)).toBe(
      `Coupon {{coupon:${topicId}}}`,
    )
  })

  test("a sync that adds a coupon topic and a bot field rewrites the coupon token in the field", async () => {
    const seed = await seedWorkspace([
      parse({ settings: { savedReplies: [], botFields: [] } }),
      parse({
        couponTopics: [couponTopicEntry],
        settings: { savedReplies: [], botFields: [couponBotFieldEntry] },
      }),
    ])
    const { syncId } = await templateSyncRequestService.request({
      ...seed,
      actor,
      trigger: "manual",
    })
    const claimed = await templateSyncExecuteService.claim({
      syncId,
      workspaceId: seed.workspaceId,
    })
    if (!claimed) {
      throw new Error("the sync could not be claimed")
    }
    await templateSyncExecuteService.run({
      sync: claimed.sync,
      claimToken: claimed.claimToken,
    })

    const topicId = await topicIdOf(seed.workspaceId)
    expect(topicId).toBeDefined()
    expect(await botFieldValue(seed.workspaceId)).toBe(
      `Coupon {{coupon:${topicId}}}`,
    )
  })

  const topicDescription = async (workspaceId: string) => {
    const [topic] = await db.query.couponTopicModel.findMany({
      where: { workspaceId },
    })
    return topic?.description
  }
  const describedTopic = {
    ...couponTopicEntry,
    description: `Use ${token} today`,
  }

  test("install rewrites a bot field token in a coupon topic description", async () => {
    const { workspaceId } = await seedWorkspace([
      parse({
        couponTopics: [describedTopic],
        settings: { savedReplies: [], botFields: [botFieldEntry] },
      }),
    ])

    const copied = await copiedText(workspaceId)
    expect(copied.fieldId).toBeDefined()
    expect(await topicDescription(workspaceId)).toBe(
      `Use {{bot_field:${copied.fieldId}}} today`,
    )
  })

  test("a sync that adds a coupon topic and a bot field rewrites the token in the description", async () => {
    const seed = await seedWorkspace([
      parse({ settings: { savedReplies: [], botFields: [] } }),
      parse({
        couponTopics: [describedTopic],
        settings: { savedReplies: [], botFields: [botFieldEntry] },
      }),
    ])
    const { syncId } = await templateSyncRequestService.request({
      ...seed,
      actor,
      trigger: "manual",
    })
    const claimed = await templateSyncExecuteService.claim({
      syncId,
      workspaceId: seed.workspaceId,
    })
    if (!claimed) {
      throw new Error("the sync could not be claimed")
    }
    await templateSyncExecuteService.run({
      sync: claimed.sync,
      claimToken: claimed.claimToken,
    })

    const copied = await copiedText(seed.workspaceId)
    expect(copied.fieldId).toBeDefined()
    expect(await topicDescription(seed.workspaceId)).toBe(
      `Use {{bot_field:${copied.fieldId}}} today`,
    )
  })
})
