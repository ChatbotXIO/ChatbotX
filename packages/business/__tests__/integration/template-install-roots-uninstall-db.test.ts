// @vitest-environment node

/**
 * An install into a dedicated folder makes one root per folder namespace; an
 * uninstall that empties them must remove every one, not only the first.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  folderModel,
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
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueUninstallTemplate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService } = await import(
  "../../src/template/uninstall-execute.service"
)

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: true, allowDelete: true }
const FULL = { kind: "apiToken", permission: "full" } as const

describe.skipIf(!databaseUrl)("uninstall of an install folder install", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  test("every empty install root is removed, not only the first", async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `template-roots-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `template-roots-${suffix}`, ownerId: owner.id })
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
    const parsed = parseTemplateExport({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "999000", tenantId: "1" },
      manifests: {},
      resources: {
        flows: [
          {
            sourceId: "801",
            name: "First",
            active: true,
            enableInInbox: true,
            startNodeId: "8010",
            nodes: [],
            edges: [],
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
        keywords: [
          {
            sourceId: "901",
            type: "inbound",
            keywords: ["a"],
            text: "x",
            flowId: null,
            folderId: null,
          },
          {
            sourceId: "902",
            type: "outbound",
            keywords: ["b"],
            text: "y",
            flowId: null,
            folderId: null,
          },
        ],
      },
    })
    if (!parsed.ok) {
      throw new Error(parsed.reason)
    }
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
      payload: parsed.data,
      templateName: "Template",
      createInstallFolder: true,
      sourceVersion: 1,
    })
    expect(
      await db.$count(folderModel, eq(folderModel.workspaceId, workspace.id)),
    ).toBe(4)

    const seed = { workspaceId: workspace.id, installationId: installation.id }
    const previewed = await templateUninstallService.previewAsInstaller({
      ...seed,
      actor: FULL,
    })
    await templateUninstallService.uninstallAsInstaller({
      ...seed,
      actor: FULL,
    })
    const uninstallClaim = await templateUninstallExecuteService.claim(seed)
    if (!uninstallClaim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...uninstallClaim,
      workspaceId: workspace.id,
    })

    const finished = await templateInstallationRepository.findByIdAndWorkspace({
      id: installation.id,
      workspaceId: workspace.id,
    })
    // The roots are bookkeeping: the result reports what the preview did.
    expect(previewed.deleted).toBe(4)
    expect(finished?.uninstallCounts?.deleted).toBe(previewed.deleted)
    expect(finished?.uninstallCounts?.keptShared).toBe(previewed.keptShared)

    const folders = await db.query.folderModel.findMany({
      where: { workspaceId: workspace.id },
    })
    expect(folders).toEqual([])
  })
})
