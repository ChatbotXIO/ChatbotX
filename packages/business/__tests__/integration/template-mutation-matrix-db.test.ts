// @vitest-environment node

/**
 * The P2 mutation matrix against a real Postgres: for each guarded service
 * method, a copy installed View only (`allowEdit = false`) refuses a content
 * edit with `templateAllowEditViolation` and nothing of the write sticks, and
 * (where the matrix lists one) an installer-owned change on the same copy
 * still saves. Each method is the real one, so the guard that sits at the top
 * of it is exercised for real: a mock-style test only proves it was called.
 *
 * Commits for real, so each test deletes its workspace (everything cascades
 * from it) afterwards. Needs the template migrations applied locally.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  aiFunctionModel,
  automatedResponseModel,
  botFieldModel,
  commentAutomationModel,
  customFieldModel,
  flowModel,
  flowVersionModel,
  folderModel,
  inboxModel,
  integrationWebchatModel,
  mediaLibraryFileModel,
  pipelineFieldModel,
  reflinkModel,
  sequenceModel,
  sequenceStepModel,
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

const { flowVersionService } = await import("../../src/flow-version/service")
const { aiFunctionService } = await import("../../src/ai-function/service")
const { integrationWebchatService } = await import(
  "../../src/integration-webchat/service"
)
const { automatedResponseService } = await import(
  "../../src/automated-response/service"
)
const { reflinkService } = await import("../../src/reflink/service")
const { qrCodeService } = await import("../../src/qr-code/qr-code.service")
const { triggerService } = await import("../../src/trigger/service")
const { botFieldService } = await import("../../src/bot-field/service")
const { customFieldService } = await import("../../src/custom-field/service")
const { folderService } = await import("../../src/folder/service")
const { commentAutomationService } = await import(
  "../../src/comment-automation/service"
)
const { sequenceService } = await import("../../src/sequence/service")
const { pipelineService } = await import("../../src/pipeline/service")
const { pipelineStructureService } = await import(
  "../../src/pipeline/pipeline-structure.service"
)
const { pipelineStageBulkService } = await import(
  "../../src/pipeline/stage-bulk.service"
)

const databaseUrl = realDatabaseUrl()
const VIEW_ONLY = { allowEdit: false, allowDelete: true }
const REFUSED = { code: "templateAllowEditViolation" }

describe.skipIf(!databaseUrl)("mutation matrix: a View-only copy", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  type Category = typeof templateInstalledResourceModel.$inferInsert.category
  type Kind = typeof templateInstalledResourceModel.$inferInsert.resourceKind

  /** A workspace whose one completed installation is View only. */
  const seedWorkspace = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-matrix-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-matrix-${suffix}`, ownerId: owner.id })
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
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: VIEW_ONLY,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: workspace.id,
      formatVersion: 1,
      status: "completed",
      permissions: VIEW_ONLY,
      sourceVersion: 1,
    })
    return {
      workspaceId: workspace.id,
      installationId: installation.id,
      suffix,
    }
  }

  type Seed = Awaited<ReturnType<typeof seedWorkspace>>

  const lock = async (
    seed: Seed,
    input: { category: Category; kind: Kind; resourceId: string },
  ) => {
    await db.insert(templateInstalledResourceModel).values({
      installationId: seed.installationId,
      workspaceId: seed.workspaceId,
      category: input.category,
      resourceKind: input.kind,
      resourceId: input.resourceId,
      sourceResourceId: `src-${createId()}`,
      ...VIEW_ONLY,
    })
  }

  describe("flow versions (flow row of the matrix)", () => {
    const seedLockedFlow = async () => {
      const seed = await seedWorkspace()
      const [flow] = await db
        .insert(flowModel)
        .values({ workspaceId: seed.workspaceId, name: "Flow" })
        .returning({ id: flowModel.id })
      const [draft] = await db
        .insert(flowVersionModel)
        .values({
          workspaceId: seed.workspaceId,
          flowId: flow.id,
          nodes: [],
          edges: [],
          isDraft: true,
          startNodeId: "1",
        })
        .returning()
      const [published] = await db
        .insert(flowVersionModel)
        .values({
          workspaceId: seed.workspaceId,
          flowId: flow.id,
          nodes: [],
          edges: [],
          isDraft: false,
          isLatest: true,
          startNodeId: "1",
        })
        .returning()
      await db
        .update(flowModel)
        .set({ currentVersionId: published.id })
        .where(eq(flowModel.id, flow.id))
      await lock(seed, {
        category: "flows",
        kind: "flow",
        resourceId: flow.id,
      })
      return { seed, flow, draft, published }
    }

    const draftCount = async (flowId: string) =>
      await db.$count(flowVersionModel, eq(flowVersionModel.flowId, flowId))

    test("updateDraft is refused", async () => {
      const { seed, draft } = await seedLockedFlow()

      await expect(
        flowVersionService.updateDraft({
          workspaceId: seed.workspaceId,
          id: draft.id,
          nodes: [],
          edges: [],
        }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("updateDraftByFlowId (autosave) is refused", async () => {
      const { seed, flow } = await seedLockedFlow()

      await expect(
        flowVersionService.updateDraftByFlowId({
          workspaceId: seed.workspaceId,
          flowId: flow.id,
          nodes: [],
          edges: [],
        }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("publish is refused and publishes nothing", async () => {
      const { seed, flow } = await seedLockedFlow()
      const before = await draftCount(flow.id)

      await expect(
        flowVersionService.publish({
          workspaceId: seed.workspaceId,
          flowId: flow.id,
          nodes: [],
          edges: [],
        }),
      ).rejects.toMatchObject(REFUSED)

      expect(await draftCount(flow.id)).toBe(before)
    })

    test("revertDraftToPublished is refused", async () => {
      const { seed, flow } = await seedLockedFlow()

      await expect(
        flowVersionService.revertDraftToPublished({
          workspaceId: seed.workspaceId,
          flowId: flow.id,
        }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("restore of an older version (workspace taken from the version) is refused", async () => {
      const { published } = await seedLockedFlow()

      await expect(
        flowVersionService.restore({ version: published }),
      ).rejects.toMatchObject(REFUSED)
    })
  })

  test("aiFunction.update refuses a rename", async () => {
    const seed = await seedWorkspace()
    const [fn] = await db
      .insert(aiFunctionModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Lookup",
        purpose: "Looks things up",
        dataCollect: [],
      } as never)
      .returning()
    await lock(seed, {
      category: "aiFunctions",
      kind: "aiFunction",
      resourceId: fn.id,
    })

    await expect(
      aiFunctionService.update({ workspaceId: seed.workspaceId, id: fn.id }, {
        name: "Renamed",
        purpose: fn.purpose,
        dataCollect: fn.dataCollect,
        outputMessage: fn.outputMessage,
      } as never),
    ).rejects.toMatchObject(REFUSED)

    const stored = await db.query.aiFunctionModel.findFirst({
      where: { id: fn.id },
      columns: { name: true },
    })
    expect(stored?.name).toBe("Lookup")
  })

  describe("integrationWebchat.update", () => {
    const seedLockedWebchat = async () => {
      const seed = await seedWorkspace()
      const [inbox] = await db
        .insert(inboxModel)
        .values({
          workspaceId: seed.workspaceId,
          name: "Chat",
          channel: "webchat",
          sourceId: `webchat-${createId()}`,
        } as never)
        .returning({ id: inboxModel.id })
      const [webchat] = await db
        .insert(integrationWebchatModel)
        .values({
          workspaceId: seed.workspaceId,
          name: "Chat",
          auth: {},
          inboxId: inbox.id,
          authorizedDomains: [],
          conversationStarters: [],
          persistentMenus: [],
          brandColor: "#000000",
        } as never)
        .returning()
      await lock(seed, {
        category: "webchats",
        kind: "integrationWebchat",
        resourceId: webchat.id,
      })
      return { seed, webchat }
    }

    test("refuses a content edit", async () => {
      const { seed, webchat } = await seedLockedWebchat()

      await expect(
        integrationWebchatService.update({
          workspaceId: seed.workspaceId,
          id: webchat.id,
          data: { name: "Renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("saves an installer-owned change (authorized domains)", async () => {
      const { seed, webchat } = await seedLockedWebchat()

      await integrationWebchatService.update({
        workspaceId: seed.workspaceId,
        id: webchat.id,
        data: { authorizedDomains: ["shop.example.test"] },
      })

      const stored = await db.query.integrationWebchatModel.findFirst({
        where: { id: webchat.id },
        columns: { authorizedDomains: true },
      })
      expect(stored?.authorizedDomains).toEqual(["shop.example.test"])
    })
  })

  describe("automatedResponse.update", () => {
    const seedLockedKeyword = async () => {
      const seed = await seedWorkspace()
      const [keyword] = await db
        .insert(automatedResponseModel)
        .values({
          workspaceId: seed.workspaceId,
          keywords: [{ value: "hi" }],
          status: true,
          text: "hello",
          type: "inbound",
        } as never)
        .returning()
      await lock(seed, {
        category: "keywords",
        kind: "automatedResponse",
        resourceId: keyword.id,
      })
      return {
        seed,
        ctx: {
          workspaceId: seed.workspaceId,
          id: keyword.id,
          type: "inbound" as const,
        },
      }
    }

    test("refuses a change of text", async () => {
      const { ctx } = await seedLockedKeyword()

      await expect(
        automatedResponseService.update(ctx, { text: "changed" }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("saves a folder move", async () => {
      const { ctx } = await seedLockedKeyword()

      await expect(
        automatedResponseService.update(ctx, { folderId: null }),
      ).resolves.toBeDefined()
    })
  })

  describe("reflink and QR code", () => {
    const seedLockedLink = async (type: "refLink" | "qrCode") => {
      const seed = await seedWorkspace()
      const [flow] = await db
        .insert(flowModel)
        .values({ workspaceId: seed.workspaceId, name: "Target flow" })
        .returning({ id: flowModel.id })
      const [link] = await db
        .insert(reflinkModel)
        .values({
          workspaceId: seed.workspaceId,
          name: type === "qrCode" ? "qr_code" : "link",
          type,
          flowId: flow.id,
        } as never)
        .returning()
      await lock(seed, {
        category: "entryPointLinks",
        kind: "reflink",
        resourceId: link.id,
      })
      return { seed, link }
    }

    test("reflinkService.update refuses a rename", async () => {
      const { seed, link } = await seedLockedLink("refLink")

      await expect(
        reflinkService.update(
          { workspaceId: seed.workspaceId, id: link.id },
          { name: "renamed" },
        ),
      ).rejects.toMatchObject(REFUSED)
    })

    test("qrCodeService.update refuses a rename", async () => {
      const { seed, link } = await seedLockedLink("qrCode")

      await expect(
        qrCodeService.update({
          workspaceId: seed.workspaceId,
          id: link.id,
          data: { name: "renamed" } as never,
          duplicateNameMessage: "taken",
        }),
      ).rejects.toMatchObject(REFUSED)
    })
  })

  test("triggerService.updateWithConditions refuses new actions and conditions", async () => {
    const seed = await seedWorkspace()
    const [trigger] = await db
      .insert(triggerModel)
      .values({ workspaceId: seed.workspaceId, name: "Trigger", actions: [] })
      .returning()
    await lock(seed, {
      category: "triggers",
      kind: "trigger",
      resourceId: trigger.id,
    })

    await expect(
      triggerService.updateWithConditions({
        workspaceId: seed.workspaceId,
        id: trigger.id,
        actions: [],
        conditions: [],
      }),
    ).rejects.toMatchObject(REFUSED)
  })

  describe("botField.updateByKey", () => {
    const seedLockedBotField = async () => {
      const seed = await seedWorkspace()
      const [field] = await db
        .insert(botFieldModel)
        .values({
          workspaceId: seed.workspaceId,
          name: "greeting",
          type: "shortText",
          value: "hello",
        } as never)
        .returning()
      await lock(seed, {
        category: "settings",
        kind: "botField",
        resourceId: field.id,
      })
      return { seed, field }
    }

    test("refuses a rename", async () => {
      const { seed, field } = await seedLockedBotField()

      await expect(
        botFieldService.updateByKey({
          workspaceId: seed.workspaceId,
          key: field.id,
          data: { name: "renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("saves a runtime value write", async () => {
      const { seed, field } = await seedLockedBotField()

      await botFieldService.updateByKey({
        workspaceId: seed.workspaceId,
        key: field.id,
        data: { value: "bye" },
      })

      const stored = await db.query.botFieldModel.findFirst({
        where: { id: field.id },
        columns: { value: true },
      })
      expect(stored?.value).toBe("bye")
    })
  })

  describe("customField.update", () => {
    const seedLockedCustomField = async () => {
      const seed = await seedWorkspace()
      const [field] = await db
        .insert(customFieldModel)
        .values({
          workspaceId: seed.workspaceId,
          name: "nickname",
          type: "shortText",
          showInInbox: true,
        } as never)
        .returning()
      await lock(seed, {
        category: "customFields",
        kind: "customField",
        resourceId: field.id,
      })
      return { seed, field }
    }

    test("refuses a rename", async () => {
      const { seed, field } = await seedLockedCustomField()

      await expect(
        customFieldService.update(
          { workspaceId: seed.workspaceId, id: field.id },
          { name: "renamed" } as never,
        ),
      ).rejects.toMatchObject(REFUSED)
    })

    test("saves an installer-owned change (show in inbox)", async () => {
      const { seed, field } = await seedLockedCustomField()

      await customFieldService.update(
        { workspaceId: seed.workspaceId, id: field.id },
        { showInInbox: false } as never,
      )

      const stored = await db.query.customFieldModel.findFirst({
        where: { id: field.id },
        columns: { showInInbox: true },
      })
      expect(stored?.showInInbox).toBe(false)
    })
  })

  test("folderService.update refuses a rename", async () => {
    const seed = await seedWorkspace()
    const [folder] = await db
      .insert(folderModel)
      .values({
        workspaceId: seed.workspaceId,
        name: "Folder",
        folderType: "flow",
        paths: [],
      } as never)
      .returning()
    await lock(seed, {
      category: "flows",
      kind: "folder",
      resourceId: folder.id,
    })

    await expect(
      folderService.update({
        workspaceId: seed.workspaceId,
        id: folder.id,
        data: { name: "Renamed" },
      }),
    ).rejects.toMatchObject(REFUSED)

    const stored = await db.query.folderModel.findFirst({
      where: { id: folder.id },
      columns: { name: true },
    })
    expect(stored?.name).toBe("Folder")
  })
  describe("sequence steps", () => {
    const seedLockedSequence = async () => {
      const seed = await seedWorkspace()
      const [sequence] = await db
        .insert(sequenceModel)
        .values({ workspaceId: seed.workspaceId, name: "Drip" })
        .returning({ id: sequenceModel.id })
      const [step] = await db
        .insert(sequenceStepModel)
        .values({
          sequenceId: sequence.id,
          order: 0,
          delayDays: 1,
        } as never)
        .returning({ id: sequenceStepModel.id })
      await lock(seed, {
        category: "sequences",
        kind: "sequence",
        resourceId: sequence.id,
      })
      return { seed, sequence, step }
    }

    const stepCount = async (sequenceId: string) =>
      await db.$count(
        sequenceStepModel,
        eq(sequenceStepModel.sequenceId, sequenceId),
      )

    test("createStep is refused and inserts nothing", async () => {
      const { seed, sequence } = await seedLockedSequence()

      await expect(
        sequenceService.createStep({
          workspaceId: seed.workspaceId,
          sequenceId: sequence.id,
          data: { order: 1, delayDays: 2 },
        }),
      ).rejects.toMatchObject(REFUSED)

      expect(await stepCount(sequence.id)).toBe(1)
    })

    test("updateStep is refused and keeps the stored delay", async () => {
      const { seed, sequence, step } = await seedLockedSequence()

      await expect(
        sequenceService.updateStep({
          workspaceId: seed.workspaceId,
          sequenceId: sequence.id,
          stepId: step.id,
          data: { order: 0, delayDays: 9 },
        }),
      ).rejects.toMatchObject(REFUSED)

      const stored = await db.query.sequenceStepModel.findFirst({
        where: { id: step.id },
        columns: { delayDays: true },
      })
      expect(stored?.delayDays).toBe(1)
    })

    test("deleteStep is refused and deletes nothing", async () => {
      const { seed, sequence, step } = await seedLockedSequence()

      await expect(
        sequenceService.deleteStep({
          workspaceId: seed.workspaceId,
          sequenceId: sequence.id,
          stepId: step.id,
        }),
      ).rejects.toMatchObject(REFUSED)

      expect(await stepCount(sequence.id)).toBe(1)
    })
  })

  describe("pipelineService.update", () => {
    const SCOPE = { kind: "system" } as const

    const seedLockedPipeline = async () => {
      const seed = await seedWorkspace()
      const pipeline = await pipelineService.create({
        workspaceId: seed.workspaceId,
        type: "custom",
        name: "Deals",
        scope: SCOPE,
        actor: { userId: null } as never,
      })
      await lock(seed, {
        category: "pipelines",
        kind: "pipeline",
        resourceId: pipeline.id,
      })
      return { seed, pipeline }
    }

    test("refuses a rename", async () => {
      const { seed, pipeline } = await seedLockedPipeline()

      await expect(
        pipelineService.update({
          workspaceId: seed.workspaceId,
          id: pipeline.id,
          scope: SCOPE,
          values: { name: "Renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)
    })

    test("saves an installer-owned change (currency)", async () => {
      const { seed, pipeline } = await seedLockedPipeline()

      await pipelineService.update({
        workspaceId: seed.workspaceId,
        id: pipeline.id,
        scope: SCOPE,
        values: { currency: "EUR" },
      })

      const stored = await db.query.pipelineModel.findFirst({
        where: { id: pipeline.id },
        columns: { currency: true },
      })
      expect(stored?.currency).toBe("EUR")
    })
  })
  describe("fbCommentAutomation, every channel", () => {
    const seedLockedAutomation = async (
      type: "messenger" | "instagram" | "threads" | "tiktok",
    ) => {
      const seed = await seedWorkspace()
      const [automation] = await db
        .insert(commentAutomationModel)
        .values({ workspaceId: seed.workspaceId, name: "Auto", type } as never)
        .returning({ id: commentAutomationModel.id })
      await lock(seed, {
        category: "fbCommentAutomations",
        kind: "fbCommentAutomation",
        resourceId: automation.id,
      })
      return { ctx: { workspaceId: seed.workspaceId, id: automation.id } }
    }

    const nameOf = async (id: string) =>
      (
        await db.query.commentAutomationModel.findFirst({
          where: { id },
          columns: { name: true },
        })
      )?.name

    test("updateMessenger refuses a rename", async () => {
      const { ctx } = await seedLockedAutomation("messenger")

      await expect(
        commentAutomationService.updateMessenger(ctx, { name: "renamed" }),
      ).rejects.toMatchObject(REFUSED)
      expect(await nameOf(ctx.id)).toBe("Auto")
    })

    test("updateInstagram refuses a rename", async () => {
      const { ctx } = await seedLockedAutomation("instagram")

      await expect(
        commentAutomationService.updateInstagram(ctx, { name: "renamed" }),
      ).rejects.toMatchObject(REFUSED)
      expect(await nameOf(ctx.id)).toBe("Auto")
    })

    test("updateThreadsAutomation refuses a rename", async () => {
      const { ctx } = await seedLockedAutomation("threads")

      await expect(
        commentAutomationService.updateThreadsAutomation({
          ...ctx,
          data: { name: "renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)
      expect(await nameOf(ctx.id)).toBe("Auto")
    })

    test("updateTiktokAutomation refuses a rename", async () => {
      const { ctx } = await seedLockedAutomation("tiktok")

      await expect(
        commentAutomationService.updateTiktokAutomation({
          ...ctx,
          data: { name: "renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)
      expect(await nameOf(ctx.id)).toBe("Auto")
    })

    test("updateThreadsAutomation saves an installer-owned toggle (isActive)", async () => {
      const { ctx } = await seedLockedAutomation("threads")

      await commentAutomationService.updateThreadsAutomation({
        ...ctx,
        data: { isActive: false },
      })

      const stored = await db.query.commentAutomationModel.findFirst({
        where: { id: ctx.id },
        columns: { isActive: true },
      })
      expect(stored?.isActive).toBe(false)
    })
  })
  describe("reflinkService.updateWidgetSettings", () => {
    const settings = {
      authorizedDomains: [] as string[],
      hiddenInboxIds: [] as string[],
      logoFileId: "",
      brandName: "",
      brandUrl: "",
      logoBackgroundColor: "#112233",
    }

    const seedLockedWidgetLink = async () => {
      const seed = await seedWorkspace()
      const [flow] = await db
        .insert(flowModel)
        .values({ workspaceId: seed.workspaceId, name: "Target flow" })
        .returning({ id: flowModel.id })
      const [link] = await db
        .insert(reflinkModel)
        .values({
          workspaceId: seed.workspaceId,
          name: "widget",
          type: "refLink",
          flowId: flow.id,
        } as never)
        .returning()
      const [logo] = await db
        .insert(mediaLibraryFileModel)
        .values({
          workspaceId: seed.workspaceId,
          name: "logo.png",
          path: `logo-${createId()}.png`,
          mimeType: "image/png",
          size: 1,
        })
        .returning({ id: mediaLibraryFileModel.id })
      await lock(seed, {
        category: "entryPointLinks",
        kind: "reflink",
        resourceId: link.id,
      })
      return { ctx: { workspaceId: seed.workspaceId, id: link.id }, logo }
    }

    test("the widget's logo and brand are the installer's: they save on a View-only copy", async () => {
      const { ctx, logo } = await seedLockedWidgetLink()

      await reflinkService.updateWidgetSettings(ctx, {
        ...settings,
        logoFileId: logo.id,
        brandName: "Shop",
        brandUrl: "https://shop.example.test",
      })

      const stored = await db.query.reflinkModel.findFirst({
        where: { id: ctx.id },
        columns: {
          widgetLogoFileId: true,
          widgetBrandName: true,
          widgetBrandUrl: true,
        },
      })
      expect(stored).toMatchObject({
        widgetLogoFileId: logo.id,
        widgetBrandName: "Shop",
        widgetBrandUrl: "https://shop.example.test",
      })
    })

    test("installer-owned widget settings (authorized domains) save", async () => {
      const { ctx } = await seedLockedWidgetLink()

      await reflinkService.updateWidgetSettings(ctx, {
        ...settings,
        authorizedDomains: ["Shop.Example.test"],
      })

      const stored = await db.query.reflinkModel.findFirst({
        where: { id: ctx.id },
        columns: { widgetAuthorizedDomains: true },
      })
      expect(stored?.widgetAuthorizedDomains).toEqual(["shop.example.test"])
    })
  })

  describe("pipeline structural actions", () => {
    const SCOPE = { kind: "system" } as const

    /** A pipeline with one extra stage and one field, locked after they exist. */
    const seedLockedStructure = async () => {
      const seed = await seedWorkspace()
      const pipeline = await pipelineService.create({
        workspaceId: seed.workspaceId,
        type: "custom",
        name: "Board",
        scope: SCOPE,
        actor: { userId: null } as never,
      })
      const base = { workspaceId: seed.workspaceId, pipelineId: pipeline.id }
      const stage = await pipelineStructureService.createStage({
        ...base,
        scope: SCOPE,
        name: "Extra",
      })
      const field = await pipelineStructureService.createField({
        ...base,
        scope: SCOPE,
        values: {
          name: "Source",
          referenceName: "source",
          type: "shortText",
          required: false,
        } as never,
      })
      await lock(seed, {
        category: "pipelines",
        kind: "pipeline",
        resourceId: pipeline.id,
      })
      return { seed, pipeline, base, stage, field }
    }

    const stages = async (pipelineId: string) =>
      await db.query.pipelineStageModel.findMany({
        where: { pipelineId },
        orderBy: { position: "asc" },
      })
    const fieldCount = async (pipelineId: string) =>
      await db.$count(
        pipelineFieldModel,
        eq(pipelineFieldModel.pipelineId, pipelineId),
      )

    test("createStage is refused and adds nothing", async () => {
      const { base, pipeline } = await seedLockedStructure()
      const before = (await stages(pipeline.id)).length

      await expect(
        pipelineStructureService.createStage({
          ...base,
          scope: SCOPE,
          name: "New",
        }),
      ).rejects.toMatchObject(REFUSED)

      expect((await stages(pipeline.id)).length).toBe(before)
    })

    test("updateStage is refused and keeps the name", async () => {
      const { base, stage } = await seedLockedStructure()

      await expect(
        pipelineStructureService.updateStage({
          ...base,
          scope: SCOPE,
          stageId: stage.id,
          values: { name: "Renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)

      const stored = await db.query.pipelineStageModel.findFirst({
        where: { id: stage.id },
        columns: { name: true },
      })
      expect(stored?.name).toBe("Extra")
    })

    test("reorderStages is refused and keeps the order", async () => {
      const { base, pipeline } = await seedLockedStructure()
      const before = (await stages(pipeline.id)).map((row) => row.id)

      await expect(
        pipelineStructureService.reorderStages({
          ...base,
          scope: SCOPE,
          stageIds: [...before].reverse(),
        }),
      ).rejects.toMatchObject(REFUSED)

      expect((await stages(pipeline.id)).map((row) => row.id)).toEqual(before)
    })

    test("deleteStage (request side) is refused and deletes nothing", async () => {
      const { seed, pipeline, stage } = await seedLockedStructure()
      const before = (await stages(pipeline.id)).length

      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: seed.workspaceId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          scope: SCOPE,
          actor: { userId: null } as never,
        }),
      ).rejects.toMatchObject(REFUSED)

      expect((await stages(pipeline.id)).length).toBe(before)
    })

    test("createField is refused and adds nothing", async () => {
      const { base, pipeline } = await seedLockedStructure()
      const before = await fieldCount(pipeline.id)

      await expect(
        pipelineStructureService.createField({
          ...base,
          scope: SCOPE,
          values: {
            name: "Other",
            referenceName: "other",
            type: "shortText",
            required: false,
          } as never,
        }),
      ).rejects.toMatchObject(REFUSED)

      expect(await fieldCount(pipeline.id)).toBe(before)
    })

    test("updateField is refused and keeps the name", async () => {
      const { base, field } = await seedLockedStructure()

      await expect(
        pipelineStructureService.updateField({
          ...base,
          scope: SCOPE,
          fieldId: field.id,
          values: { name: "Renamed" },
        }),
      ).rejects.toMatchObject(REFUSED)

      const stored = await db.query.pipelineFieldModel.findFirst({
        where: { id: field.id },
        columns: { name: true },
      })
      expect(stored?.name).toBe("Source")
    })

    test("deleteField is refused and deletes nothing", async () => {
      const { base, pipeline, field } = await seedLockedStructure()
      const before = await fieldCount(pipeline.id)

      await expect(
        pipelineStructureService.deleteField({
          ...base,
          scope: SCOPE,
          fieldId: field.id,
        }),
      ).rejects.toMatchObject(REFUSED)

      expect(await fieldCount(pipeline.id)).toBe(before)
    })
  })
})
