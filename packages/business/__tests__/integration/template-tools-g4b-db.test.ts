// @vitest-environment node

/**
 * Inbound webhooks (G4b) installed against a real Postgres: the copy is off
 * with its own token and no counters, its inbox rule is re-bound or left empty
 * (never the source's inbox), custom-field mappings and actions point at the
 * installer's rows, a View-only copy refuses shipped-content edits but keeps
 * its switch, token and inbox rule, the service's own `update` accepts the copy,
 * the 100-webhook cap holds across concurrent installs, and the uninstall
 * removes the copy with its deliveries while keeping a flow the installer's own
 * webhook still starts.
 *
 * Commits for real (the install runs its own transaction), so each test
 * deletes its workspace — everything cascades from it — afterwards.
 * Needs the template migrations applied to the local database.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  inboundWebhookModel,
  inboundWebhookRequestModel,
  inboxModel,
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
const { inboundWebhookService } = await import(
  "../../src/inbound-webhook/service"
)

const databaseUrl = realDatabaseUrl()
const SOURCE_WORKSPACE_ID = "999000"
const SOURCE_INBOX_ID = "5001"
const SOURCE_FIELD_ID = "7001"
const SOURCE_TAG_ID = "7101"
const WEBHOOK_TOKEN = /^iwh_/

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

const webhookEntry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "31",
  name: "Orders",
  identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
  fieldMappings: [
    { jsonPath: "$.name", target: "full_name" },
    { jsonPath: "$.plan", target: SOURCE_FIELD_ID },
  ],
  actions: [
    { type: "addTag", tagIds: [SOURCE_TAG_ID] },
    { type: "startAnotherFlow", flowId: "801" },
  ],
  inboxResolution: { mode: "inbox", inboxId: SOURCE_INBOX_ID },
  ...overrides,
})

const buildPayload = (webhooks: Record<string, unknown>[]) => {
  const parsed = parseTemplateExport({
    formatVersion: 3,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: SOURCE_WORKSPACE_ID, tenantId: "1" },
    manifests: {
      inboxes: {
        [SOURCE_INBOX_ID]: { channelType: "whatsapp", name: "Shop" },
      },
      customFields: {
        [SOURCE_FIELD_ID]: { name: "Plan", type: "shortText" },
      },
      tags: { [SOURCE_TAG_ID]: { name: "Orders" } },
    },
    resources: {
      flows: [flowEntry("801", "Welcome")],
      inboundWebhooks: webhooks,
    },
  })
  if (!parsed.ok) {
    throw new Error(parsed.reason)
  }
  return parsed.data
}

type Seed = { workspaceId: string; installationId: string }

describe.skipIf(!databaseUrl)(
  "template inbound webhooks (G4b) on a real database",
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

    const seedTemplateInstallation = async (
      workspaceId: string,
      suffix: string,
      permissions: { allowEdit: boolean; allowDelete: boolean },
    ): Promise<Seed> => {
      const [template] = await db
        .insert(templateModel)
        .values({
          workspaceId,
          tenantId: "1",
          name: `Template ${suffix}`,
          selection: { mode: "all" } as never,
          payload: {},
          categoryCounts: {},
          formatVersion: 3,
          shareToken: `tok-${suffix}`,
          defaultPermissions: permissions,
        })
        .returning({ id: templateModel.id })
      const installation = await templateInstallationRepository.create({
        workspaceId,
        templateId: template.id,
        sourceTemplateId: template.id,
        templateName: "Template",
        sourceWorkspaceId: SOURCE_WORKSPACE_ID,
        formatVersion: 3,
        status: "pending",
        permissions,
      })
      return { workspaceId, installationId: installation.id }
    }

    const seedInstall = async (
      permissions = { allowEdit: true, allowDelete: true },
    ): Promise<Seed> => {
      const suffix = createId()
      const [owner] = await db
        .insert(userModel)
        .values({ email: `template-webhook-${suffix}@example.test` })
        .returning({ id: userModel.id })
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `template-webhook-${suffix}`, ownerId: owner.id })
        .returning({ id: workspaceModel.id })
      created.push({ workspaceId: workspace.id, userId: owner.id })
      return await seedTemplateInstallation(workspace.id, suffix, permissions)
    }

    /** A second installation of another template into the same workspace. */
    const seedSecondInstall = (seed: Seed) =>
      seedTemplateInstallation(seed.workspaceId, createId(), {
        allowEdit: true,
        allowDelete: true,
      })

    const seedInbox = async (workspaceId: string) => {
      const [inbox] = await db
        .insert(inboxModel)
        .values({
          id: createId(),
          workspaceId,
          name: "Shop",
          channel: "whatsapp",
          sourceId: `wa-${createId()}`,
        } as never)
        .returning({ id: inboxModel.id })
      return inbox.id
    }

    const runInstall = async (
      seed: Seed,
      webhooks: Record<string, unknown>[],
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
        payload: buildPayload(webhooks),
        templateName: "Template",
        createInstallFolder: false,
        sourceVersion: 1,
        inboxBindings: options.inboxBindings,
      })
    }

    const stored = (workspaceId: string) =>
      db.query.inboundWebhookModel.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      })

    const warningsOf = async (seed: Seed) =>
      (
        await templateInstallationRepository.findByIdAndWorkspace({
          id: seed.installationId,
          workspaceId: seed.workspaceId,
        })
      )?.warnings.map((warning) => warning.entityKind) ?? []

    const configOf = (row: {
      inboxResolution: never
      identifiers: never
      fieldMappings: never
      actions: never
      sampleJson: unknown
    }) => ({
      inboxResolution: row.inboxResolution,
      identifiers: row.identifiers,
      fieldMappings: row.fieldMappings,
      actions: row.actions,
      sampleJson: row.sampleJson,
    })

    const uninstall = async (seed: Seed) => {
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
    }

    test("installs off with its own token and no history, pointing at the installer's own rows", async () => {
      const seed = await seedInstall()
      const inbox = await seedInbox(seed.workspaceId)
      await runInstall(seed, [webhookEntry()], {
        inboxBindings: { [SOURCE_INBOX_ID]: inbox },
      })

      const [hook] = await stored(seed.workspaceId)
      const [flow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const [field] = await db.query.customFieldModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      const [tag] = await db.query.tagModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      expect(hook).toMatchObject({
        name: "Orders",
        active: false,
        requestCount: 0,
        sampleJson: null,
        inboxResolution: { mode: "inbox", inboxId: inbox },
        identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
        fieldMappings: [
          { jsonPath: "$.name", target: "full_name" },
          { jsonPath: "$.plan", target: field.id },
        ],
        actions: [
          { type: "addTag", tagIds: [tag.id] },
          { type: "startAnotherFlow", flowId: flow.id },
        ],
      })
      expect(hook.token).toMatch(WEBHOOK_TOKEN)
    })

    test("every install mints its own token", async () => {
      const first = await seedInstall()
      const second = await seedInstall()
      await runInstall(first, [webhookEntry()])
      await runInstall(second, [webhookEntry()])

      const [a] = await stored(first.workspaceId)
      const [b] = await stored(second.workspaceId)
      expect(a.token).not.toBe(b.token)
    })

    test("an inbox that was not bound is never kept: the copy has no rule, and the service accepts it once the rule is chosen", async () => {
      const seed = await seedInstall()
      await runInstall(seed, [webhookEntry()])
      const [hook] = await stored(seed.workspaceId)
      expect(hook.inboxResolution).toBeNull()
      expect(await warningsOf(seed)).toContain("inboxBindingRequired")

      // The unconfigured copy cannot be saved or switched on as it is ...
      await expect(
        inboundWebhookService.update({
          workspaceId: seed.workspaceId,
          id: hook.id,
          ...configOf(hook as never),
        }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        inboundWebhookService.updateSettings({
          workspaceId: seed.workspaceId,
          id: hook.id,
          active: true,
        }),
      ).rejects.toBeInstanceOf(Error)

      // ... and works once the installer fills the missing part in.
      const inbox = await seedInbox(seed.workspaceId)
      await inboundWebhookService.update({
        workspaceId: seed.workspaceId,
        id: hook.id,
        ...configOf(hook as never),
        inboxResolution: { mode: "inbox", inboxId: inbox },
      })
      await expect(
        inboundWebhookService.updateSettings({
          workspaceId: seed.workspaceId,
          id: hook.id,
          active: true,
        }),
      ).resolves.toMatchObject({ active: true })
    })

    test("the service's own update accepts a fully bound copy with unchanged data", async () => {
      const seed = await seedInstall()
      const inbox = await seedInbox(seed.workspaceId)
      await runInstall(seed, [webhookEntry()], {
        inboxBindings: { [SOURCE_INBOX_ID]: inbox },
      })
      const [hook] = await stored(seed.workspaceId)

      await expect(
        inboundWebhookService.update({
          workspaceId: seed.workspaceId,
          id: hook.id,
          ...configOf(hook as never),
        }),
      ).resolves.toMatchObject({ id: hook.id })
    })

    test("a View-only copy refuses shipped-content edits and a delete, but its switch, token, sample and inbox rule stay the installer's", async () => {
      const view = { allowEdit: false, allowDelete: false }
      const seed = await seedInstall(view)
      const inbox = await seedInbox(seed.workspaceId)
      const otherInbox = await seedInbox(seed.workspaceId)
      await runInstall(seed, [webhookEntry()], {
        permissions: view,
        inboxBindings: { [SOURCE_INBOX_ID]: inbox },
      })
      const [hook] = await stored(seed.workspaceId)
      const ctx = { workspaceId: seed.workspaceId, id: hook.id }
      const config = configOf(hook as never)

      await expect(
        inboundWebhookService.update({ ...ctx, ...config, actions: [] }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        inboundWebhookService.update({
          ...ctx,
          ...config,
          identifiers: [{ kind: "email", jsonPath: "$.email" }],
        }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        inboundWebhookService.updateSettings({ ...ctx, name: "renamed" }),
      ).rejects.toBeInstanceOf(Error)
      await expect(inboundWebhookService.delete(ctx)).rejects.toBeInstanceOf(
        Error,
      )
      await expect(
        inboundWebhookService.deleteMany({ ...ctx, ids: [hook.id] }),
      ).rejects.toBeInstanceOf(Error)

      // The installer's own parts keep working.
      await expect(
        inboundWebhookService.update({
          ...ctx,
          ...config,
          inboxResolution: { mode: "inbox", inboxId: otherInbox },
          sampleJson: { phone: "+84901234567" },
        }),
      ).resolves.toMatchObject({
        inboxResolution: { mode: "inbox", inboxId: otherInbox },
      })
      await expect(
        inboundWebhookService.updateSettings({ ...ctx, active: true }),
      ).resolves.toMatchObject({ active: true })
      const rotated = await inboundWebhookService.regenerateToken(ctx)
      expect(rotated.token).not.toBe(hook.token)

      // The refused edits left nothing behind.
      const [after] = await stored(seed.workspaceId)
      expect(after).toMatchObject({
        name: "Orders",
        actions: hook.actions,
        identifiers: hook.identifiers,
      })
    })

    test("the 100-webhook cap holds when two installs race for the last slots", async () => {
      const first = await seedInstall()
      const second = await seedSecondInstall(first)
      await db.insert(inboundWebhookModel).values(
        Array.from({ length: 98 }, (_, index) => ({
          id: createId(),
          workspaceId: first.workspaceId,
          name: `existing ${index}`,
          token: `iwh_seed_${createId()}`,
          inboxResolution: null,
          identifiers: [],
          fieldMappings: [],
          actions: [],
        })),
      )

      const entries = [
        webhookEntry({ sourceId: "31", name: "A1" }),
        webhookEntry({ sourceId: "32", name: "A2" }),
      ]
      await Promise.all([
        runInstall(first, entries),
        runInstall(second, entries),
      ])

      expect(await stored(first.workspaceId)).toHaveLength(100)
      const warnings = [
        ...(await warningsOf(first)),
        ...(await warningsOf(second)),
      ]
      expect(
        warnings.filter((kind) => kind === "inboundWebhookLimitReached"),
      ).toHaveLength(2)
    })

    test("the normal create refuses at the cap", async () => {
      const seed = await seedInstall()
      await db.insert(inboundWebhookModel).values(
        Array.from({ length: 100 }, (_, index) => ({
          id: createId(),
          workspaceId: seed.workspaceId,
          name: `existing ${index}`,
          token: `iwh_seed_${createId()}`,
          inboxResolution: null,
          identifiers: [],
          fieldMappings: [],
          actions: [],
        })),
      )

      await expect(
        inboundWebhookService.create({
          workspaceId: seed.workspaceId,
          name: "one too many",
        }),
      ).rejects.toMatchObject({ message: "validation.maxItemsReached" })
    })

    test("an uninstall removes the copy with its deliveries and keeps a flow the installer's own webhook still starts", async () => {
      const seed = await seedInstall()
      const inbox = await seedInbox(seed.workspaceId)
      await runInstall(seed, [webhookEntry()], {
        inboxBindings: { [SOURCE_INBOX_ID]: inbox },
      })
      const [copy] = await stored(seed.workspaceId)
      const [flow] = await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      })
      await db.insert(inboundWebhookRequestModel).values({
        id: createId(),
        workspaceId: seed.workspaceId,
        inboundWebhookId: copy.id,
        payload: { phone: "+84901234567" },
      } as never)
      const own = await inboundWebhookService.create({
        workspaceId: seed.workspaceId,
        name: "Mine",
      })
      await inboundWebhookService.update({
        workspaceId: seed.workspaceId,
        id: own.id,
        inboxResolution: { mode: "inbox", inboxId: inbox },
        identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
        fieldMappings: [{ jsonPath: "$.name", target: "full_name" }],
        actions: [{ type: "startAnotherFlow", flowId: flow.id }],
        sampleJson: null,
      })

      await uninstall(seed)

      expect((await stored(seed.workspaceId)).map((row) => row.id)).toEqual([
        own.id,
      ])
      expect(
        await db.query.inboundWebhookRequestModel.findMany({
          where: { workspaceId: seed.workspaceId },
        }),
      ).toEqual([])
      const flowRow = await db.query.templateInstalledResourceModel.findFirst({
        where: { installationId: seed.installationId, resourceKind: "flow" },
      })
      expect(flowRow?.uninstallOutcome).toBe("keptHasDependents")
    })
  },
)
