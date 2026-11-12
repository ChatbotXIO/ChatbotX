// @vitest-environment node

/**
 * The template store service on a real Postgres: tenant isolation, the
 * per-tenant store lock (double approve, caps, moves), the status table and
 * the links of a published listing. Commits for real; each run deletes its
 * tenants, workspace, templates and users afterwards.
 */

import { db, eq, inArray } from "@chatbotx.io/database/client"
import {
  TEMPLATE_STORE_MAX_CATEGORIES,
  TEMPLATE_STORE_MAX_LISTINGS,
} from "@chatbotx.io/database/partials"
import {
  templateModel,
  templateStoreListingModel,
  tenantModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

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

const mocks = vi.hoisted(() => ({ resolveServingHost: vi.fn() }))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/platform/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/platform/settings")>()),
  resolveServingHost: mocks.resolveServingHost,
}))

const { templateStoreService } = await import(
  "../../src/template/store.service"
)
const { resolveTemplateStoreListingStatus } = await import(
  "../../src/template/store.service"
)

const databaseUrl = realDatabaseUrl()
const categoryGoneCode = { code: "templateStoreCategoryUnavailable" }
const APP_URL = "https://reseller.example.test"
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

describe("resolveTemplateStoreListingStatus", () => {
  const NOW = Date.parse("2026-01-01T00:00:00Z")
  const base = {
    templateDeletedAt: null,
    templateTenantId: "7",
    shareEnabled: true,
    shareExpiresAt: null,
  }

  test.each([
    ["published", {}],
    ["templateUnavailable", { templateDeletedAt: new Date(NOW) }],
    ["templateUnavailable", { templateTenantId: "8" }],
    ["shareDisabled", { shareEnabled: false }],
    ["shareDisabled", { shareExpiresAt: new Date(NOW - 1) }],
    ["published", { shareExpiresAt: new Date(NOW) }],
    ["templateUnavailable", { templateTenantId: "8", shareEnabled: false }],
  ] as const)("%s for %j", (expected, override) => {
    expect(
      resolveTemplateStoreListingStatus({ ...base, ...override }, "7", NOW),
    ).toBe(expected)
  })
})

describe.skipIf(!databaseUrl)("template store service", () => {
  const userIds: string[] = []
  const tenantIds: string[] = []
  let workspaceId: string

  const seedTenant = async (label: string) => {
    const [owner] = await db
      .insert(userModel)
      .values({ email: `store-svc-${label}-${suffix}@example.test` })
      .returning({ id: userModel.id })
    userIds.push(owner.id)
    const [tenant] = await db
      .insert(tenantModel)
      .values({ ownerId: owner.id })
      .returning({ id: tenantModel.id })
    tenantIds.push(tenant.id)
    return {
      ownerId: owner.id,
      tenantId: tenant.id,
      scope: { kind: "owner", ownerId: owner.id } as const,
    }
  }

  const templateValues = (
    tenantId: string,
    overrides: Partial<typeof templateModel.$inferInsert> = {},
  ): typeof templateModel.$inferInsert => ({
    id: createId(),
    workspaceId,
    tenantId,
    name: `Template ${Math.random()}`,
    selection: { mode: "all" } as never,
    payload: {} as never,
    categoryCounts: {},
    formatVersion: 1,
    shareToken: `tok-${Math.random()}-${suffix}`,
    shareEnabled: true,
    defaultPermissions: { allowEdit: true, allowDelete: true } as never,
    ...overrides,
  })

  const seedTemplate = async (
    tenantId: string,
    overrides: Partial<typeof templateModel.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(templateModel)
      .values(templateValues(tenantId, overrides))
      .returning({ id: templateModel.id, shareToken: templateModel.shareToken })
    return row
  }

  const categoryIdsOf = async (
    scope: Awaited<ReturnType<typeof seedTenant>>["scope"],
  ) =>
    (await templateStoreService.listForAdmin({ scope, page: 1, perPage: 1 }))
      .categories

  beforeAll(async () => {
    // A tenant with a custom domain is served on it: the host answers for that tenant.
    mocks.resolveServingHost.mockImplementation((tenantId: string) =>
      Promise.resolve({ tenantId, appUrl: APP_URL }),
    )
    const [owner] = await db
      .insert(userModel)
      .values({ email: `store-svc-ws-${suffix}@example.test` })
      .returning({ id: userModel.id })
    userIds.push(owner.id)
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `store-svc-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    workspaceId = workspace.id
  })

  afterAll(async () => {
    await db
      .delete(templateModel)
      .where(inArray(templateModel.tenantId, tenantIds))
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.delete(tenantModel).where(inArray(tenantModel.id, tenantIds))
    await db.delete(userModel).where(inArray(userModel.id, userIds))
  })

  test("category names are trimmed, unique case-insensitively, and bounded", async () => {
    const { scope, ownerId } = await seedTenant("names")
    await templateStoreService.createCategory({
      scope,
      name: "  Flows  ",
      actorUserId: ownerId,
    })
    await expect(
      templateStoreService.createCategory({
        scope,
        name: "flows",
        actorUserId: ownerId,
      }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryNameTaken" })
    await expect(
      templateStoreService.createCategory({
        scope,
        name: "   ",
        actorUserId: ownerId,
      }),
    ).rejects.toThrow()
    await expect(
      templateStoreService.createCategory({
        scope,
        name: "x".repeat(61),
        actorUserId: ownerId,
      }),
    ).rejects.toThrow()
    const [first] = await categoryIdsOf(scope)
    expect(first.name).toBe("Flows")

    await templateStoreService.createCategory({
      scope,
      name: "Bots",
      actorUserId: ownerId,
    })
    await expect(
      templateStoreService.renameCategory({
        scope,
        categoryId: first.id,
        name: "BOTS",
      }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryNameTaken" })
    await templateStoreService.renameCategory({
      scope,
      categoryId: first.id,
      name: "Flows 2",
    })
    await expect(
      templateStoreService.renameCategory({
        scope,
        categoryId: "1",
        name: "Nope",
      }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryUnavailable" })
  })

  test("concurrent creates stop at the category cap", async () => {
    const { scope, ownerId } = await seedTenant("cap")
    const outcomes = await Promise.allSettled(
      Array.from({ length: TEMPLATE_STORE_MAX_CATEGORIES + 4 }, (_, i) =>
        templateStoreService.createCategory({
          scope,
          name: `C${i}`,
          actorUserId: ownerId,
        }),
      ),
    )
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(
      TEMPLATE_STORE_MAX_CATEGORIES,
    )
    expect(
      outcomes.filter(
        (o) =>
          o.status === "rejected" &&
          (o.reason as { code: string }).code === "templateStoreCategoryLimit",
      ),
    ).toHaveLength(4)
    const ranks = (await categoryIdsOf(scope)).map((c) => c.rank)
    expect(new Set(ranks).size).toBe(TEMPLATE_STORE_MAX_CATEGORIES)
  })

  test("moving a category swaps neighbours, keeps the edges, and repairs ties", async () => {
    const { scope, ownerId } = await seedTenant("move")
    for (const name of ["A", "B", "C"]) {
      await templateStoreService.createCategory({
        scope,
        name,
        actorUserId: ownerId,
      })
    }
    const names = async () => (await categoryIdsOf(scope)).map((c) => c.name)
    const [a, b, c] = await categoryIdsOf(scope)
    await templateStoreService.moveCategory({
      scope,
      categoryId: c.id,
      direction: "up",
    })
    expect(await names()).toEqual(["A", "C", "B"])
    await templateStoreService.moveCategory({
      scope,
      categoryId: a.id,
      direction: "up",
    })
    expect(await names()).toEqual(["A", "C", "B"])
    await templateStoreService.moveCategory({
      scope,
      categoryId: b.id,
      direction: "down",
    })
    expect(await names()).toEqual(["A", "C", "B"])
    // Concurrent moves keep a total order with no duplicate ranks.
    await Promise.all([
      templateStoreService.moveCategory({
        scope,
        categoryId: b.id,
        direction: "up",
      }),
      templateStoreService.moveCategory({
        scope,
        categoryId: a.id,
        direction: "down",
      }),
    ])
    expect(new Set((await categoryIdsOf(scope)).map((x) => x.rank)).size).toBe(
      3,
    )
    await expect(
      templateStoreService.moveCategory({
        scope,
        categoryId: "1",
        direction: "up",
      }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryUnavailable" })
  })

  test("approving validates the template, categories and tenant", async () => {
    const mine = await seedTenant("add-mine")
    const other = await seedTenant("add-other")
    await templateStoreService.createCategory({
      scope: mine.scope,
      name: "Mine",
      actorUserId: mine.ownerId,
    })
    await templateStoreService.createCategory({
      scope: other.scope,
      name: "Theirs",
      actorUserId: other.ownerId,
    })
    const [mineCat] = await categoryIdsOf(mine.scope)
    const [theirCat] = await categoryIdsOf(other.scope)
    const own = await seedTemplate(mine.tenantId)
    const foreign = await seedTemplate(other.tenantId)
    const deleted = await seedTemplate(mine.tenantId, { deletedAt: new Date() })
    const add = (templateId: string, categoryIds: string[]) =>
      templateStoreService.addListing({
        scope: mine.scope,
        templateId,
        categoryIds,
        actorUserId: mine.ownerId,
      })

    for (const templateId of [
      foreign.id,
      deleted.id,
      "not-a-number",
      "99999999999999999999",
      "1",
    ]) {
      await expect(add(templateId, [mineCat.id])).rejects.toMatchObject({
        code: "templateStoreTemplateUnavailable",
      })
    }
    await expect(add(own.id, [theirCat.id])).rejects.toMatchObject({
      code: "templateStoreCategoryUnavailable",
    })
    // A failed category check leaves no listing behind.
    expect(
      (
        await templateStoreService.listForAdmin({
          scope: mine.scope,
          page: 1,
          perPage: 5,
        })
      ).total,
    ).toBe(0)

    await add(own.id, [mineCat.id, mineCat.id])
    await expect(add(own.id, [mineCat.id])).rejects.toMatchObject({
      code: "templateStoreListingExists",
    })
    // The other tenant never sees it.
    expect(
      (
        await templateStoreService.listForAdmin({
          scope: other.scope,
          page: 1,
          perPage: 5,
        })
      ).total,
    ).toBe(0)
  })

  test("a concurrent double approve yields one listing", async () => {
    const { scope, ownerId, tenantId } = await seedTenant("double")
    await templateStoreService.createCategory({
      scope,
      name: "C",
      actorUserId: ownerId,
    })
    const [cat] = await categoryIdsOf(scope)
    const template = await seedTemplate(tenantId)
    const outcomes = await Promise.allSettled(
      [1, 2, 3].map(() =>
        templateStoreService.addListing({
          scope,
          templateId: template.id,
          categoryIds: [cat.id],
          actorUserId: ownerId,
        }),
      ),
    )
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1)
    for (const rejected of outcomes.filter((o) => o.status === "rejected")) {
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        code: "templateStoreListingExists",
      })
    }
  })

  test("the listing cap holds under concurrency, and re-adding a listed template still says exists", async () => {
    const { scope, ownerId, tenantId } = await seedTenant("listing-cap")
    await templateStoreService.createCategory({
      scope,
      name: "C",
      actorUserId: ownerId,
    })
    const [cat] = await categoryIdsOf(scope)
    const templates = Array.from(
      { length: TEMPLATE_STORE_MAX_LISTINGS - 1 },
      () => templateValues(tenantId),
    )
    await db.insert(templateModel).values(templates)
    await db.insert(templateStoreListingModel).values(
      templates.map((t) => ({
        id: createId(),
        tenantId,
        templateId: t.id as string,
      })),
    )
    const [first, second] = [
      await seedTemplate(tenantId),
      await seedTemplate(tenantId),
    ]
    const add = (templateId: string) =>
      templateStoreService.addListing({
        scope,
        templateId,
        categoryIds: [cat.id],
        actorUserId: ownerId,
      })
    // 499 -> 500: of two concurrent adds exactly one wins.
    const outcomes = await Promise.allSettled([add(first.id), add(second.id)])
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1)
    expect(
      (outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult)
        .reason,
    ).toMatchObject({ code: "templateStoreListingLimit" })
    expect(
      (await templateStoreService.listForAdmin({ scope, page: 1, perPage: 1 }))
        .total,
    ).toBe(TEMPLATE_STORE_MAX_LISTINGS)
    // At the cap, an already listed template is "exists", not "limit".
    const winner = outcomes[0].status === "fulfilled" ? first : second
    await expect(add(winner.id)).rejects.toMatchObject({
      code: "templateStoreListingExists",
    })
  })

  test("ids that are not numbers read as not found instead of failing in SQL", async () => {
    const { scope, ownerId, tenantId } = await seedTenant("bad-ids")
    await templateStoreService.createCategory({
      scope,
      name: "C",
      actorUserId: ownerId,
    })
    const [cat] = await categoryIdsOf(scope)
    const tpl = await seedTemplate(tenantId)
    await templateStoreService.addListing({
      scope,
      templateId: tpl.id,
      categoryIds: [cat.id],
      actorUserId: ownerId,
    })
    const { listings } = await templateStoreService.listForAdmin({
      scope,
      page: 1,
      perPage: 5,
    })
    const listingId = listings[0].listingId
    const bad = "abc"
    const categoryGone = { code: "templateStoreCategoryUnavailable" }
    const listingGone = { code: "templateStoreListingUnavailable" }
    await expect(
      templateStoreService.renameCategory({
        scope,
        categoryId: bad,
        name: "x",
      }),
    ).rejects.toMatchObject(categoryGone)
    await expect(
      templateStoreService.deleteCategory({ scope, categoryId: bad }),
    ).rejects.toMatchObject(categoryGone)
    await expect(
      templateStoreService.moveCategory({
        scope,
        categoryId: bad,
        direction: "up",
      }),
    ).rejects.toMatchObject(categoryGone)
    await expect(
      templateStoreService.removeListing({ scope, listingId: bad }),
    ).rejects.toMatchObject(listingGone)
    await expect(
      templateStoreService.updateListingCategories({
        scope,
        listingId: bad,
        categoryIds: [cat.id],
      }),
    ).rejects.toMatchObject(listingGone)
    await expect(
      templateStoreService.updateListingCategories({
        scope,
        listingId,
        categoryIds: [bad],
      }),
    ).rejects.toMatchObject(categoryGone)
    await expect(
      templateStoreService.addListing({
        scope,
        templateId: tpl.id,
        categoryIds: [bad],
        actorUserId: ownerId,
      }),
    ).rejects.toMatchObject(categoryGone)
    // Reads: the admin list ignores a filter that is not one of the tenant's
    // categories (a stale URL), the public list returns nothing for it.
    const admin = await templateStoreService.listForAdmin({
      scope,
      categoryId: bad,
      page: 1,
      perPage: 5,
    })
    expect(admin).toMatchObject({ total: 1, activeCategoryId: undefined })
    expect(admin.categories.map((c) => [c.name, c.templateCount])).toEqual([
      ["C", 1],
    ])
    const deletedCategory = await templateStoreService.listForAdmin({
      scope,
      categoryId: "1",
      page: 1,
      perPage: 5,
    })
    expect(deletedCategory).toMatchObject({
      total: 1,
      activeCategoryId: undefined,
    })
    expect(
      (
        await templateStoreService.listForAdmin({
          scope,
          categoryId: cat.id,
          page: 1,
          perPage: 5,
        })
      ).activeCategoryId,
    ).toBe(cat.id)
    expect(
      (await templateStoreService.listPublished({ tenantId, categoryId: bad }))
        .templates,
    ).toEqual([])
    expect(
      (await templateStoreService.listPublished({ tenantId })).templates,
    ).toHaveLength(1)
    // The home page's tab probe agrees with the catalog, and is scoped to the tenant.
    expect(await templateStoreService.hasPublished({ tenantId })).toBe(true)
    expect(
      await templateStoreService.hasPublished({ tenantId: createId() }),
    ).toBe(false)
  })

  test("concurrent category replacement, remove and category delete leave a consistent store", async () => {
    const { scope, ownerId, tenantId } = await seedTenant("races")
    for (const name of ["A", "B"]) {
      await templateStoreService.createCategory({
        scope,
        name,
        actorUserId: ownerId,
      })
    }
    const [a, b] = await categoryIdsOf(scope)
    const tpl = await seedTemplate(tenantId)
    await templateStoreService.addListing({
      scope,
      templateId: tpl.id,
      categoryIds: [a.id],
      actorUserId: ownerId,
    })
    const listingId = (
      await templateStoreService.listForAdmin({ scope, page: 1, perPage: 5 })
    ).listings[0].listingId

    // Two replacements at once: exactly one final set, never a mix.
    await Promise.all([
      templateStoreService.updateListingCategories({
        scope,
        listingId,
        categoryIds: [a.id],
      }),
      templateStoreService.updateListingCategories({
        scope,
        listingId,
        categoryIds: [b.id],
      }),
    ])
    const names = (
      await templateStoreService.listForAdmin({ scope, page: 1, perPage: 5 })
    ).listings[0].categories.map((c) => c.name)
    expect(names).toHaveLength(1)

    // Replace racing a remove: the replace either lands before it or reports the listing gone.
    const [replace, remove] = await Promise.allSettled([
      templateStoreService.updateListingCategories({
        scope,
        listingId,
        categoryIds: [a.id, b.id],
      }),
      templateStoreService.removeListing({ scope, listingId }),
    ])
    expect(remove.status).toBe("fulfilled")
    if (replace.status === "rejected") {
      expect(replace.reason).toMatchObject({
        code: "templateStoreListingUnavailable",
      })
    }
    expect(
      (await templateStoreService.listForAdmin({ scope, page: 1, perPage: 5 }))
        .total,
    ).toBe(0)

    // A move racing the delete of the same category: the move reports it gone or lands first.
    const [move, del] = await Promise.allSettled([
      templateStoreService.moveCategory({
        scope,
        categoryId: a.id,
        direction: "down",
      }),
      templateStoreService.deleteCategory({ scope, categoryId: a.id }),
    ])
    expect(del.status).toBe("fulfilled")
    if (move.status === "rejected") {
      expect(move.reason).toMatchObject(categoryGoneCode)
    }
    // Whichever won, only the other category is left (its rank depends on who ran first).
    expect(await categoryIdsOf(scope)).toHaveLength(1)
  })

  test("editing and removing a listing are tenant-scoped", async () => {
    const mine = await seedTenant("edit-mine")
    const other = await seedTenant("edit-other")
    for (const t of [mine, other]) {
      await templateStoreService.createCategory({
        scope: t.scope,
        name: "C",
        actorUserId: t.ownerId,
      })
    }
    const [cat] = await categoryIdsOf(mine.scope)
    const [theirCat] = await categoryIdsOf(other.scope)
    await templateStoreService.createCategory({
      scope: mine.scope,
      name: "D",
      actorUserId: mine.ownerId,
    })
    const tpl = await seedTemplate(mine.tenantId)
    await templateStoreService.addListing({
      scope: mine.scope,
      templateId: tpl.id,
      categoryIds: [cat.id],
      actorUserId: mine.ownerId,
    })
    const { listings } = await templateStoreService.listForAdmin({
      scope: mine.scope,
      page: 1,
      perPage: 5,
    })
    const listingId = listings[0].listingId

    await expect(
      templateStoreService.updateListingCategories({
        scope: other.scope,
        listingId,
        categoryIds: [theirCat.id],
      }),
    ).rejects.toMatchObject({ code: "templateStoreListingUnavailable" })
    await expect(
      templateStoreService.updateListingCategories({
        scope: mine.scope,
        listingId,
        categoryIds: [theirCat.id],
      }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryUnavailable" })
    await expect(
      templateStoreService.removeListing({ scope: other.scope, listingId }),
    ).rejects.toMatchObject({ code: "templateStoreListingUnavailable" })

    const [, second] = await categoryIdsOf(mine.scope)
    await templateStoreService.updateListingCategories({
      scope: mine.scope,
      listingId,
      categoryIds: [second.id],
    })
    const after = await templateStoreService.listForAdmin({
      scope: mine.scope,
      page: 1,
      perPage: 5,
    })
    expect(after.listings[0].categories.map((c) => c.name)).toEqual(["D"])
    await templateStoreService.removeListing({ scope: mine.scope, listingId })
    await expect(
      templateStoreService.removeListing({ scope: mine.scope, listingId }),
    ).rejects.toMatchObject({ code: "templateStoreListingUnavailable" })
  })

  test("a template without a category is published and shows under All only", async () => {
    const { scope, ownerId, tenantId } = await seedTenant("nocat")
    await templateStoreService.createCategory({
      scope,
      name: "C",
      actorUserId: ownerId,
    })
    const [cat] = await categoryIdsOf(scope)
    const bare = await seedTemplate(tenantId, { name: "Bare" })
    const filed = await seedTemplate(tenantId, { name: "Filed" })
    await templateStoreService.addListing({
      scope,
      templateId: bare.id,
      categoryIds: [],
      actorUserId: ownerId,
    })
    await templateStoreService.addListing({
      scope,
      templateId: filed.id,
      categoryIds: [cat.id],
      actorUserId: ownerId,
    })

    const all = await templateStoreService.listPublished({ tenantId })
    expect(
      all.templates.map((t) => [t.name, t.categoryIds.length]).sort(),
    ).toEqual([
      ["Bare", 0],
      ["Filed", 1],
    ])
    // Filtering by the category leaves the uncategorised one out.
    expect(
      (
        await templateStoreService.listPublished({
          tenantId,
          categoryId: cat.id,
        })
      ).templates.map((t) => t.name),
    ).toEqual(["Filed"])

    // Deleting the only category leaves the template published, now uncategorised.
    await templateStoreService.deleteCategory({ scope, categoryId: cat.id })
    await expect(
      templateStoreService.deleteCategory({ scope, categoryId: cat.id }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryUnavailable" })
    const admin = await templateStoreService.listForAdmin({
      scope,
      page: 1,
      perPage: 5,
    })
    expect(admin.listings.map((l) => l.status)).toEqual([
      "published",
      "published",
    ])
    expect(
      (await templateStoreService.listPublished({ tenantId })).templates,
    ).toHaveLength(2)
    expect(
      (await templateStoreService.listPublished({ tenantId })).categories,
    ).toEqual([])
  })

  test("candidate search lists only addable templates of this tenant, bounded and literal", async () => {
    const mine = await seedTenant("cand-mine")
    const other = await seedTenant("cand-other")
    await templateStoreService.createCategory({
      scope: mine.scope,
      name: "C",
      actorUserId: mine.ownerId,
    })
    const [cat] = await categoryIdsOf(mine.scope)
    const alpha = await seedTemplate(mine.tenantId, { name: "Alpha 50%" })
    const listed = await seedTemplate(mine.tenantId, { name: "Alpha listed" })
    await seedTemplate(mine.tenantId, {
      name: "Alpha deleted",
      deletedAt: new Date(),
    })
    await seedTemplate(other.tenantId, { name: "Alpha foreign" })
    await templateStoreService.addListing({
      scope: mine.scope,
      templateId: listed.id,
      categoryIds: [cat.id],
      actorUserId: mine.ownerId,
    })
    const names = async (keyword?: string) =>
      (
        await templateStoreService.searchCandidates({
          scope: mine.scope,
          keyword,
        })
      ).map((c) => c.name)

    expect(await names("alpha")).toEqual(["Alpha 50%"])
    expect(await names()).toEqual(["Alpha 50%"])
    // Wildcards are literal, an ID matches exactly, anything else matches nothing.
    expect(await names("%")).toEqual(["Alpha 50%"])
    expect(await names("_")).toEqual([])
    expect(await names(alpha.id)).toEqual(["Alpha 50%"])
    expect(await names("99999999999999999999")).toEqual([])
    const row = (
      await templateStoreService.searchCandidates({
        scope: mine.scope,
        keyword: "alpha",
      })
    )[0]
    expect(row).toMatchObject({
      templateId: alpha.id,
      ownerWorkspaceName: expect.any(String),
    })

    // At most 20 candidates, newest first, however many templates exist.
    const many = Array.from({ length: 25 }, (_, i) =>
      templateValues(mine.tenantId, { name: `Bulk ${i}` }),
    )
    await db.insert(templateModel).values(many)
    expect(await names("bulk")).toHaveLength(20)

    // An owner with no tenant sees none.
    const [loner] = await db
      .insert(userModel)
      .values({ email: `store-svc-cand-none-${suffix}@example.test` })
      .returning({ id: userModel.id })
    userIds.push(loner.id)
    expect(
      await templateStoreService.searchCandidates({
        scope: { kind: "owner", ownerId: loner.id },
      }),
    ).toEqual([])
  })

  test("the admin list exposes the page link only when published, and the public list resolves the host once", async () => {
    const { scope, ownerId, tenantId } = await seedTenant("links")
    await templateStoreService.createCategory({
      scope,
      name: "C",
      actorUserId: ownerId,
    })
    const [cat] = await categoryIdsOf(scope)
    const live = await seedTemplate(tenantId, { name: "Live" })
    const off = await seedTemplate(tenantId, {
      name: "Off",
      shareEnabled: false,
    })
    for (const t of [live, off]) {
      await templateStoreService.addListing({
        scope,
        templateId: t.id,
        categoryIds: [cat.id],
        actorUserId: ownerId,
      })
    }
    const admin = await templateStoreService.listForAdmin({
      scope,
      page: 1,
      perPage: 10,
    })
    expect(admin.storeUrl).toBe(`${APP_URL}/store`)
    const byName = Object.fromEntries(admin.listings.map((l) => [l.name, l]))
    expect(byName.Live.status).toBe("published")
    expect(byName.Live.templatePageUrl).toBe(
      `${APP_URL}/t/template?id=${live.id}&key=${live.shareToken}`,
    )
    expect(byName.Off).toMatchObject({
      status: "shareDisabled",
      templatePageUrl: null,
    })
    expect(admin.listings.every((l) => l.installCount === 0)).toBe(true)

    mocks.resolveServingHost.mockClear()
    const published = await templateStoreService.listPublished({ tenantId })
    expect(mocks.resolveServingHost).toHaveBeenCalledTimes(1)
    expect(published.templates).toHaveLength(1)
    expect(published.templates[0]).toMatchObject({
      templateId: live.id,
      shareToken: live.shareToken,
      shareUrl: `${APP_URL}/t/template?id=${live.id}&key=${live.shareToken}`,
      categoryIds: [cat.id],
    })
    expect(published.categories).toEqual([{ id: cat.id, name: "C" }])
  })

  test("a tenant without a custom domain gets no store link, since the platform host would open another store", async () => {
    const { scope } = await seedTenant("no-domain")
    mocks.resolveServingHost.mockResolvedValueOnce({
      tenantId: "1",
      appUrl: "https://platform.example.test",
    })

    const admin = await templateStoreService.listForAdmin({
      scope,
      page: 1,
      perPage: 5,
    })

    expect(admin.storeUrl).toBeNull()
  })

  test("an owner with no tenant gets an empty store and cannot write", async () => {
    const [owner] = await db
      .insert(userModel)
      .values({ email: `store-svc-none-${suffix}@example.test` })
      .returning({ id: userModel.id })
    userIds.push(owner.id)
    const scope = { kind: "owner", ownerId: owner.id } as const
    expect(
      await templateStoreService.listForAdmin({ scope, page: 1, perPage: 5 }),
    ).toMatchObject({ listings: [], total: 0 })
    await expect(
      templateStoreService.createCategory({
        scope,
        name: "x",
        actorUserId: owner.id,
      }),
    ).rejects.toMatchObject({ code: "templateStoreCategoryUnavailable" })
    await expect(
      templateStoreService.addListing({
        scope,
        templateId: "1",
        categoryIds: ["1"],
        actorUserId: owner.id,
      }),
    ).rejects.toMatchObject({ code: "templateStoreTemplateUnavailable" })
  })
})
