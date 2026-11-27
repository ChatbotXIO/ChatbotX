// @vitest-environment node

/**
 * Two installs of templates that carry the same vendor and discount code run at
 * the same time into one workspace: one row each, one of the installs owns it
 * (`wasExisting` false) and the other found it (`wasExisting` true), and
 * neither fails on the unique key.
 * Commits for real, so each test deletes its workspaces afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
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

const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { vendorService } = await import("../../src/vendor/service")
const { discountCodeService } = await import("../../src/discount-code/service")
const { vendorsAdapter } = await import("../../src/template/adapters/vendors")
const { discountCodesAdapter } = await import(
  "../../src/template/adapters/discount-codes"
)

const databaseUrl = realDatabaseUrl()

const seedWorkspace = async (label: string) => {
  const suffix = createId()
  const [owner] = await db
    .insert(userModel)
    .values({ email: `${label}-${suffix}@example.test` })
    .returning({ id: userModel.id })
  const [workspace] = await db
    .insert(workspaceModel)
    .values({ name: `${label}-${suffix}`, ownerId: owner.id })
    .returning({ id: workspaceModel.id })
  return { workspaceId: workspace.id, userId: owner.id }
}

describe.skipIf(!databaseUrl)("concurrent installs of store resources", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const track = (seed: { workspaceId: string; userId: string }) => {
    created.push(seed)
    return seed
  }

  const seedVendorAndCode = async (workspaceId: string) => {
    await vendorService.create({
      workspaceId,
      name: "Acme",
      phone: "123",
      isActive: true,
    } as never)
    await discountCodeService.create({
      workspaceId,
      code: "SAVE10",
      autoApply: true,
      discountType: "percentage",
      discountValue: 10,
      appliesTo: "entireOrder",
      categoryId: null,
      productIds: [],
      minimumType: "none",
      minimumValue: 0,
      usageLimit: null,
      oncePerCustomer: false,
      eligibility: "everyone",
      customerFilter: null,
      startsAt: new Date("2020-01-01T00:00:00.000Z"),
      endsAt: null,
      isActive: true,
    })
  }

  const install = async (
    targetWorkspaceId: string,
    sourceWorkspaceId: string,
    resources: Record<string, unknown>,
  ) => {
    const permissions = { allowEdit: true, allowDelete: true }
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: targetWorkspaceId,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {},
        categoryCounts: {},
        formatVersion: 3,
        shareToken: `tok-${createId()}`,
        defaultPermissions: permissions,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: targetWorkspaceId,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId,
      formatVersion: 3,
      status: "pending",
      permissions,
    })
    const parsed = parseTemplateExport({
      formatVersion: 3,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: sourceWorkspaceId, tenantId: "1" },
      manifests: {},
      resources,
    })
    if (!parsed.ok) {
      throw new Error(parsed.reason)
    }
    const seed = {
      workspaceId: targetWorkspaceId,
      installationId: installation.id,
    }
    const claim = await templateInstallService.claim(seed)
    if (!claim) {
      throw new Error("the install could not be claimed")
    }
    await templateInstallService.run({
      ...seed,
      claimToken: claim.claimToken,
      permissions,
      payload: parsed.data,
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
    return seed
  }

  test("parallel installs of the same vendor and discount code leave one row each and a correct wasExisting", async () => {
    const source = track(await seedWorkspace("cc-src"))
    const target = track(await seedWorkspace("cc-dst"))
    await seedVendorAndCode(source.workspaceId)
    const collected = {
      vendors: (
        await vendorsAdapter.collector.collect(
          source.workspaceId,
          await vendorsAdapter.collector.resolveIds(source.workspaceId, 100),
        )
      ).entries,
      discountCodes: (
        await discountCodesAdapter.collector.collect(
          source.workspaceId,
          await discountCodesAdapter.collector.resolveIds(
            source.workspaceId,
            100,
          ),
        )
      ).entries,
    }

    const seeds = await Promise.all([
      install(target.workspaceId, source.workspaceId, collected),
      install(target.workspaceId, source.workspaceId, collected),
    ])

    expect(
      await db.query.vendorModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(1)
    expect(
      await db.query.discountCodeModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(1)

    for (const seed of seeds) {
      const installation =
        await templateInstallationRepository.findByIdAndWorkspace({
          id: seed.installationId,
          workspaceId: seed.workspaceId,
        })
      expect(installation?.status).toBe("completed")
    }
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: {
        installationId: { in: seeds.map((seed) => seed.installationId) },
      },
    })
    for (const kind of ["vendor", "discountCode"]) {
      const ofKind = rows.filter((row) => row.resourceKind === kind)
      expect(ofKind).toHaveLength(2)
      expect(ofKind.filter((row) => row.wasExisting)).toHaveLength(1)
    }
  })
})
