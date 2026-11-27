// @vitest-environment node

/**
 * Parity of the cached template store against the live SQL it replaces: on a
 * real Postgres (and Redis), the cached path must deep-equal the repository's
 * own queries plus the old service mapping, in the same order, for every filter
 * combination. The oracle below is the pre-cache `listPublished` /
 * `countPublished`, kept here verbatim so it never drifts with the code under test.
 * Commits for real; each run deletes its tenants, workspace, templates and users.
 */

import { db, eq, inArray, sql } from "@chatbotx.io/database/client"
import {
  knownTemplateChannels,
  TEMPLATE_STORE_MAX_LISTINGS,
  type TemplateChannel,
} from "@chatbotx.io/database/partials"
import {
  cacheVersionRepository,
  templateStoreRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateModel,
  templateStoreListingCategoryModel,
  templateStoreListingModel,
  tenantModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { isBigintId, likeContains } from "@chatbotx.io/database/utils"
import { cacheConnections } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { isLocale, type Locale } from "@chatbotx.io/utils/ui-locale"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

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

vi.mock("../../src/platform/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/platform/settings")>()),
  resolveServingHost: mocks.resolveServingHost,
}))

const { templateStoreService } = await import(
  "../../src/template/store.service"
)
const { bumpTemplateStoreVersion, readTemplateStoreSnapshot } = await import(
  "../../src/template/store-cache"
)
const { projectPublished, countVisible } = await import(
  "../../src/template/store-snapshot"
)
const { classifyStoreListingForLocale } = await import(
  "../../src/template/store-audience"
)
const { buildTemplateShareUrl } = await import("../../src/template/share-url")

const databaseUrl = realDatabaseUrl()
const APP_URL = "https://reseller.example.test"
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const BASE_TIME = Date.parse("2026-01-01T00:00:00Z")

type ListInput = Parameters<typeof templateStoreService.listPublished>[0]

/** The pre-cache `listPublished`, verbatim apart from taking the host as a constant. */
const oracleListPublished = async (input: ListInput, appUrl = APP_URL) => {
  const matchesNothing =
    input.categoryId !== undefined && !isBigintId(input.categoryId)
  const [categories, rows] = await Promise.all([
    templateStoreRepository.listPublishedCategories(input.tenantId),
    matchesNothing
      ? []
      : templateStoreRepository.listPublishedTemplates({
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          keyword: input.keyword,
          language: input.language,
          channel: input.channel,
        }),
  ])
  const { viewerLocale } = input
  return {
    categories,
    templates: rows.map((row) => {
      const languages = row.languages.filter(isLocale)
      return {
        templateId: row.templateId,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        publisherName: row.publisherName,
        categoryIds: row.categoryIds,
        languages,
        channels: knownTemplateChannels(row.channels),
        section: viewerLocale
          ? classifyStoreListingForLocale(languages, viewerLocale)
          : "primary",
        shareToken: row.shareToken,
        shareUrl: buildTemplateShareUrl(appUrl, row),
      }
    }),
  }
}

describe.skipIf(!databaseUrl)("template store cache parity", () => {
  const userIds: string[] = []
  const tenantIds: string[] = []
  let workspaceId: string
  let tenantA: string
  let tenantB: string
  const listingIds = new Map<string, string>()
  const categoryIdsByName = new Map<string, string>()
  let listSpy: MockInstance
  let snapshotSpy: MockInstance

  const seedTenant = async (label: string): Promise<string> => {
    const [owner] = await db
      .insert(userModel)
      .values({ email: `parity-${label}-${suffix}@example.test` })
      .returning({ id: userModel.id })
    userIds.push(owner.id)
    const [tenant] = await db
      .insert(tenantModel)
      .values({ ownerId: owner.id })
      .returning({ id: tenantModel.id })
    tenantIds.push(tenant.id)
    return tenant.id
  }

  const insertTemplate = async (
    tenantId: string,
    overrides: Partial<typeof templateModel.$inferInsert> = {},
  ): Promise<string> => {
    const [row] = await db
      .insert(templateModel)
      .values({
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
      .returning({ id: templateModel.id })
    return row.id
  }

  const insertCategory = async (
    tenantId: string,
    name: string,
  ): Promise<string> => {
    const row = await templateStoreRepository.createCategory(
      { tenantId, name, createdBy: null },
      db,
    )
    categoryIdsByName.set(`${tenantId}:${name}`, row.id)
    await bumpTemplateStoreVersion(tenantId, db)
    return row.id
  }

  /** A listing of `tenantId` over a template with these overrides, linked to `categories`. */
  const insertListing = async (
    label: string,
    tenantId: string,
    template: Partial<typeof templateModel.$inferInsert>,
    options: {
      categories?: string[]
      languages?: Locale[]
      channels?: string[]
      templateTenantId?: string
    } = {},
  ): Promise<string> => {
    const templateId = await insertTemplate(
      options.templateTenantId ?? tenantId,
      {
        name: label,
        ...template,
      },
    )
    const [row] = await db
      .insert(templateStoreListingModel)
      .values({
        id: createId(),
        tenantId,
        templateId,
        languages: options.languages ?? [],
        channels: (options.channels ?? []) as TemplateChannel[],
      })
      .returning({ id: templateStoreListingModel.id })
    if (options.categories?.length) {
      await db.insert(templateStoreListingCategoryModel).values(
        options.categories.map((categoryId) => ({
          listingId: row.id,
          categoryId,
        })),
      )
    }
    listingIds.set(label, row.id)
    await bumpTemplateStoreVersion(tenantId, db)
    return row.id
  }

  const setCreatedAt = async (listingId: string, offsetSeconds: number) => {
    await db.execute(
      sql`update "TemplateStoreListing" set "createdAt" = ${new Date(BASE_TIME + offsetSeconds * 1000).toISOString()}::timestamptz where "id" = ${listingId}`,
    )
  }

  const seedTenantA = async () => {
    const shop = await insertCategory(tenantA, "Shop")
    const support = await insertCategory(tenantA, "Support")
    const onlyExpired = await insertCategory(tenantA, "Only expired")
    await insertCategory(tenantA, "Empty")
    const foreign = await insertCategory(tenantB, "Foreign")
    const DAY = 86_400_000
    const specs: {
      label: string
      template?: Partial<typeof templateModel.$inferInsert>
      options?: Parameters<typeof insertListing>[3]
      at: number
    }[] = [
      {
        label: "Shop Bot",
        template: { publisherName: "Acme" },
        options: { categories: [shop, support] },
        at: 0,
      },
      {
        label: "Zalo helper",
        template: { publisherName: null },
        options: { languages: ["vi"], channels: ["zalo"] },
        at: 0,
      },
      {
        label: "ΣΑΣ sigma",
        options: {
          categories: [shop, foreign],
          languages: ["en", "xx-gone" as Locale],
          channels: ["whatsapp", "bogus"],
        },
        at: 0,
      },
      { label: "İstanbul", template: { publisherName: "İSTANBUL Co" }, at: 5 },
      {
        label: "100% real_deal \\ path",
        template: { publisherName: "50% _off_" },
        options: { categories: [support] },
        at: 6,
      },
      { label: "  spaced  name ", at: 7 },
      {
        label: "Tiếng Việt chào",
        template: { publisherName: "Hà Nội" },
        options: { languages: ["vi"] },
        at: 8,
      },
      {
        label: "Unknown channels only",
        options: { channels: ["bogus"] },
        at: 9,
      },
      {
        label: "Share off",
        template: { shareEnabled: false },
        options: { categories: [shop] },
        at: 10,
      },
      {
        label: "Expired",
        template: { shareExpiresAt: new Date(Date.now() - DAY) },
        options: { categories: [onlyExpired] },
        at: 11,
      },
      {
        label: "Future",
        template: { shareExpiresAt: new Date(Date.now() + DAY) },
        options: { categories: [shop] },
        at: 12,
      },
      {
        label: "Soft deleted",
        template: { deletedAt: new Date() },
        options: { categories: [shop] },
        at: 13,
      },
      {
        label: "Other tenant's template",
        options: { categories: [shop], templateTenantId: tenantB },
        at: 14,
      },
    ]
    for (const spec of specs) {
      const id = await insertListing(
        spec.label,
        tenantA,
        spec.template ?? {},
        spec.options,
      )
      await setCreatedAt(id, spec.at)
    }
    for (const [label, expiry] of [
      ["Infinity", "infinity"],
      ["Minus infinity", "-infinity"],
    ] as const) {
      const id = await insertListing(label, tenantA, {}, { categories: [shop] })
      await db.execute(
        sql`update "Template" set "shareExpiresAt" = ${expiry}::timestamptz where "name" = ${label} and "tenantId" = ${tenantA}`,
      )
      await setCreatedAt(id, 15)
    }
  }

  const seedTenantB = async () => {
    const own = await insertCategory(tenantB, "Own")
    for (const [index, label] of ["B one", "B two"].entries()) {
      const id = await insertListing(label, tenantB, {}, { categories: [own] })
      await setCreatedAt(id, index)
    }
  }

  beforeAll(async () => {
    mocks.resolveServingHost.mockImplementation((tenantId: string) =>
      Promise.resolve({ tenantId, appUrl: APP_URL }),
    )
    const [owner] = await db
      .insert(userModel)
      .values({ email: `parity-ws-${suffix}@example.test` })
      .returning({ id: userModel.id })
    userIds.push(owner.id)
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `parity-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    workspaceId = workspace.id
    tenantA = await seedTenant("a")
    tenantB = await seedTenant("b")
    await seedTenantB()
    await seedTenantA()
  }, 120_000)

  // The vitest preset restores spies after each test, so they are created per test.
  beforeEach(() => {
    listSpy = vi.spyOn(templateStoreRepository, "listPublishedTemplates")
    snapshotSpy = vi.spyOn(templateStoreRepository, "readSnapshot")
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await db
      .delete(templateModel)
      .where(inArray(templateModel.tenantId, tenantIds))
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.execute(
      sql`delete from "CacheVersion" where "namespace" = 'template-store' and "scopeId" in (${sql.join(
        tenantIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    await db.delete(tenantModel).where(inArray(tenantModel.id, tenantIds))
    await db.delete(userModel).where(inArray(userModel.id, userIds))
    const redis = await cacheConnections.useExisting()
    await redis.del(
      ...tenantIds.map((id) => `template-store:v1:${id}:snapshot`),
    )
  }, 60_000)

  describe("every filter combination", () => {
    const firstShop = () => categoryIdsByName.get(`${tenantA}:Shop`) as string
    const keywords: (string | undefined)[] = [
      undefined,
      "",
      "   ",
      "shop",
      "  shop  ",
      "zzzz-nothing",
      "%",
      "_",
      "\\",
      "100%",
      "ΣΑΣ",
      "σας",
      "İ",
      "istanbul",
      "tiếng",
      "VIỆT",
      " spaced ",
    ]
    const languages: (Locale | undefined)[] = [undefined, "vi", "en"]
    const channels: (TemplateChannel | undefined)[] = [
      undefined,
      "zalo",
      "whatsapp",
    ]
    const viewers: (Locale | undefined)[] = [undefined, "vi", "en"]

    test("listPublished deep-equals the live SQL and never runs the SQL list on a cached tenant", async () => {
      const categoryIds: (string | undefined)[] = [
        undefined,
        firstShop(),
        `000${firstShop()}`,
        "999999999999",
        "not-a-number",
        "99999999999999999999",
        "",
      ]
      let compared = 0
      for (const categoryId of categoryIds) {
        for (const keyword of keywords) {
          for (const language of languages) {
            for (const channel of channels) {
              for (const viewerLocale of viewers) {
                const input: ListInput = {
                  tenantId: tenantA,
                  categoryId,
                  keyword,
                  language,
                  channel,
                  viewerLocale,
                }
                const before = listSpy.mock.calls.length
                const actual = await templateStoreService.listPublished(input)
                expect(listSpy.mock.calls.length).toBe(before)
                const expected = await oracleListPublished(input)
                expect(actual, JSON.stringify(input)).toEqual(expected)
                compared += 1
              }
            }
          }
        }
      }
      expect(compared).toBe(
        categoryIds.length *
          keywords.length *
          languages.length *
          channels.length *
          viewers.length,
      )
    }, 300_000)

    test("the seeded catalog is not trivially empty", async () => {
      const all = await templateStoreService.listPublished({
        tenantId: tenantA,
      })
      const names = all.templates.map((template) => template.name)
      expect(names).toEqual(
        expect.arrayContaining([
          "Shop Bot",
          "Zalo helper",
          "ΣΑΣ sigma",
          "İstanbul",
          "Future",
          "Infinity",
        ]),
      )
      expect(names).not.toContain("Expired")
      expect(names).not.toContain("Share off")
      expect(names).not.toContain("Soft deleted")
      expect(names).not.toContain("Minus infinity")
      expect(names).not.toContain("Other tenant's template")
      expect(all.categories.map((category) => category.name)).toEqual([
        "Shop",
        "Support",
      ])
    })

    test("countPublished matches the templates the live catalog lists", async () => {
      const onlyExpired = await seedTenant("only-expired")
      await insertListing("Only expired listing", onlyExpired, {
        shareExpiresAt: new Date(Date.now() - 1000),
      })
      const empty = await seedTenant("empty")
      for (const tenantId of [tenantA, tenantB, onlyExpired, empty]) {
        const before = listSpy.mock.calls.length
        const actual = await templateStoreService.countPublished({ tenantId })
        expect(listSpy.mock.calls.length).toBe(before)
        const live = await templateStoreService.listPublished({ tenantId })
        expect(actual).toBe(live.templates.length)
      }
      expect(
        await templateStoreService.countPublished({ tenantId: tenantA }),
      ).toBeGreaterThan(0)
      expect(
        await templateStoreService.countPublished({ tenantId: onlyExpired }),
      ).toBe(0)
    })
  })

  describe("expiry at the database clock", () => {
    test("a share expiring exactly at now() is visible, one microsecond earlier is not", async () => {
      const tenant = await seedTenant("exact-now")
      const earlier = await insertListing("minus-one", tenant, {})
      const exact = await insertListing("at-now", tenant, {})
      const later = await insertListing("plus-one", tenant, {})
      expect([earlier, exact, later]).toHaveLength(3)
      await db.transaction(async (tx) => {
        const result = await tx.execute<{ t: string }>(
          sql`select floor(extract(epoch from now()) * 1000000)::bigint::text as t`,
        )
        const nowMicros = result.rows[0].t
        // Committed on other connections after this transaction fixed its now().
        for (const [name, delta] of [
          ["minus-one", -1],
          ["at-now", 0],
          ["plus-one", 1],
        ] as const) {
          await db.execute(
            sql`update "Template" set "shareExpiresAt" = 'epoch'::timestamptz + ((${nowMicros}::bigint + ${delta}) * interval '1 microsecond') where "name" = ${name} and "tenantId" = ${tenant}`,
          )
        }
        const oracle = await templateStoreRepository.listPublishedTemplates(
          { tenantId: tenant },
          tx,
        )
        const snapshot = await templateStoreRepository.readSnapshot(tenant)
        // The snapshot was loaded after `nowMicros`; pin its clock to the
        // transaction's now() so this compares exactly the instant SQL used.
        const pinned = { ...snapshot, loadedAtMicros: nowMicros }
        const projected = projectPublished(
          pinned,
          {},
          nowMicros,
          APP_URL,
        ).templates.map((template) => template.name)
        expect(oracle.map((row) => row.name).sort()).toEqual([
          "at-now",
          "plus-one",
        ])
        expect([...projected].sort()).toEqual(["at-now", "plus-one"])
        expect(countVisible(pinned, nowMicros)).toBe(2)
        // One microsecond later the exact-now share is gone, like SQL at now()+1us.
        const next = (BigInt(nowMicros) + 1n).toString()
        expect(
          projectPublished(pinned, {}, next, APP_URL).templates.map(
            (template) => template.name,
          ),
        ).toEqual(["plus-one"])
      })
    })

    test("a listing committed and already expired between the version read and the load is evaluated at the load's time", async () => {
      const tenant = await seedTenant("interleave")
      const request = await cacheVersionRepository.read({
        namespace: "template-store",
        scopeId: tenant,
      })
      const expiresAtMicros = (
        BigInt(request.databaseNowMicros) + 1000n
      ).toString()
      await insertListing("late", tenant, {})
      await db.execute(
        sql`update "Template" set "shareExpiresAt" = 'epoch'::timestamptz + (${expiresAtMicros}::bigint * interval '1 microsecond') where "name" = 'late' and "tenantId" = ${tenant}`,
      )
      await db.execute(sql`select pg_sleep(0.05)`)
      const snapshot = await templateStoreRepository.readSnapshot(tenant)
      expect(BigInt(snapshot.loadedAtMicros)).toBeGreaterThan(
        BigInt(expiresAtMicros),
      )
      const oracle = await templateStoreRepository.listPublishedTemplates({
        tenantId: tenant,
      })
      expect(oracle).toHaveLength(0)
      // The request's own (older) clock would still show it; the load's clock must win.
      expect(
        projectPublished(snapshot, {}, request.databaseNowMicros, APP_URL)
          .templates,
      ).toHaveLength(0)
      expect(countVisible(snapshot, request.databaseNowMicros)).toBe(0)
    })
  })

  describe("over the listing cap", () => {
    test("directly inserted over-cap data takes the SQL path for each method", async () => {
      const tenant = await seedTenant("overcap")
      const total = TEMPLATE_STORE_MAX_LISTINGS + 1
      const templateRows = Array.from({ length: total }, (_, index) => ({
        id: createId(),
        workspaceId,
        tenantId: tenant,
        name: `bulk ${index}`,
        selection: { mode: "all" } as never,
        payload: {} as never,
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `bulk-${index}-${suffix}`,
        shareEnabled: true,
        defaultPermissions: { allowEdit: true, allowDelete: true } as never,
      }))
      await db.insert(templateModel).values(templateRows)
      await db.insert(templateStoreListingModel).values(
        templateRows.map((row) => ({
          id: createId(),
          tenantId: tenant,
          templateId: row.id,
        })),
      )
      const listBefore = listSpy.mock.calls.length
      const expected = await oracleListPublished({ tenantId: tenant })
      const afterOracle = listSpy.mock.calls.length
      const actual = await templateStoreService.listPublished({
        tenantId: tenant,
      })
      expect(listSpy.mock.calls.length).toBe(afterOracle + 1)
      expect(afterOracle).toBe(listBefore + 1)
      expect(actual).toEqual(expected)
      expect(actual.templates).toHaveLength(TEMPLATE_STORE_MAX_LISTINGS)

      // Over the cap the count falls back to one bounded live read.
      const countListBefore = listSpy.mock.calls.length
      expect(
        await templateStoreService.countPublished({ tenantId: tenant }),
      ).toBe(expected.templates.length)
      expect(listSpy.mock.calls.length).toBe(countListBefore + 1)
    }, 120_000)
  })

  describe("tenant isolation", () => {
    test("interleaved requests only see their own store, and a write to A leaves B's entry in use", async () => {
      const [a1, b1, a2, b2] = await Promise.all([
        templateStoreService.listPublished({ tenantId: tenantA }),
        templateStoreService.listPublished({ tenantId: tenantB }),
        templateStoreService.listPublished({ tenantId: tenantA }),
        templateStoreService.listPublished({ tenantId: tenantB }),
      ])
      expect(a1).toEqual(a2)
      expect(b1).toEqual(b2)
      expect(b1.templates.map((template) => template.name).sort()).toEqual([
        "B one",
        "B two",
      ])
      expect(
        a1.templates.some((template) => template.name.startsWith("B ")),
      ).toBe(false)

      const loadsBefore = snapshotSpy.mock.calls.length
      await db.execute(
        sql`update "Template" set "name" = 'Shop Bot' where "name" = 'Shop Bot' and "tenantId" = ${tenantA}`,
      )
      await db.execute(
        sql`update "Template" set "description" = 'changed' where "name" = 'Shop Bot' and "tenantId" = ${tenantA}`,
      )
      // Direct SQL does not announce itself; the app write paths do this.
      await bumpTemplateStoreVersion(tenantA, db)
      await templateStoreService.listPublished({ tenantId: tenantB })
      expect(snapshotSpy.mock.calls.length).toBe(loadsBefore)
      const changed = await templateStoreService.listPublished({
        tenantId: tenantA,
      })
      expect(snapshotSpy.mock.calls.length).toBe(loadsBefore + 1)
      expect(
        changed.templates.find((template) => template.name === "Shop Bot")
          ?.description,
      ).toBe("changed")
      expect(changed).toEqual(await oracleListPublished({ tenantId: tenantA }))
    })

    test("a value planted under one tenant's key with another tenant's snapshot is rejected", async () => {
      const victim = await seedTenant("planted")
      await insertListing("victim listing", victim, {})
      const { version } = await cacheVersionRepository.read({
        namespace: "template-store",
        scopeId: victim,
      })
      const foreign = await templateStoreRepository.readSnapshot(tenantB)
      const redis = await cacheConnections.useExisting()
      // SuperJSON of plain JSON is `{ json }`.
      await redis.hset(`template-store:v1:${victim}:snapshot`, {
        v: version,
        d: JSON.stringify({ json: { ...foreign, version } }),
      })
      // A live entry (positive TTL): without one the read rejects it on PTTL
      // before reaching the tenant check, and this test proves nothing.
      await redis.pexpire(`template-store:v1:${victim}:snapshot`, 60_000)
      const loadsBefore = snapshotSpy.mock.calls.length
      const result = await readTemplateStoreSnapshot(victim)
      // The foreign entry was refused by the tenant check and the victim's
      // own snapshot was reloaded from the database.
      expect(snapshotSpy.mock.calls.length).toBe(loadsBefore + 1)
      expect(result.snapshot.tenantId).toBe(victim)
      expect(result.snapshot.rows.map((row) => row.name)).toEqual([
        "victim listing",
      ])
      const served = await templateStoreService.listPublished({
        tenantId: victim,
      })
      expect(served.templates.map((template) => template.name)).toEqual([
        "victim listing",
      ])
    })
  })

  test("keyword literal handed to the projection is the unescaped lowered pattern", async () => {
    const { keywordLiteral } = await readTemplateStoreSnapshot(
      tenantA,
      "  50%_\\x ",
    )
    expect(keywordLiteral).toBe("50%_\\x")
    expect(likeContains("50%_\\x")).toBe("%50\\%\\_\\\\x%")
  })
})
