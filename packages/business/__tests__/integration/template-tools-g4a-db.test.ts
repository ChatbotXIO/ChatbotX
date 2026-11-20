// @vitest-environment node

/**
 * Instagram story automations (G4a) installed against a real Postgres: the copy
 * exists with the counter and the story ids left out, it is re-bound to an
 * account of its own connection type or installed off (never widened), a
 * View-only copy refuses content edits but keeps its switch, the service's own
 * `update` accepts the copy, and the uninstall removes it while keeping a flow
 * the installer's own automation still replies with.
 *
 * Commits for real (the install runs its own transaction), so each test
 * deletes its workspace — everything cascades from it — afterwards.
 * Needs the template migrations applied to the local database.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  inboxModel,
  integrationInstagramModel,
  templateModel,
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

// The request enqueues a job; the test drives the executor itself, and the
// post-commit effects need Redis and storage (an unregistered effect is skipped).
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueUninstallTemplate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService } = await import(
  "../../src/template/uninstall-execute.service"
)
const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { igStoryAutomationService } = await import(
  "../../src/ig-story-automation/service"
)

const databaseUrl = realDatabaseUrl()
const SOURCE_WORKSPACE_ID = "999000"
const SOURCE_INBOX_ID = "5001"

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

const storyEntry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "21",
  name: "Story replies",
  type: "instagram",
  trigger: "storyReply",
  isActive: true,
  startTime: null,
  endTime: null,
  story: { type: "all", value: [] },
  reply: { type: "text", value: "Thanks for replying!" },
  includeKeywords: { type: "all", value: [] },
  folderId: null,
  inboxSourceId: SOURCE_INBOX_ID,
  ...overrides,
})

const buildPayload = (stories: Record<string, unknown>[]) => {
  const parsed = parseTemplateExport({
    formatVersion: 3,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: SOURCE_WORKSPACE_ID, tenantId: "1" },
    manifests: {
      inboxes: {
        [SOURCE_INBOX_ID]: { channelType: "instagram", name: "Shop" },
      },
    },
    resources: {
      flows: [flowEntry("801", "Welcome")],
      storyAutomations: stories,
    },
  })
  if (!parsed.ok) {
    throw new Error(parsed.reason)
  }
  return parsed.data
}

describe.skipIf(!databaseUrl)(
  "template story automations (G4a) on a real database",
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

    const seedInstall = async (
      permissions = { allowEdit: true, allowDelete: true },
    ) => {
      const suffix = createId()
      const [owner] = await db
        .insert(userModel)
        .values({ email: `template-story-${suffix}@example.test` })
        .returning({ id: userModel.id })
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `template-story-${suffix}`, ownerId: owner.id })
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
          formatVersion: 3,
          shareToken: `tok-${suffix}`,
          defaultPermissions: permissions,
        })
        .returning({ id: templateModel.id })
      const installation = await templateInstallationRepository.create({
        workspaceId: workspace.id,
        templateId: template.id,
        sourceTemplateId: template.id,
        templateName: "Template",
        sourceWorkspaceId: SOURCE_WORKSPACE_ID,
        formatVersion: 3,
        status: "pending",
        permissions,
      })
      return { workspaceId: workspace.id, installationId: installation.id }
    }

    /** A connected Instagram account of the given connection type in the workspace. */
    const seedInstagramAccount = async (
      workspaceId: string,
      type: "instagram" | "facebook",
    ) => {
      const [inbox] = await db
        .insert(inboxModel)
        .values({
          id: createId(),
          workspaceId,
          name: "Shop",
          channel: "instagram",
          sourceId: `ig-${createId()}`,
        } as never)
        .returning({ id: inboxModel.id })
      await db.insert(integrationInstagramModel).values({
        id: createId(),
        workspaceId,
        inboxId: inbox.id,
        auth: {},
        igId: `ig-${createId()}`,
        pageId: `page-${createId()}`,
        name: "Shop",
        username: "shop",
        conversationStarters: [],
        persistentMenus: [],
        type,
      } as never)
      return inbox.id
    }

    const runInstall = async (
      seed: { workspaceId: string; installationId: string },
      stories: Record<string, unknown>[],
      options: {
        permissions?: { allowEdit: boolean; allowDelete: boolean }
        inboxBindings?: Record<string, string>
      } = {},
    ) => {
      const permissions = options.permissions ?? {
        allowEdit: true,
        allowDelete: true,
      }
      const claim = await templateInstallService.claim(seed)
      if (!claim) {
        throw new Error("the install could not be claimed")
      }
      await templateInstallService.run({
        installationId: seed.installationId,
        workspaceId: seed.workspaceId,
        claimToken: claim.claimToken,
        permissions,
        payload: buildPayload(stories),
        templateName: "Template",
        createInstallFolder: false,
        sourceVersion: 1,
        inboxBindings: options.inboxBindings,
      })
    }

    const stored = (workspaceId: string) =>
      db.query.igStoryAutomationModel.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      })

    const warningsOf = async (seed: {
      workspaceId: string
      installationId: string
    }) =>
      (
        await templateInstallationRepository.findByIdAndWorkspace({
          id: seed.installationId,
          workspaceId: seed.workspaceId,
        })
      )?.warnings.map((warning) => warning.entityKind) ?? []

    test("with no account bound the copy is off and unscoped by id, its stories are cleared and its flow re-pointed", async () => {
      const seed = await seedInstall()
      await runInstall(seed, [
        storyEntry({
          story: { type: "storyIds", value: [] },
          reply: { type: "flow", value: "801" },
          includeKeywords: { type: "contain", value: ["hi"] },
        }),
      ])

      const [story] = await stored(seed.workspaceId)
      const [flow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(story).toMatchObject({
        name: "Story replies",
        type: "instagram",
        trigger: "storyReply",
        isActive: false,
        inboxId: null,
        repliesCount: 0,
        story: { type: "storyIds", value: [] },
        reply: { type: "flow", value: flow.id },
        includeKeywords: { type: "contain", value: ["hi"] },
      })
      expect(await warningsOf(seed)).toEqual(
        expect.arrayContaining([
          "inboxBindingRequired",
          "storySelectionRequired",
        ]),
      )
    })

    test("a bound account of the right type keeps an every-story automation on; the wrong type or unscoped installs off", async () => {
      const seed = await seedInstall()
      const account = await seedInstagramAccount(seed.workspaceId, "instagram")

      await runInstall(
        seed,
        [
          storyEntry({ sourceId: "21", name: "Bound" }),
          storyEntry({
            sourceId: "22",
            name: "Wrong type",
            type: "instagramFacebook",
          }),
          storyEntry({
            sourceId: "23",
            name: "Everyone",
            inboxSourceId: null,
          }),
          storyEntry({
            sourceId: "24",
            name: "Mention",
            trigger: "storyMention",
          }),
        ],
        { inboxBindings: { [SOURCE_INBOX_ID]: account } },
      )

      const byName = Object.fromEntries(
        (await stored(seed.workspaceId)).map((row) => [row.name, row]),
      )
      expect(byName.Bound).toMatchObject({ inboxId: account, isActive: true })
      expect(byName["Wrong type"]).toMatchObject({
        inboxId: null,
        isActive: false,
      })
      expect(byName.Everyone).toMatchObject({ inboxId: null, isActive: false })
      expect(byName.Mention).toMatchObject({
        trigger: "storyMention",
        inboxId: account,
        isActive: true,
        story: { type: "all", value: [] },
      })
    })

    test("the service's own update accepts the copy, and once the missing parts are filled in it can be switched on", async () => {
      const seed = await seedInstall()
      const account = await seedInstagramAccount(seed.workspaceId, "instagram")
      await runInstall(seed, [
        storyEntry({ story: { type: "storyIds", value: [] } }),
      ])
      const [story] = await stored(seed.workspaceId)

      // Unchanged data (a form that re-sends the whole row) still saves.
      await expect(
        igStoryAutomationService.update(
          { workspaceId: seed.workspaceId, id: story.id },
          {
            name: story.name,
            story: story.story,
            reply: story.reply,
            includeKeywords: story.includeKeywords,
            inboxId: story.inboxId,
          },
        ),
      ).resolves.toMatchObject({ id: story.id })

      await expect(
        igStoryAutomationService.update(
          { workspaceId: seed.workspaceId, id: story.id },
          {
            inboxId: account,
            story: { type: "storyIds", value: ["17890000000000001"] },
            isActive: true,
          },
        ),
      ).resolves.toMatchObject({ inboxId: account, isActive: true })
    })

    test("a View-only copy refuses a content edit and a delete, but its switch and account stay the installer's", async () => {
      const view = { allowEdit: false, allowDelete: false }
      const seed = await seedInstall(view)
      const account = await seedInstagramAccount(seed.workspaceId, "instagram")
      await runInstall(seed, [storyEntry()], { permissions: view })
      const [story] = await stored(seed.workspaceId)
      const ctx = { workspaceId: seed.workspaceId, id: story.id }

      await expect(
        igStoryAutomationService.update(ctx, { name: "renamed" }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        igStoryAutomationService.update(ctx, {
          reply: { type: "text", value: "changed" },
        }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        igStoryAutomationService.delete({
          workspaceId: seed.workspaceId,
          id: story.id,
        }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        igStoryAutomationService.update(ctx, {
          isActive: true,
          inboxId: account,
          story: { type: "storyIds", value: ["1"] },
        }),
      ).resolves.toMatchObject({ isActive: true, inboxId: account })
      // The refused edits left nothing behind.
      const [after] = await stored(seed.workspaceId)
      expect(after).toMatchObject({
        name: "Story replies",
        reply: { type: "text", value: "Thanks for replying!" },
      })
    })

    test("an uninstall removes the copy and keeps a flow the installer's own automation still replies with", async () => {
      const seed = await seedInstall()
      await runInstall(seed, [storyEntry()])
      const [flow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const own = await igStoryAutomationService.create({
        workspaceId: seed.workspaceId,
        type: "instagram",
        data: {
          name: "Mine",
          inboxId: null,
          isActive: false,
          story: { type: "all", value: [] },
          reply: { type: "flow", value: flow.id },
          includeKeywords: { type: "all", value: [] },
        },
      })

      await templateUninstallService.uninstallAsInstaller({
        workspaceId: seed.workspaceId,
        installationId: seed.installationId,
        actor: { kind: "apiToken", permission: "full" },
      })
      const claim = await templateUninstallExecuteService.claim(seed)
      if (!claim) {
        throw new Error("the uninstall could not be claimed")
      }
      await templateUninstallExecuteService.run({
        ...claim,
        workspaceId: seed.workspaceId,
      })

      expect((await stored(seed.workspaceId)).map((row) => row.id)).toEqual([
        own.id,
      ])
      const flowRow = await db.query.templateInstalledResourceModel.findFirst({
        where: { installationId: seed.installationId, resourceKind: "flow" },
      })
      expect(flowRow?.uninstallOutcome).toBe("keptHasDependents")
    })
  },
)
