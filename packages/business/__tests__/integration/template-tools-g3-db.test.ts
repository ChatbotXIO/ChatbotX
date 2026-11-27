// @vitest-environment node

/**
 * The G3 Ecommerce tools (opening hours, vendors, discount codes, store
 * settings) against a real Postgres: copied between two workspaces that sell
 * from their own store, nothing copied from or into a workspace that sells from
 * a connected store (Shopify/WooCommerce), a code never installed live, a vendor
 * reused by name, existing settings kept, and the settings kept on uninstall.
 *
 * Commits for real (the install runs its own transaction), so each test
 * deletes its workspace — everything cascades from it — afterwards.
 * Needs the template migrations applied to the local database.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  ecommerceSettingsRepository,
  templateInstallationRepository,
  templateUninstallReferenceRepository,
} from "@chatbotx.io/database/repositories"
import {
  discountCodeModel,
  ecommerceSettingsModel,
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  JSON_CONTAINERS,
  referenceSlotsOf,
} from "../../src/template/uninstall-references"

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
const { listSelectableResources } = await import(
  "../../src/template/selectable-resources"
)

const databaseUrl = realDatabaseUrl()
const FULL = { kind: "apiToken", permission: "full" } as const

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

describe.skipIf(!databaseUrl)("template tools (G3) on a real database", () => {
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

  const collectFrom = async (sourceWorkspaceId: string) => {
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

  const install = async (
    targetWorkspaceId: string,
    sourceWorkspaceId: string,
    resources: Record<string, unknown>,
    permissions = { allowEdit: true, allowDelete: true },
  ) => {
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

  test("copies the store's own tools; a code never installs live and the vendor keeps its schedule", async () => {
    const source = track(await seedWorkspace("tools-g3-src"))
    const target = track(await seedWorkspace("tools-g3-dst"))
    await seedStore(source.workspaceId)

    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      await collectFrom(source.workspaceId),
    )

    const [hours] = await db.query.ecommerceOpenHoursModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(hours.name).toBe("Weekdays")
    const [vendor] = await db.query.vendorModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(vendor.openHoursId).toBe(hours.id)
    const [code] = await db.query.discountCodeModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(code.code).toBe("SAVE10")
    expect(code.isActive).toBe(false)
    expect(code.usedCount).toBe(0)
    const [settings] = await db.query.ecommerceSettingsModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(settings.openHoursId).toBe(hours.id)
    expect(await warningsOf(seed)).toEqual([])
  })

  test("a vendor and a code the installer already has are kept as they are, and existing settings stay", async () => {
    const source = track(await seedWorkspace("tools-g3-src"))
    const target = track(await seedWorkspace("tools-g3-dst"))
    await seedStore(source.workspaceId)
    await vendorService.create({
      workspaceId: target.workspaceId,
      name: "acme",
      phone: "999",
      isActive: true,
    } as never)
    await ecommerceSettingsService.update({
      workspaceId: target.workspaceId,
      patch: { general: { orderingAvailable: false } },
    })

    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      await collectFrom(source.workspaceId),
    )

    const vendors = await db.query.vendorModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(vendors).toHaveLength(1)
    expect(vendors[0].phone).toBe("999")
    const [settings] = await db.query.ecommerceSettingsModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(settings.orderingAvailable).toBe(false)
    expect(await warningsOf(seed)).toEqual(["storeSettingsKept"])
  })

  test("settings another writer created after the existence check are kept and not claimed", async () => {
    const source = track(await seedWorkspace("tools-g3-src"))
    const target = track(await seedWorkspace("tools-g3-dst"))
    await seedStore(source.workspaceId)
    await ecommerceSettingsService.update({
      workspaceId: target.workspaceId,
      patch: { general: { orderingAvailable: false } },
    })
    const collected = await collectFrom(source.workspaceId)
    // The check ran before the row existed: the insert then loses the race.
    const find = vi
      .spyOn(ecommerceSettingsRepository, "find")
      .mockResolvedValueOnce(undefined)

    const seed = await install(target.workspaceId, source.workspaceId, {
      storeSettings: collected.storeSettings,
    })
    find.mockRestore()

    const [settings] = await db.query.ecommerceSettingsModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(settings.orderingAvailable).toBe(false)
    expect(await warningsOf(seed)).toEqual(["storeSettingsKept"])
    const [tracked] = await db.query.templateInstalledResourceModel.findMany({
      where: {
        workspaceId: target.workspaceId,
        resourceKind: "storeSettings",
      },
    })
    expect(tracked.resourceId).toBe(settings.id)
    expect(tracked.wasExisting).toBe(true)
  })

  test("a workspace that sells from Shopify offers and collects nothing of the group", async () => {
    const source = track(await seedWorkspace("tools-g3-src"))
    await seedStore(source.workspaceId)
    await useExternalStore(source.workspaceId)

    const collected = await collectFrom(source.workspaceId)
    expect(collected.openHours).toHaveLength(0)
    expect(collected.vendors).toHaveLength(0)
    expect(collected.discountCodes).toHaveLength(0)
    expect(collected.storeSettings).toHaveLength(0)
    for (const category of [
      "openHours",
      "vendors",
      "discountCodes",
      "storeSettings",
      "products",
    ] as const) {
      const offered = await listSelectableResources({
        workspaceId: source.workspaceId,
        category,
        actor: FULL,
      })
      expect(offered.items, category).toHaveLength(0)
    }
  })

  test("installing into a workspace that sells from Shopify skips the group with one warning each", async () => {
    const source = track(await seedWorkspace("tools-g3-src"))
    const target = track(await seedWorkspace("tools-g3-dst"))
    await seedStore(source.workspaceId)
    await useExternalStore(target.workspaceId)

    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      await collectFrom(source.workspaceId),
    )

    expect(
      await db.query.vendorModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.discountCodeModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.ecommerceOpenHoursModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect((await warningsOf(seed)).sort()).toEqual([
      "externalStoreSkipped",
      "externalStoreSkipped",
      "externalStoreSkipped",
      "externalStoreSkipped",
    ])
  })

  test("View-only copies refuse content edits; an uninstall removes them but keeps the store settings", async () => {
    const source = track(await seedWorkspace("tools-g3-src"))
    const target = track(await seedWorkspace("tools-g3-dst"))
    await seedStore(source.workspaceId)
    const view = { allowEdit: false, allowDelete: false }
    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      await collectFrom(source.workspaceId),
      view,
    )
    const [vendor] = await db.query.vendorModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    await expect(
      vendorService.update({
        workspaceId: target.workspaceId,
        vendorId: vendor.id,
        data: { phone: "000" },
      }),
    ).rejects.toBeInstanceOf(Error)
    // The active switch is the installer's.
    await expect(
      vendorService.update({
        workspaceId: target.workspaceId,
        vendorId: vendor.id,
        data: { isActive: false },
      }),
    ).resolves.toMatchObject({ isActive: false })

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: target.workspaceId,
    })

    expect(
      await db.query.vendorModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.discountCodeModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.ecommerceSettingsModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(1)
  })

  test("a discount code that lists a product is a dependent of that product", async () => {
    const workspace = track(await seedWorkspace("tools-g3-product-dep"))
    await seedStore(workspace.workspaceId)
    const [code] = await db.query.discountCodeModel.findMany({
      where: { workspaceId: workspace.workspaceId },
    })
    await db
      .update(discountCodeModel)
      .set({ productIds: ["777", "888"] })
      .where(eq(discountCodeModel.id, code.id))
    const container = JSON_CONTAINERS.find(
      (candidate) => candidate.table === "DiscountCode",
    )
    if (!container) {
      throw new Error("DiscountCode is not a probed container")
    }

    const edges = await templateUninstallReferenceRepository.findInboundEdges({
      workspaceId: workspace.workspaceId,
      parentIds: ["777", "999"],
      slots: referenceSlotsOf("product"),
      columnProbes: [],
      containerProbes: [
        {
          holderKind: container.inboundKind,
          table: container.table,
          holderIdColumn: container.inboundIdColumn,
          jsonColumns: container.jsonColumns,
          idArrayColumns: container.idArrays?.columns,
          workspaceColumn: container.workspaceColumn,
          contactFilterColumn: container.contactFilterColumn,
        },
      ],
    })

    expect(edges).toEqual([
      expect.objectContaining({ parent: "777", holderKind: "discountCode" }),
    ])
  })
})
