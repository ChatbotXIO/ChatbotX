import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import {
  contactReferralEventRepository,
  RECENT_AD_TOUCH_SCAN_LIMIT,
} from "../src/repositories/contact-referral-event/repository"
import { contactReferralEventModel } from "../src/schema"

const dialect = new PgDialect()
const render = (clause: SQL) => dialect.sqlToQuery(clause)

const createSelectTx = <T>(rows: T[]) => {
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn().mockReturnValue({ limit })
  const groupBy = vi.fn().mockReturnValue({ orderBy })
  const where = vi.fn().mockReturnValue({ limit, groupBy, orderBy })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return {
    tx: { select } as unknown as DatabaseClient,
    where,
    groupBy,
    orderBy,
    limit,
  }
}

describe("contactReferralEventRepository.listAdIdsByContact", () => {
  test("scopes to the workspace and contact, ad touches with an ad id, and bounds the result", async () => {
    const { tx, where, groupBy, limit } = createSelectTx([
      { adId: "ad-1" },
      { adId: "ad-2" },
    ])

    await expect(
      contactReferralEventRepository.listAdIdsByContact(
        { workspaceId: "ws-1", contactId: "c-1", limit: 50 },
        tx,
      ),
    ).resolves.toEqual(["ad-1", "ad-2"])

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"workspaceId" = $')
    expect(sql).toContain('"contactId" = $')
    expect(sql).toContain('"type" = $')
    expect(sql).toContain('"adId" is not null')
    expect(params).toContain("c-1")
    expect(params.slice(0, 2)).toEqual(["ws-1", "ad"])
    expect(groupBy).toHaveBeenCalledTimes(1)
    expect(limit).toHaveBeenCalledWith(50)
  })

  test("orders the distinct ads by their first touch, then by ad id", async () => {
    const { tx, orderBy } = createSelectTx([{ adId: "ad-1" }])

    await contactReferralEventRepository.listAdIdsByContact(
      { workspaceId: "ws-1", contactId: "c-1", limit: 50 },
      tx,
    )

    const ordering = (orderBy.mock.calls[0] as SQL[]).map(
      (clause) => render(clause).sql,
    )
    expect(ordering).toEqual([
      'min("ContactReferralEvent"."occurredAt") asc',
      '"ContactReferralEvent"."adId" asc',
    ])
  })

  test("drops a null ad id the database should never return", async () => {
    const { tx } = createSelectTx([{ adId: null }, { adId: "ad-1" }])

    await expect(
      contactReferralEventRepository.listAdIdsByContact(
        { workspaceId: "ws-1", contactId: "c-1", limit: 5 },
        tx,
      ),
    ).resolves.toEqual(["ad-1"])
  })
})

describe("contactReferralEventRepository.findLatestAdTouchId", () => {
  const input = {
    workspaceId: "ws-1",
    contactInboxId: "ci-1",
    provider: "google" as const,
  }

  test("takes the newest touch of the provider for the contact inbox", async () => {
    const { tx, where, orderBy, limit } = createSelectTx([{ id: "touch-9" }])

    await expect(
      contactReferralEventRepository.findLatestAdTouchId(input, tx),
    ).resolves.toBe("touch-9")

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"contactInboxId" = $')
    expect(sql).toContain('"provider" = $')
    expect(sql).not.toContain('"clickId"')
    expect(params).toEqual(["ws-1", "ad", "ci-1", "google"])
    expect(orderBy).toHaveBeenCalledTimes(1)
    expect(limit).toHaveBeenCalledWith(1)
  })

  test("pins the touch to its click id when the conversion names one", async () => {
    const { tx, where } = createSelectTx([{ id: "touch-9" }])

    await contactReferralEventRepository.findLatestAdTouchId(
      { ...input, clickId: "gclid-1234567890" },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"clickId" = $')
    expect(params).toContain("gclid-1234567890")
  })

  test("pins a touch without a click id to the ad the conversion was credited to", async () => {
    const { tx, where } = createSelectTx([{ id: "touch-9" }])

    await contactReferralEventRepository.findLatestAdTouchId(
      { ...input, provider: "meta", adId: "120" },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"adId" = $')
    expect(sql).not.toContain('"clickId"')
    expect(params).toContain("120")
  })

  test("a click id wins over the ad id", async () => {
    const { tx, where } = createSelectTx([{ id: "touch-9" }])

    await contactReferralEventRepository.findLatestAdTouchId(
      { ...input, clickId: "gclid-1234567890", adId: "120" },
      tx,
    )

    const { sql } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"clickId" = $')
    expect(sql).not.toContain('"adId" = $')
  })

  test("is null when no touch was logged", async () => {
    const { tx } = createSelectTx([])

    await expect(
      contactReferralEventRepository.findLatestAdTouchId(input, tx),
    ).resolves.toBeNull()
  })
})

describe("contactReferralEventRepository.insertIgnoreDuplicate", () => {
  test("conflicts on the workspace + contact inbox + dedup key unique index", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert } as unknown as DatabaseClient

    await expect(
      contactReferralEventRepository.insertIgnoreDuplicate(
        {
          workspaceId: "ws-1",
          contactId: "c-1",
          contactInboxId: "ci-1",
          channel: "messenger",
          type: "ad",
          occurredAt: new Date(),
          dedupKey: "ad:ad-1:mid-1",
        },
        tx,
      ),
    ).resolves.toBeNull()

    const [{ target }] = onConflictDoNothing.mock.calls[0] as [
      { target: { name: string }[] },
    ]
    expect(target.map((column) => column.name)).toEqual([
      "workspaceId",
      "contactInboxId",
      "dedupKey",
    ])
  })
})

describe("contactReferralEventRepository.listRecentAds", () => {
  /** Two selects: the bounded scan of the newest touches, then the grouping over it. */
  const createRecentAdsTx = (
    rows: { adId: string | null; title: string | null }[],
  ) => {
    const scanLimit = vi.fn().mockReturnValue({
      as: vi.fn().mockReturnValue({
        adId: contactReferralEventModel.adId,
        title: contactReferralEventModel.sourceUrl,
        occurredAt: contactReferralEventModel.occurredAt,
      }),
    })
    const scanOrderBy = vi.fn().mockReturnValue({ limit: scanLimit })
    const scanWhere = vi.fn().mockReturnValue({ orderBy: scanOrderBy })
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn().mockReturnValue({ limit })
    const groupBy = vi.fn().mockReturnValue({ orderBy })
    const where = vi.fn().mockReturnValue({ groupBy })
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: scanWhere }),
      })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where }) })
    return {
      tx: { select } as unknown as DatabaseClient,
      scanWhere,
      scanLimit,
      where,
      limit,
    }
  }

  test("scans only a bounded run of the workspace's newest ad touches", async () => {
    const { tx, scanWhere, scanLimit } = createRecentAdsTx([])

    await contactReferralEventRepository.listRecentAds(
      { workspaceId: "ws-1", limit: 50 },
      tx,
    )

    const { sql, params } = render(scanWhere.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"workspaceId" = $')
    expect(sql).toContain('"type" = $')
    expect(sql).toContain('"adId" is not null')
    expect(params.slice(0, 2)).toEqual(["ws-1", "ad"])
    expect(scanLimit).toHaveBeenCalledWith(RECENT_AD_TOUCH_SCAN_LIMIT)
  })

  test("only offers ad ids the Clicked ad filter accepts, before the scan limit", async () => {
    const { tx, scanWhere } = createRecentAdsTx([])

    await contactReferralEventRepository.listRecentAds(
      { workspaceId: "ws-1", limit: 50 },
      tx,
    )

    const { sql, params } = render(scanWhere.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"adId" ~ $')
    expect(sql).toContain('length("ContactReferralEvent"."adId")')
    expect(params).toContain("^[1-9]\\d*$")
    expect(params).toContain("9223372036854775807")
  })

  test("returns each ad with its headline, bounded by the limit", async () => {
    const { tx, limit } = createRecentAdsTx([
      { adId: "120", title: "Summer sale" },
      { adId: "121", title: null },
    ])

    await expect(
      contactReferralEventRepository.listRecentAds(
        { workspaceId: "ws-1", limit: 50 },
        tx,
      ),
    ).resolves.toEqual([
      { adId: "120", title: "Summer sale" },
      { adId: "121", title: null },
    ])
    expect(limit).toHaveBeenCalledWith(50)
  })

  test("escapes LIKE wildcards in the search so it cannot match everything", async () => {
    const { tx, where } = createRecentAdsTx([])

    await contactReferralEventRepository.listRecentAds(
      { workspaceId: "ws-1", limit: 50, search: "50%_off" },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain("ilike")
    expect(params).toEqual(["%50\\%\\_off%", "%50\\%\\_off%"])
  })

  test("narrows to the given ad ids for a label lookup", async () => {
    const { tx, where } = createRecentAdsTx([])

    await contactReferralEventRepository.listRecentAds(
      { workspaceId: "ws-1", limit: 2, adIds: ["120", "121"] },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain(" in (")
    expect(params).toEqual(["120", "121"])
  })

  test("drops a null ad id the database should never return", async () => {
    const { tx } = createRecentAdsTx([
      { adId: null, title: null },
      { adId: "120", title: null },
    ])

    await expect(
      contactReferralEventRepository.listRecentAds(
        { workspaceId: "ws-1", limit: 50 },
        tx,
      ),
    ).resolves.toEqual([{ adId: "120", title: null }])
  })
})

describe("contactReferralEventRepository.listAdTouchesByContact", () => {
  const createListTx = <T>(rows: T[]) => {
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    return {
      tx: { select } as unknown as DatabaseClient,
      where,
      orderBy,
      limit,
    }
  }

  test("scopes to the workspace and contact and fetches one row past the page", async () => {
    const { tx, where, limit } = createListTx([])

    await contactReferralEventRepository.listAdTouchesByContact(
      { workspaceId: "ws-1", contactId: "c-1", limit: 20 },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"workspaceId" = $')
    expect(sql).toContain('"contactId" = $')
    expect(sql).toContain('"type" = $')
    expect(params).toContain("c-1")
    expect(params.slice(0, 2)).toEqual(["ws-1", "ad"])
    expect(limit).toHaveBeenCalledWith(21)
  })

  test("orders newest first with the id as a stable tie-break", async () => {
    const { tx, orderBy } = createListTx([])

    await contactReferralEventRepository.listAdTouchesByContact(
      { workspaceId: "ws-1", contactId: "c-1", limit: 20 },
      tx,
    )

    const ordering = (orderBy.mock.calls[0] as SQL[]).map(
      (clause) => render(clause).sql,
    )
    expect(ordering).toEqual([
      '"ContactReferralEvent"."occurredAt" desc',
      '"ContactReferralEvent"."id" desc',
    ])
  })

  test("continues strictly after the cursor, breaking time ties by id", async () => {
    const { tx, where } = createListTx([])
    const occurredAt = new Date("2026-10-20T08:00:00.000Z")

    await contactReferralEventRepository.listAdTouchesByContact(
      {
        workspaceId: "ws-1",
        contactId: "c-1",
        limit: 20,
        cursor: { occurredAt, id: "77" },
      },
      tx,
    )

    const { sql, params } = render(where.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"occurredAt" < $')
    expect(sql).toContain('"occurredAt" = $')
    expect(sql).toContain('"id" < $')
    expect(params).toContain("77")
  })
})

describe("contactReferralEventRepository ad reports", () => {
  const createExecuteTx = (rows: unknown[]) => {
    const execute = vi.fn().mockResolvedValue({ rows })
    return { tx: { execute } as unknown as DatabaseClient, execute }
  }
  const since = new Date("2026-10-01T00:00:00.000Z")
  const until = new Date("2026-10-31T00:00:00.000Z")

  test("touch stats read only the workspace's range, by parameter", async () => {
    const { tx, execute } = createExecuteTx([
      {
        adId: "120",
        title: "Summer sale",
        anyTouchContacts: 5,
        firstTouchContacts: 3,
      },
    ])

    await expect(
      contactReferralEventRepository.aggregateAdTouchStats(
        { workspaceId: "ws-1", since, until, limit: 50 },
        tx,
      ),
    ).resolves.toEqual([
      {
        adId: "120",
        title: "Summer sale",
        anyTouchContacts: 5,
        firstTouchContacts: 3,
      },
    ])

    const { sql, params } = render(execute.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('"workspaceId" = $1::bigint')
    expect(sql).toContain('"occurredAt" >= $')
    // `until` is the last millisecond of the final day, so it is inclusive.
    expect(sql).toContain('"occurredAt" <= $')
    expect(sql).toContain('DISTINCT ON ("contactId")')
    // The headline comes from the range itself, not a second scan.
    expect(sql).toContain(`"metadata"->>'adTitle'`)
    expect(sql).not.toContain('"channel"')
    expect(params).toEqual([
      "ws-1",
      since.toISOString(),
      until.toISOString(),
      50,
    ])
  })

  test("touch stats can be narrowed to one channel without interpolating it", async () => {
    const { tx, execute } = createExecuteTx([])

    await contactReferralEventRepository.aggregateAdTouchStats(
      {
        workspaceId: "ws-1",
        since,
        until,
        channel: "messenger'; DROP TABLE x;--",
        limit: 5,
      },
      tx,
    )

    const { sql, params } = render(execute.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain('AND "channel" = $')
    expect(sql).not.toContain("DROP TABLE")
    expect(params).toContain("messenger'; DROP TABLE x;--")
  })

  test("linked conversions look up nothing for no ads", async () => {
    const { tx, execute } = createExecuteTx([])

    await expect(
      contactReferralEventRepository.aggregateMetaLinkedConversions(
        { workspaceId: "ws-1", since, until, adIds: [] },
        tx,
      ),
    ).resolves.toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  test("linked conversions join through the touch and bind every ad id", async () => {
    const { tx, execute } = createExecuteTx([])

    await contactReferralEventRepository.aggregateMetaLinkedConversions(
      { workspaceId: "ws-1", since, until, adIds: ["120", "121"] },
      tx,
    )

    const { sql, params } = render(execute.mock.calls[0]?.[0] as SQL)
    expect(sql).toContain(
      'JOIN "ContactReferralEvent" r ON r."id" = e."referralEventId"',
    )
    expect(sql).toContain("ANY(ARRAY[")
    expect(params).toEqual(expect.arrayContaining(["ws-1", "120", "121"]))
  })
})
