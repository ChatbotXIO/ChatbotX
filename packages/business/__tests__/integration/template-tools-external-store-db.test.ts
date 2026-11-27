// @vitest-environment node

/**
 * External-store seams of the template tools, on a real Postgres:
 * - a sync into a workspace that sells from Shopify/Woo skips the whole
 *   Ecommerce group with a warning, and the existing copies stay governed
 *   (not detached);
 * - a workspace that sells from an external store ships an empty
 *   product-category manifest.
 * Commits for real, so each test deletes its workspaces afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  templateInstallationRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
  ecommerceSettingsModel,
  productCategoryModel,
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
const { templateSyncRequestService } = await import(
  "../../src/template/sync-request.service"
)
const { templateSyncExecuteService } = await import(
  "../../src/template/sync-execute.service"
)
const { collectProductCategoryAncestry } = await import(
  "../../src/template/adapters/manifests/collect-hierarchies"
)
const { ecommerceOpenHoursService } = await import(
  "../../src/ecommerce-open-hours/service"
)
const { vendorService } = await import("../../src/vendor/service")
const { discountCodeService } = await import("../../src/discount-code/service")
const { ecommerceSettingsService } = await import(
  "../../src/ecommerce-settings/service"
)
const { openHoursAdapter } = await import(
  "../../src/template/adapters/open-hours"
)
const { vendorsAdapter } = await import("../../src/template/adapters/vendors")
const { discountCodesAdapter } = await import(
  "../../src/template/adapters/discount-codes"
)
const { storeSettingsAdapter } = await import(
  "../../src/template/adapters/store-settings"
)

const databaseUrl = realDatabaseUrl()
const actor = { kind: "apiToken", permission: "full" } as const
const permissions = { allowEdit: true, allowDelete: true }
const FORMAT_VERSION = 3

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

describe.skipIf(!databaseUrl)("external-store template seams", () => {
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

  const useExternalStore = async (workspaceId: string) => {
    await ecommerceSettingsService.update({
      workspaceId,
      patch: { general: { orderingAvailable: true } },
    })
    await db
      .update(ecommerceSettingsModel)
      .set({ storeSource: "shopify" })
      .where(eq(ecommerceSettingsModel.workspaceId, workspaceId))
  }

  const seedStore = async (workspaceId: string) => {
    const hours = await ecommerceOpenHoursService.create({
      workspaceId,
      name: "Weekdays",
      ranges: [{ day: 1, from: "09:00", to: "17:00" }],
    })
    await vendorService.create({
      workspaceId,
      name: "Acme",
      phone: "123",
      isActive: true,
      openHoursId: hours.id,
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
    await ecommerceSettingsService.update({
      workspaceId,
      patch: { general: { orderingAvailable: true, openHoursId: hours.id } },
    })
  }

  const collectStore = async (sourceWorkspaceId: string) => {
    const collect = async (adapter: {
      collector: {
        resolveIds: (w: string, limit: number) => Promise<string[]>
        collect: (
          w: string,
          ids: string[],
        ) => Promise<{ entries: readonly unknown[] }>
      }
    }) =>
      (
        await adapter.collector.collect(
          sourceWorkspaceId,
          await adapter.collector.resolveIds(sourceWorkspaceId, 100),
        )
      ).entries
    return {
      openHours: await collect(openHoursAdapter),
      vendors: await collect(vendorsAdapter),
      discountCodes: await collect(discountCodesAdapter),
      storeSettings: await collect(storeSettingsAdapter),
    }
  }

  const payloadOf = (resources: Record<string, unknown>) => {
    const parsed = parseTemplateExport({
      formatVersion: FORMAT_VERSION,
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

  test("a sync into an external-store workspace skips the Ecommerce group, keeps the copies governed and warns", async () => {
    const source = track(await seedWorkspace("ext-src"))
    const target = track(await seedWorkspace("ext-dst"))
    await seedStore(source.workspaceId)
    const first = await collectStore(source.workspaceId)
    const renamedHours = (first.openHours as { name: string }[]).map(
      (entry) => ({ ...entry, name: "Renamed by v2" }),
    )
    const v1 = payloadOf(first)
    const v2 = payloadOf({ ...first, openHours: renamedHours })

    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: target.workspaceId,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: v1,
        categoryCounts: {},
        formatVersion: FORMAT_VERSION,
        shareToken: `tok-${createId()}`,
        defaultPermissions: permissions,
        version: 2,
      })
      .returning({ id: templateModel.id })
    for (const [version, payload] of [
      [1, v1],
      [2, v2],
    ] as const) {
      await db.transaction(async (tx) => {
        await templateVersionRepository.insert(
          {
            id: createId(),
            templateId: template.id,
            workspaceId: target.workspaceId,
            version,
            payload,
            payloadHash: `hash-${version}`,
            formatVersion: FORMAT_VERSION,
          },
          tx,
        )
      })
    }
    const installation = await templateInstallationRepository.create({
      workspaceId: target.workspaceId,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: "999000",
      formatVersion: FORMAT_VERSION,
      status: "pending",
      permissions,
      sourceVersion: 1,
    })
    const seed = {
      workspaceId: target.workspaceId,
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
      payload: v1,
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
    const [hoursCopy] = await db.query.ecommerceOpenHoursModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(hoursCopy.name).toBe("Weekdays")

    // The installer connects a Shopify store after installing.
    await useExternalStore(target.workspaceId)

    const { syncId } = await templateSyncRequestService.request({
      ...seed,
      actor,
      trigger: "manual",
    })
    const claimed = await templateSyncExecuteService.claim({
      syncId,
      workspaceId: target.workspaceId,
    })
    if (!claimed) {
      throw new Error("the sync could not be claimed")
    }
    await templateSyncExecuteService.run({
      sync: claimed.sync,
      claimToken: claimed.claimToken,
    })

    const [after] = await db.query.ecommerceOpenHoursModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(after.name).toBe("Weekdays")
    const rows = await db.query.templateInstalledResourceModel.findMany({
      where: { installationId: installation.id },
    })
    const ecommerceRows = rows.filter((row) =>
      ["openHours", "vendors", "discountCodes", "storeSettings"].includes(
        row.category,
      ),
    )
    expect(ecommerceRows.length).toBeGreaterThan(0)
    expect(ecommerceRows.every((row) => row.detachedAt === null)).toBe(true)
    const [sync] = await db.query.templateInstallationSyncModel.findMany({
      where: { id: syncId },
    })
    expect(sync.warnings.map((warning) => warning.entityKind)).toContain(
      "externalStoreSkipped",
    )
  })

  test("a workspace that sells from an external store ships no product categories", async () => {
    const own = track(await seedWorkspace("ext-own"))
    const external = track(await seedWorkspace("ext-shop"))
    const categoryIds: Record<string, string> = {}
    for (const { workspaceId } of [own, external]) {
      const [row] = await db
        .insert(productCategoryModel)
        .values({ id: createId(), workspaceId, name: "Drinks" } as never)
        .returning({ id: productCategoryModel.id })
      categoryIds[workspaceId] = row.id
    }
    await useExternalStore(external.workspaceId)

    const shipped = await collectProductCategoryAncestry(own.workspaceId, [
      categoryIds[own.workspaceId],
    ])
    expect(Object.values(shipped).map((entry) => entry.name)).toEqual([
      "Drinks",
    ])
    await expect(
      collectProductCategoryAncestry(external.workspaceId, [
        categoryIds[external.workspaceId],
      ]),
    ).resolves.toEqual({})
  })
})
