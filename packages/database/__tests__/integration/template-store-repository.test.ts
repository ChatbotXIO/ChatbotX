// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  type DatabaseClient,
  eq,
  inArray,
  isUniqueViolationError,
  sql,
} from "../../src/client"
import {
  TEMPLATE_STORE_MAX_LISTINGS,
  type TemplateStoreListingStatus,
} from "../../src/partials/template-store"
import { relations } from "../../src/relations"
import { templateStoreRepository as repo } from "../../src/repositories/template-store/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

describe.skipIf(!databaseUrl)("template store repository", () => {
  let pool: Pool
  let db: DatabaseClient
  const userIds: string[] = []
  const tenantIds: string[] = []
  let actorId: string
  let workspaceId: string
  let tenantB: string

  const insertTenant = async (label: string) => {
    const [owner] = await db
      .insert(schema.userModel)
      .values({ email: `store-${label}-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    userIds.push(owner.id)
    const [tenant] = await db
      .insert(schema.tenantModel)
      .values({ ownerId: owner.id })
      .returning({ id: schema.tenantModel.id })
    tenantIds.push(tenant.id)
    return { tenantId: tenant.id, ownerId: owner.id }
  }

  const insertTemplate = async (
    tenantId: string,
    overrides: Partial<typeof schema.templateModel.$inferInsert> = {},
  ) => {
    const [template] = await db
      .insert(schema.templateModel)
      .values({
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
      .returning({ id: schema.templateModel.id })
    return template.id
  }

  /** Approves a template in a tenant's store under the given categories. */
  const approve = async (
    tenantId: string,
    templateId: string,
    categoryIds: string[],
  ) => {
    const row = await repo.createListing(
      { tenantId, templateId, createdBy: null },
      db,
    )
    if (!row) {
      throw new Error("listing exists")
    }
    await repo.replaceListingCategories(
      { tenantId, listingId: row.id, categoryIds },
      db,
    )
    return row.id
  }

  const category = async (tenantId: string, name: string) => {
    const row = await repo.createCategory(
      { tenantId, name, createdBy: null },
      db,
    )
    return row.id
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl as string, max: 6 })
    db = drizzle({ client: pool, schema, relations })
    const a = await insertTenant("a")
    const b = await insertTenant("b")
    tenantB = b.tenantId
    actorId = a.ownerId
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `store-${suffix}`, ownerId: actorId })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
  })

  afterAll(async () => {
    await db
      .delete(schema.templateModel)
      .where(inArray(schema.templateModel.tenantId, tenantIds))
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, workspaceId))
    await db
      .delete(schema.tenantModel)
      .where(inArray(schema.tenantModel.id, tenantIds))
    await db
      .delete(schema.userModel)
      .where(inArray(schema.userModel.id, userIds))
    await pool.end()
  })

  test("categories get distinct ascending ranks and the name is unique case-insensitively", async () => {
    const t = (await insertTenant("ranks")).tenantId
    await category(t, "Flows")
    await category(t, "Bots")
    const ranks = (await repo.listCategoriesWithCounts(t, db)).map((c) => [
      c.name,
      c.rank,
    ])
    expect(ranks).toEqual([
      ["Flows", 0],
      ["Bots", 1],
    ])
    const duplicate = await repo
      .createCategory({ tenantId: t, name: "flows", createdBy: null }, db)
      .catch((error: unknown) => error)
    expect(isUniqueViolationError(duplicate)).toBe(true)
    // The same name in another tenant is fine.
    await expect(category(tenantB, `Flows ${suffix}`)).resolves.toBeTruthy()
  })

  test("a raw insert that omits rank reads the database default 0", async () => {
    const t = (await insertTenant("default")).tenantId
    const result = await db.execute<{ rank: number }>(
      sql`insert into "TemplateStoreCategory" ("id","tenantId","name") values (${`9${Date.now()}${Math.floor(Math.random() * 1000)}`}, ${t}, 'x') returning "rank"`,
    )
    expect(result.rows[0].rank).toBe(0)
  })

  test("concurrent category creates under the store lock get distinct ranks", async () => {
    const t = (await insertTenant("race")).tenantId
    await Promise.all(
      ["a", "b", "c", "d", "e"].map((name) =>
        db.transaction(async (tx) => {
          await repo.lockTenantStore(t, tx)
          await repo.createCategory({ tenantId: t, name, createdBy: null }, tx)
        }),
      ),
    )
    const ranks = (await repo.listCategoriesWithCounts(t, db)).map(
      (c) => c.rank,
    )
    expect(ranks).toEqual([0, 1, 2, 3, 4])
  })

  test("setCategoryOrder renumbers tied ranks to 0..n-1 in the given order", async () => {
    const t = (await insertTenant("order")).tenantId
    const [x, y, z] = [
      await category(t, "X"),
      await category(t, "Y"),
      await category(t, "Z"),
    ]
    await repo.setCategoryOrder({ tenantId: t, orderedIds: [z, x, y] }, db)
    expect(await repo.listCategoryIdsInOrder(t, db)).toEqual([z, x, y])
    // Another tenant's id in the list changes nothing outside the tenant.
    await repo.setCategoryOrder({ tenantId: tenantB, orderedIds: [x] }, db)
    expect(await repo.listCategoryIdsInOrder(t, db)).toEqual([z, x, y])
  })

  test("approving the same template twice yields one listing", async () => {
    const t = (await insertTenant("dup")).tenantId
    const templateId = await insertTemplate(t)
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        db.transaction(async (tx) => {
          await repo.lockTenantStore(t, tx)
          return await repo.createListing(
            { tenantId: t, templateId, createdBy: null },
            tx,
          )
        }),
      ),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await repo.countListings(t, db)).toBe(1)
  })

  test("replaceListingCategories refuses foreign listings and categories and writes nothing", async () => {
    const t = (await insertTenant("scope")).tenantId
    const own = await category(t, "Own")
    const foreign = await category(tenantB, `Foreign ${suffix}`)
    const listingId = await approve(t, await insertTemplate(t), [own])

    expect(
      await repo.replaceListingCategories(
        { tenantId: t, listingId, categoryIds: [own, foreign] },
        db,
      ),
    ).toBe("categoryUnavailable")
    expect(
      await repo.replaceListingCategories(
        { tenantId: tenantB, listingId, categoryIds: [foreign] },
        db,
      ),
    ).toBe("listingUnavailable")
    const links = await db
      .select()
      .from(schema.templateStoreListingCategoryModel)
      .where(eq(schema.templateStoreListingCategoryModel.listingId, listingId))
    expect(links.map((l) => l.categoryId)).toEqual([own])
  })

  test("the public catalog shows only live same-tenant templates with every category", async () => {
    const t = (await insertTenant("public")).tenantId
    const flows = await category(t, "Flows")
    const bots = await category(t, "Bots")
    await category(t, "Empty")
    const live = await insertTemplate(t, { name: "Live" })
    const off = await insertTemplate(t, { name: "Off", shareEnabled: false })
    const expired = await insertTemplate(t, {
      name: "Expired",
      shareExpiresAt: new Date(Date.now() - 60_000),
    })
    const future = await insertTemplate(t, {
      name: "Future",
      shareExpiresAt: new Date(Date.now() + 3_600_000),
    })
    const deleted = await insertTemplate(t, {
      name: "Deleted",
      deletedAt: new Date(),
    })
    const uncategorised = await insertTemplate(t, { name: "Uncategorised" })
    await approve(t, live, [flows, bots])
    await approve(t, off, [flows])
    await approve(t, expired, [flows])
    await approve(t, future, [bots])
    await approve(t, deleted, [flows])
    await approve(t, uncategorised, [])

    const all = await repo.listPublishedTemplates({ tenantId: t }, db)
    // A template with no category is published too: it shows under "All".
    expect(all.map((r) => r.name).sort()).toEqual([
      "Future",
      "Live",
      "Uncategorised",
    ])
    expect(all.find((r) => r.name === "Uncategorised")?.categoryIds).toEqual([])
    const liveRow = all.find((r) => r.name === "Live")
    expect(liveRow?.categoryIds.slice().sort()).toEqual([flows, bots].sort())

    // Filtering by one category keeps every membership and does not duplicate the row.
    const inFlows = await repo.listPublishedTemplates(
      { tenantId: t, categoryId: flows },
      db,
    )
    expect(inFlows).toHaveLength(1)
    expect(inFlows[0].categoryIds).toHaveLength(2)

    expect(
      (await repo.listPublishedCategories(t, db)).map((c) => c.name),
    ).toEqual(["Flows", "Bots"])
    // Another tenant sees nothing of this store.
    expect(
      await repo.listPublishedTemplates({ tenantId: tenantB }, db),
    ).toEqual([])
  })

  test("a share expiring exactly now is still live, like isShareLive", async () => {
    const t = (await insertTenant("equal")).tenantId
    const c = await category(t, "C")
    const id = await insertTemplate(t, { name: "Equal" })
    await approve(t, id, [c])
    await db.transaction(async (tx) => {
      await tx
        .update(schema.templateModel)
        .set({ shareExpiresAt: sql`now()` })
        .where(eq(schema.templateModel.id, id))
      expect(
        await repo.listPublishedTemplates({ tenantId: t }, tx),
      ).toHaveLength(1)
    })
  })

  test("a template of another tenant is not published even if listed", async () => {
    const t = (await insertTenant("foreign-template")).tenantId
    const c = await category(t, "C")
    const foreignTemplate = await insertTemplate(tenantB, { name: "Foreign" })
    await approve(t, foreignTemplate, [c])
    expect(await repo.listPublishedTemplates({ tenantId: t }, db)).toEqual([])
  })

  test("public keyword matches name or publisher with literal wildcards", async () => {
    const t = (await insertTenant("kw")).tenantId
    const c = await category(t, "C")
    await approve(
      t,
      await insertTemplate(t, { name: "Sales 100%", publisherName: "Acme" }),
      [c],
    )
    await approve(
      t,
      await insertTemplate(t, { name: "Support", publisherName: "Bolt" }),
      [c],
    )
    const names = async (keyword: string) =>
      (await repo.listPublishedTemplates({ tenantId: t, keyword }, db)).map(
        (r) => r.name,
      )
    expect(await names("sales")).toEqual(["Sales 100%"])
    expect(await names("bolt")).toEqual(["Support"])
    expect(await names("%")).toEqual(["Sales 100%"])
    expect(await names("_")).toEqual([])
  })

  describe("admin listing", () => {
    let t: string
    let cFlows: string
    let cBots: string
    let ids: Record<string, string>

    beforeAll(async () => {
      t = (await insertTenant("admin")).tenantId
      cFlows = await category(t, "Flows")
      cBots = await category(t, "Bots")
      ids = {
        pub: await insertTemplate(t, { name: "Alpha 50%" }),
        off: await insertTemplate(t, { name: "Beta", shareEnabled: false }),
        gone: await insertTemplate(t, { name: "Gamma", deletedAt: new Date() }),
        none: await insertTemplate(t, { name: "Delta" }),
      }
      await approve(t, ids.pub, [cFlows, cBots])
      await approve(t, ids.off, [cFlows])
      await approve(t, ids.gone, [cBots])
      await approve(t, ids.none, [])
    })

    const list = async (
      extra: Partial<Parameters<typeof repo.listListingsForAdmin>[0]> = {},
    ) =>
      await repo.listListingsForAdmin(
        { tenantId: t, page: 1, perPage: 10, ...extra },
        db,
      )

    test("each status filter selects exactly its rows, matching the resolver order", async () => {
      const expected: Record<TemplateStoreListingStatus, string[]> = {
        // A template with no category ("Delta") is published as well.
        published: ["Alpha 50%", "Delta"],
        shareDisabled: ["Beta"],
        templateUnavailable: ["Gamma"],
      }
      for (const [status, names] of Object.entries(expected)) {
        const { rows, total } = await list({
          status: status as TemplateStoreListingStatus,
        })
        expect(rows.map((r) => r.name).sort()).toEqual(names)
        expect(total).toBe(names.length)
      }
    })

    test("keyword, category and numeric id combine and wildcards are literal", async () => {
      expect((await list({ keyword: "alpha" })).rows).toHaveLength(1)
      expect((await list({ keyword: "%" })).rows.map((r) => r.name)).toEqual([
        "Alpha 50%",
      ])
      expect((await list({ keyword: "_" })).total).toBe(0)
      expect(
        (await list({ keyword: ids.off })).rows.map((r) => r.name),
      ).toEqual(["Beta"])
      expect((await list({ categoryId: cFlows })).total).toBe(2)
      expect(
        (await list({ categoryId: cFlows, status: "published" })).rows.map(
          (r) => r.name,
        ),
      ).toEqual(["Alpha 50%"])
      // A numeric keyword larger than a bigint cannot break the query.
      expect((await list({ keyword: "99999999999999999999" })).total).toBe(0)
    })

    test("rows carry their categories, total counts all pages, and other tenants are invisible", async () => {
      const first = await list({ perPage: 3 })
      expect(first.rows).toHaveLength(3)
      expect(first.total).toBe(4)
      expect((await list({ perPage: 3, page: 2 })).rows).toHaveLength(1)
      const alpha = (await list({ keyword: "Alpha" })).rows[0]
      expect(alpha.categories.map((c) => c.name)).toEqual(["Flows", "Bots"])
      expect(alpha.ownerWorkspaceId).toBe(workspaceId)
      expect(
        (
          await repo.listListingsForAdmin(
            { tenantId: tenantB, page: 1, perPage: 10 },
            db,
          )
        ).total,
      ).toBe(0)
    })
  })

  test("deleting a category cascades its links and leaves the listing published, uncategorised", async () => {
    const t = (await insertTenant("cascade")).tenantId
    const c = await category(t, "C")
    await approve(t, await insertTemplate(t), [c])
    expect(await repo.deleteCategory({ id: c, tenantId: tenantB }, db)).toBe(
      false,
    )
    expect(await repo.deleteCategory({ id: c, tenantId: t }, db)).toBe(true)
    const { rows } = await repo.listListingsForAdmin(
      { tenantId: t, page: 1, perPage: 5, status: "published" },
      db,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].categories).toEqual([])
  })

  test("candidate search excludes listed, deleted and foreign templates and is bounded", async () => {
    const t = (await insertTenant("candidates")).tenantId
    const free = await insertTemplate(t, { name: "Free 100%" })
    const listed = await insertTemplate(t, { name: "Free listed" })
    await insertTemplate(t, { name: "Free deleted", deletedAt: new Date() })
    await insertTemplate(tenantB, { name: "Free foreign" })
    await approve(t, listed, [])
    const names = async (keyword?: string, limit = 20) =>
      (
        await repo.searchTemplateCandidates({ tenantId: t, keyword, limit }, db)
      ).map((c) => c.name)

    expect(await names("free")).toEqual(["Free 100%"])
    expect(await names("%")).toEqual(["Free 100%"])
    expect(await names("_")).toEqual([])
    expect(await names(free)).toEqual(["Free 100%"])
    expect(await names("99999999999999999999")).toEqual([])
    await insertTemplate(t, { name: "Second" })
    expect(await names(undefined, 1)).toHaveLength(1)
  })

  test("the listing cap constant bounds the public query", () => {
    expect(TEMPLATE_STORE_MAX_LISTINGS).toBe(500)
  })
})
