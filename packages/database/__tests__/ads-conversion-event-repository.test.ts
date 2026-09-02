import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { adsConversionEventRepository } from "../src/repositories/ads-conversion-event/repository"
import {
  adsConversionEventModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../src/schema"

const NO_DEDUP_UNIQUE_INDEX = /no dedup unique index/

type Chain = {
  select: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
  innerJoin: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  groupBy: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}

function createQueryChain(result: unknown[]): Chain {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  } satisfies Chain

  chain.select.mockReturnValue(chain)
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.groupBy.mockResolvedValue(result)
  chain.orderBy.mockReturnValue(chain)
  chain.limit.mockResolvedValue(result)

  return chain
}

describe("adsConversionEventRepository account filters", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("joins IntegrationWhatsapp when counting conversations for a selected account", async () => {
    const chain = createQueryChain([{ adId: "ad-1", conversations: 1 }])

    await adsConversionEventRepository.countCtwaConversationsByAd(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationWhatsappModel,
      expect.anything(),
    )
    expect(chain.innerJoin).toHaveBeenCalledTimes(2)
  })

  test("adds a where condition when counting conversion events for a selected account", async () => {
    const chain = createQueryChain([
      {
        adId: "ad-1",
        eventType: "lead",
        count: 1,
        purchaseValue: null,
      },
    ])

    await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(chain.groupBy).toHaveBeenCalled()
  })

  test("counts conversion events by CAPI status", async () => {
    const chain = createQueryChain([
      { capiStatus: "sent", count: 3 },
      { capiStatus: "failed", count: 1 },
    ])

    const result = await adsConversionEventRepository.countByCapiStatus(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(chain.groupBy).toHaveBeenCalled()
    expect(result).toEqual([
      { capiStatus: "sent", count: 3 },
      { capiStatus: "failed", count: 1 },
    ])
  })

  test("joins IntegrationWhatsapp when counting daily conversations for a selected account", async () => {
    const chain = createQueryChain([
      { date: "2026-08-01", adId: "ad-1", conversations: 1 },
    ])

    const result =
      await adsConversionEventRepository.countCtwaConversationsByDayAndAd(
        {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-1",
          since: new Date("2026-08-01T00:00:00.000Z"),
          until: new Date("2026-08-10T23:59:59.999Z"),
        },
        { select: chain.select } as never,
      )

    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationWhatsappModel,
      expect.anything(),
    )
    expect(chain.innerJoin).toHaveBeenCalledTimes(2)
    expect(chain.groupBy).toHaveBeenCalled()
    expect(result).toEqual([
      { date: "2026-08-01", adId: "ad-1", conversations: 1 },
    ])
  })

  test("groups daily conversion events by date, adId, and eventType", async () => {
    const chain = createQueryChain([
      { date: "2026-08-01", adId: "ad-1", eventType: "lead", count: 2 },
    ])

    const result =
      await adsConversionEventRepository.countConversionEventsByDayAndAd(
        {
          workspaceId: "ws-1",
          since: new Date("2026-08-01T00:00:00.000Z"),
          until: new Date("2026-08-10T23:59:59.999Z"),
        },
        { select: chain.select } as never,
      )

    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(chain.groupBy).toHaveBeenCalled()
    expect(result).toEqual([
      { date: "2026-08-01", adId: "ad-1", eventType: "lead", count: 2 },
    ])
  })

  test("adds a where condition when counting CAPI statuses for a selected account", async () => {
    const chain = createQueryChain([{ capiStatus: "sent", count: 3 }])

    await adsConversionEventRepository.countByCapiStatus(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(chain.groupBy).toHaveBeenCalled()
  })

  test("listExportSegmentRows resolves conversations via the shared ctwaRetarget predicate, keeping the same output shape", async () => {
    const chain = createQueryChain([
      {
        id: "ci-1",
        contactId: "c-1",
        contactName: "Ada",
        phoneNumber: "+84900000000",
        email: null,
        adId: "ad-1",
        occurredAt: new Date("2026-07-15T00:00:00.000Z"),
      },
    ])

    const result = await adsConversionEventRepository.listExportSegmentRows(
      {
        workspaceId: "ws-1",
        segment: "conversations",
        adId: "ad-1",
        since: new Date("2026-07-01T00:00:00.000Z"),
        until: new Date("2026-07-31T23:59:59.999Z"),
        limit: 50,
      },
      { select: chain.select } as never,
    )

    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(result).toEqual([
      {
        id: "ci-1",
        contactId: "c-1",
        contactName: "Ada",
        phoneNumber: "+84900000000",
        email: null,
        adId: "ad-1",
        occurredAt: new Date("2026-07-15T00:00:00.000Z"),
      },
    ])
  })

  test("listExportSegmentRows resolves leads/purchases via the shared ctwaRetarget predicate, keeping the same output shape", async () => {
    const chain = createQueryChain([
      {
        id: "ace-1",
        contactId: "c-2",
        contactName: "Bob",
        phoneNumber: "+84900000001",
        email: "bob@example.com",
        adId: "ad-2",
        occurredAt: new Date("2026-07-20T00:00:00.000Z"),
      },
    ])

    const result = await adsConversionEventRepository.listExportSegmentRows(
      {
        workspaceId: "ws-1",
        segment: "purchases",
        since: new Date("2026-07-01T00:00:00.000Z"),
        until: new Date("2026-07-31T23:59:59.999Z"),
        limit: 50,
      },
      { select: chain.select } as never,
    )

    expect(chain.where).toHaveBeenCalledWith(expect.anything())
    expect(result).toEqual([
      {
        id: "ace-1",
        contactId: "c-2",
        contactName: "Bob",
        phoneNumber: "+84900000001",
        email: "bob@example.com",
        adId: "ad-2",
        occurredAt: new Date("2026-07-20T00:00:00.000Z"),
      },
    ])
  })
})

function createInsertChain(returningRows: unknown[]) {
  const onConflictDoNothing = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue(returningRows),
  }))
  const values = vi.fn(() => ({ onConflictDoNothing }))
  const insert = vi.fn(() => ({ values }))
  return { insert, onConflictDoNothing }
}

describe("adsConversionEventRepository.insertIgnoreDuplicate — per-channel conflict target", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("targets the whatsapp partial unique index for channel='whatsapp'", async () => {
    const { insert, onConflictDoNothing } = createInsertChain([
      { id: "event-wa", channel: "whatsapp" },
    ])

    const result = await adsConversionEventRepository.insertIgnoreDuplicate(
      {
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
        wabaId: "waba-1",
        source: "rule",
        eventType: "lead",
        ctwaClid: "clid-1",
        contactInboxId: "ci-1",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceEventId: "src-1",
        capiStatus: "pending",
      } as never,
      { insert } as never,
    )

    expect(result).toEqual({ id: "event-wa", channel: "whatsapp" })
    expect(onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          adsConversionEventModel.workspaceId,
          adsConversionEventModel.integrationWhatsappId,
          adsConversionEventModel.source,
          adsConversionEventModel.sourceEventId,
        ],
      }),
    )
  })

  test("targets the messenger partial unique index for channel='messenger'", async () => {
    const { insert, onConflictDoNothing } = createInsertChain([
      { id: "event-me", channel: "messenger" },
    ])

    await adsConversionEventRepository.insertIgnoreDuplicate(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
        source: "rule",
        eventType: "lead",
        contactInboxId: "ci-1",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceEventId: "src-2",
        capiStatus: "pending",
      } as never,
      { insert } as never,
    )

    expect(onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          adsConversionEventModel.workspaceId,
          adsConversionEventModel.integrationMessengerId,
          adsConversionEventModel.source,
          adsConversionEventModel.sourceEventId,
        ],
      }),
    )
  })

  test("targets the instagram partial unique index for channel='instagram'", async () => {
    const { insert, onConflictDoNothing } = createInsertChain([
      { id: "event-ig", channel: "instagram" },
    ])

    await adsConversionEventRepository.insertIgnoreDuplicate(
      {
        workspaceId: "ws-1",
        channel: "instagram",
        integrationInstagramId: "ig-1",
        source: "rule",
        eventType: "lead",
        contactInboxId: "ci-1",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceEventId: "src-3",
        capiStatus: "pending",
      } as never,
      { insert } as never,
    )

    expect(onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          adsConversionEventModel.workspaceId,
          adsConversionEventModel.integrationInstagramId,
          adsConversionEventModel.source,
          adsConversionEventModel.sourceEventId,
        ],
      }),
    )
  })

  test("dedup: a second insert of the same messenger row (same conflict target + values) returns null", async () => {
    // onConflictDoNothing resolving [] mirrors what Postgres returns when the
    // row already exists under the messenger partial unique index — the
    // insert is silently skipped rather than erroring.
    const { insert } = createInsertChain([])

    const result = await adsConversionEventRepository.insertIgnoreDuplicate(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
        source: "rule",
        eventType: "lead",
        contactInboxId: "ci-1",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceEventId: "src-2",
        capiStatus: "pending",
      } as never,
      { insert } as never,
    )

    expect(result).toBeNull()
  })

  test("dedup semantics: the same sourceEventId under whatsapp vs messenger channels targets two distinct partial unique indexes, so both can insert", async () => {
    const waChain = createInsertChain([{ id: "event-wa", channel: "whatsapp" }])
    await adsConversionEventRepository.insertIgnoreDuplicate(
      {
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
        wabaId: "waba-1",
        source: "rule",
        eventType: "lead",
        ctwaClid: "clid-1",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceEventId: "shared-source-event-id",
        capiStatus: "pending",
      } as never,
      { insert: waChain.insert } as never,
    )

    const meChain = createInsertChain([
      { id: "event-me", channel: "messenger" },
    ])
    await adsConversionEventRepository.insertIgnoreDuplicate(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
        source: "rule",
        eventType: "lead",
        occurredAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceEventId: "shared-source-event-id",
        capiStatus: "pending",
      } as never,
      { insert: meChain.insert } as never,
    )

    const waTarget = waChain.onConflictDoNothing.mock.calls[0][0].target
    const meTarget = meChain.onConflictDoNothing.mock.calls[0][0].target
    expect(waTarget).toContain(adsConversionEventModel.integrationWhatsappId)
    expect(meTarget).toContain(adsConversionEventModel.integrationMessengerId)
    expect(waTarget).not.toEqual(meTarget)
  })

  test("throws for a channel with no dedup unique index (facebook is a dead channel)", async () => {
    const { insert } = createInsertChain([])

    await expect(
      adsConversionEventRepository.insertIgnoreDuplicate(
        {
          workspaceId: "ws-1",
          channel: "facebook",
          source: "rule",
          eventType: "lead",
          occurredAt: new Date("2026-08-10T00:00:00.000Z"),
          sourceEventId: "src-4",
          capiStatus: "pending",
        } as never,
        { insert } as never,
      ),
    ).rejects.toThrow(NO_DEDUP_UNIQUE_INDEX)
  })
})

describe("adsConversionEventRepository.findAttributionByAdReferral", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("messenger: joins IntegrationMessenger and returns the attributed contact inbox row", async () => {
    const chain = createQueryChain([
      { id: "ci-1", referral: { adId: "ad-1", source: "ADS" } },
    ])

    const result =
      await adsConversionEventRepository.findAttributionByAdReferral(
        {
          workspaceId: "ws-1",
          channel: "messenger",
          integrationMessengerId: "im-1",
          contactInboxId: "ci-1",
        },
        { select: chain.select } as never,
      )

    expect(result).toEqual({
      id: "ci-1",
      referral: { adId: "ad-1", source: "ADS" },
    })
    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationMessengerModel,
      expect.anything(),
    )
  })

  test("messenger: the where clause pins ContactInbox.channel = 'messenger' (shared-inbox guard)", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.findAttributionByAdReferral(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
        contactInboxId: "ci-1",
      },
      { select: chain.select } as never,
    )

    // An IntegrationMessenger and IntegrationInstagram row may share an
    // inboxId, so the integration join alone cannot stop cross-channel
    // attribution — the channel predicate must be in the WHERE clause.
    const query = new PgDialect().sqlToQuery(
      chain.where.mock.calls[0][0] as never,
    )
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("messenger")
  })

  test("messenger: returns null when no row matches (SHORTLINK referral, or no referral at all)", async () => {
    const chain = createQueryChain([])

    const result =
      await adsConversionEventRepository.findAttributionByAdReferral(
        {
          workspaceId: "ws-1",
          channel: "messenger",
          integrationMessengerId: "im-1",
          contactInboxId: "ci-1",
        },
        { select: chain.select } as never,
      )

    expect(result).toBeNull()
  })

  test("messenger: short-circuits without querying when integrationMessengerId is missing", async () => {
    const chain = createQueryChain([])

    const result =
      await adsConversionEventRepository.findAttributionByAdReferral(
        {
          workspaceId: "ws-1",
          channel: "messenger",
          contactInboxId: "ci-1",
        },
        { select: chain.select } as never,
      )

    expect(result).toBeNull()
    expect(chain.select).not.toHaveBeenCalled()
  })

  test("instagram: joins IntegrationInstagram and returns the attributed contact inbox row", async () => {
    const chain = createQueryChain([
      { id: "ci-2", referral: { adId: "ad-2", source: "ADS" } },
    ])

    const result =
      await adsConversionEventRepository.findAttributionByAdReferral(
        {
          workspaceId: "ws-1",
          channel: "instagram",
          integrationInstagramId: "ig-1",
          contactInboxId: "ci-2",
        },
        { select: chain.select } as never,
      )

    expect(result).toEqual({
      id: "ci-2",
      referral: { adId: "ad-2", source: "ADS" },
    })
    expect(chain.innerJoin).toHaveBeenCalledWith(
      integrationInstagramModel,
      expect.anything(),
    )
  })

  test("instagram: short-circuits without querying when integrationInstagramId is missing", async () => {
    const chain = createQueryChain([])

    const result =
      await adsConversionEventRepository.findAttributionByAdReferral(
        {
          workspaceId: "ws-1",
          channel: "instagram",
          contactInboxId: "ci-2",
        },
        { select: chain.select } as never,
      )

    expect(result).toBeNull()
    expect(chain.select).not.toHaveBeenCalled()
  })
})

describe("adsConversionEventRepository.countAdConversationsByAd/ByDayAndAd — channel scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderWhere = (chain: Chain) =>
    new PgDialect().sqlToQuery(chain.where.mock.calls[0][0] as never)

  test("messenger without an integration id still excludes instagram-channel ContactInbox rows", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countAdConversationsByAd(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("messenger")
    expect(query.params).not.toContain("instagram")
  })

  test("instagram without an integration id still excludes messenger-channel ContactInbox rows", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countAdConversationsByAd(
      {
        workspaceId: "ws-1",
        channel: "instagram",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("instagram")
    expect(query.params).not.toContain("messenger")
  })

  test("messenger WITH an integration id keeps the channel scope alongside the EXISTS scope", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countAdConversationsByAd(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.sql).toContain("EXISTS")
    expect(query.params).toContain("messenger")
    expect(query.params).toContain("im-1")
  })

  test("instagram WITH an integration id keeps the channel scope alongside the EXISTS scope", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countAdConversationsByAd(
      {
        workspaceId: "ws-1",
        channel: "instagram",
        integrationInstagramId: "ig-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.sql).toContain("EXISTS")
    expect(query.params).toContain("instagram")
    expect(query.params).toContain("ig-1")
  })

  test("countAdConversationsByDayAndAd scopes messenger by channel even without an integration id", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countAdConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("messenger")
    expect(query.params).not.toContain("instagram")
  })

  test("countAdConversationsByDayAndAd scopes instagram by channel even without an integration id", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countAdConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        channel: "instagram",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("instagram")
    expect(query.params).not.toContain("messenger")
  })
})

describe("adsConversionEventRepository — event counts default to whatsapp when channel omitted", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderWhere = (chain: Chain) =>
    new PgDialect().sqlToQuery(chain.where.mock.calls[0][0] as never)

  test("countConversionEventsByAd without channel filters to whatsapp events only", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    // "channel omitted = whatsapp" — a legacy caller must never absorb
    // messenger/instagram events into numbers it labels as WhatsApp.
    const query = renderWhere(chain)
    expect(query.sql).toContain('"AdsConversionEvent"."channel" =')
    expect(query.params).toContain("whatsapp")
  })

  test("countByCapiStatus without channel filters to whatsapp events only", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countByCapiStatus(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"AdsConversionEvent"."channel" =')
    expect(query.params).toContain("whatsapp")
  })

  test("countConversionEventsByAd with an explicit channel filters to that channel", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).toContain('"AdsConversionEvent"."channel" =')
    expect(query.params).toContain("messenger")
    expect(query.params).not.toContain("whatsapp")
  })
})

describe("adsConversionEventRepository — allChannels ('All channels' Ads Analytics default)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderWhere = (chain: Chain) =>
    new PgDialect().sqlToQuery(chain.where.mock.calls[0][0] as never)

  test("countConversionEventsByAd with allChannels drops the channel eq-filter entirely", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        allChannels: true,
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).not.toContain('"AdsConversionEvent"."channel" =')
    expect(query.params).not.toContain("whatsapp")
  })

  test("countConversionEventsByAd with allChannels additionally groups by channel", async () => {
    const chain = createQueryChain([
      {
        adId: "ad-1",
        eventType: "lead",
        channel: "messenger",
        count: 1,
        purchaseValue: null,
      },
      {
        adId: "ad-1",
        eventType: "lead",
        channel: "instagram",
        count: 2,
        purchaseValue: null,
      },
    ])

    const result = await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        allChannels: true,
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    expect(chain.groupBy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
    expect(result).toEqual([
      {
        adId: "ad-1",
        eventType: "lead",
        channel: "messenger",
        count: 1,
        purchaseValue: null,
      },
      {
        adId: "ad-1",
        eventType: "lead",
        channel: "instagram",
        count: 2,
        purchaseValue: null,
      },
    ])
  })

  test("countConversionEventsByAd single-channel path is byte-identical whether allChannels is omitted or explicitly false", async () => {
    const chainOmitted = createQueryChain([])
    const chainFalse = createQueryChain([])

    await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chainOmitted.select } as never,
    )
    await adsConversionEventRepository.countConversionEventsByAd(
      {
        workspaceId: "ws-1",
        allChannels: false,
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chainFalse.select } as never,
    )

    const omittedQuery = new PgDialect().sqlToQuery(
      chainOmitted.where.mock.calls[0][0] as never,
    )
    const falseQuery = new PgDialect().sqlToQuery(
      chainFalse.where.mock.calls[0][0] as never,
    )
    expect(omittedQuery.sql).toBe(falseQuery.sql)
    expect(omittedQuery.params).toEqual(falseQuery.params)
    // Also unchanged shape vs. the pre-"all channels" single-channel path:
    // exactly 2 groupBy columns (adId, eventType), never 3.
    expect(chainOmitted.groupBy.mock.calls[0][0]).toBeDefined()
    expect(chainOmitted.groupBy.mock.calls[0]).toHaveLength(2)
  })

  test("countByCapiStatus with allChannels drops the channel eq-filter (delivery totals are channel-agnostic)", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countByCapiStatus(
      {
        workspaceId: "ws-1",
        allChannels: true,
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderWhere(chain)
    expect(query.sql).not.toContain('"AdsConversionEvent"."channel" =')
  })

  test("countAllChannelConversationsByAd reuses the ctwaClid-OR-ad-referral predicate and groups by (adId, channel)", async () => {
    const chain = createQueryChain([
      { adId: "ad-1", channel: "whatsapp", conversations: 3 },
      { adId: "ad-1", channel: "messenger", conversations: 1 },
      { adId: "ad-2", channel: "instagram", conversations: 5 },
    ])

    const result =
      await adsConversionEventRepository.countAllChannelConversationsByAd(
        {
          workspaceId: "ws-1",
          since: new Date("2026-08-01T00:00:00.000Z"),
          until: new Date("2026-08-10T23:59:59.999Z"),
        },
        { select: chain.select } as never,
      )

    const query = new PgDialect().sqlToQuery(
      chain.where.mock.calls[0][0] as never,
    )
    expect(query.sql).toContain("ctwaClid")
    expect(query.sql).toContain("'ADS'")
    expect(chain.groupBy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    )
    // Rows from all three channels, each carrying its own channel — the
    // business layer folds these into `adId`-keyed rows (identity stays
    // `adId`, channel is a passenger label).
    expect(result).toEqual([
      { adId: "ad-1", channel: "whatsapp", conversations: 3 },
      { adId: "ad-1", channel: "messenger", conversations: 1 },
      { adId: "ad-2", channel: "instagram", conversations: 5 },
    ])
  })

  test("countAllChannelConversationsByDayAndAd groups by (date, adId, channel)", async () => {
    const chain = createQueryChain([
      {
        date: "2026-08-01",
        adId: "ad-1",
        channel: "whatsapp",
        conversations: 1,
      },
    ])

    const result =
      await adsConversionEventRepository.countAllChannelConversationsByDayAndAd(
        {
          workspaceId: "ws-1",
          since: new Date("2026-08-01T00:00:00.000Z"),
          until: new Date("2026-08-10T23:59:59.999Z"),
        },
        { select: chain.select } as never,
      )

    expect(chain.groupBy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
    expect(result).toEqual([
      {
        date: "2026-08-01",
        adId: "ad-1",
        channel: "whatsapp",
        conversations: 1,
      },
    ])
  })

  test("listExportSegmentRows (conversations) with allChannels selects the row's channel and keeps the shared any-channel predicate", async () => {
    const chain = createQueryChain([
      {
        id: "ci-1",
        contactId: "c-1",
        contactName: "Ada",
        phoneNumber: "+84900000000",
        email: null,
        adId: "ad-1",
        occurredAt: new Date("2026-07-15T00:00:00.000Z"),
        channel: "instagram",
      },
    ])

    const result = await adsConversionEventRepository.listExportSegmentRows(
      {
        workspaceId: "ws-1",
        segment: "conversations",
        allChannels: true,
        since: new Date("2026-07-01T00:00:00.000Z"),
        until: new Date("2026-07-31T23:59:59.999Z"),
        limit: 50,
      },
      { select: chain.select } as never,
    )

    expect(result).toEqual([
      {
        id: "ci-1",
        contactId: "c-1",
        contactName: "Ada",
        phoneNumber: "+84900000000",
        email: null,
        adId: "ad-1",
        occurredAt: new Date("2026-07-15T00:00:00.000Z"),
        channel: "instagram",
      },
    ])
  })

  test("listExportSegmentRows (leads/purchases) with allChannels selects the row's channel", async () => {
    const chain = createQueryChain([
      {
        id: "ace-1",
        contactId: "c-2",
        contactName: "Bob",
        phoneNumber: "+84900000001",
        email: "bob@example.com",
        adId: "ad-2",
        occurredAt: new Date("2026-07-20T00:00:00.000Z"),
        channel: "messenger",
      },
    ])

    const result = await adsConversionEventRepository.listExportSegmentRows(
      {
        workspaceId: "ws-1",
        segment: "purchases",
        allChannels: true,
        since: new Date("2026-07-01T00:00:00.000Z"),
        until: new Date("2026-07-31T23:59:59.999Z"),
        limit: 50,
      },
      { select: chain.select } as never,
    )

    expect(result).toEqual([
      {
        id: "ace-1",
        contactId: "c-2",
        contactName: "Bob",
        phoneNumber: "+84900000001",
        email: "bob@example.com",
        adId: "ad-2",
        occurredAt: new Date("2026-07-20T00:00:00.000Z"),
        channel: "messenger",
      },
    ])
  })
})

describe("adsConversionEventRepository day-bucketing — viewer timezone parameterization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Every day-bucketed `...ByDayAndAd` method's `select({ date: ... })` call
  // carries the day-bucketing `SQL` fragment under a `date` key — compile it
  // with the same `PgDialect().sqlToQuery` technique used elsewhere in this
  // file to assert the timezone reaches the query as a bound PARAMETER
  // (never string-interpolated), mirroring
  // `message-stats.repository.ts`'s `AT TIME ZONE ${timezone}`.
  const renderDateExpression = (chain: Chain) =>
    new PgDialect().sqlToQuery(
      (chain.select.mock.calls[0]?.[0] as { date: unknown }).date as never,
    )

  test("countCtwaConversationsByDayAndAd defaults day-bucketing to UTC when timezone is omitted", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countCtwaConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: chain.select } as never,
    )

    const query = renderDateExpression(chain)
    expect(query.sql).toContain("AT TIME ZONE")
    expect(query.params).toContain("UTC")
  })

  test("countCtwaConversationsByDayAndAd parameterizes AT TIME ZONE on the given viewer timezone", async () => {
    const chain = createQueryChain([])

    await adsConversionEventRepository.countCtwaConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
        timezone: "Asia/Saigon",
      },
      { select: chain.select } as never,
    )

    const query = renderDateExpression(chain)
    expect(query.sql).toContain("AT TIME ZONE")
    expect(query.params).toContain("Asia/Saigon")
    expect(query.params).not.toContain("UTC")
  })

  test("countAdConversationsByDayAndAd defaults to UTC and parameterizes an explicit viewer timezone", async () => {
    const defaultChain = createQueryChain([])
    await adsConversionEventRepository.countAdConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: defaultChain.select } as never,
    )
    expect(renderDateExpression(defaultChain).params).toContain("UTC")

    const tzChain = createQueryChain([])
    await adsConversionEventRepository.countAdConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
        timezone: "America/New_York",
      },
      { select: tzChain.select } as never,
    )
    expect(renderDateExpression(tzChain).params).toContain("America/New_York")
  })

  test("countAllChannelConversationsByDayAndAd defaults to UTC and parameterizes an explicit viewer timezone", async () => {
    const defaultChain = createQueryChain([])
    await adsConversionEventRepository.countAllChannelConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: defaultChain.select } as never,
    )
    expect(renderDateExpression(defaultChain).params).toContain("UTC")

    const tzChain = createQueryChain([])
    await adsConversionEventRepository.countAllChannelConversationsByDayAndAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
        timezone: "Asia/Saigon",
      },
      { select: tzChain.select } as never,
    )
    expect(renderDateExpression(tzChain).params).toContain("Asia/Saigon")
  })

  test("countConversionEventsByDayAndAd defaults to UTC and parameterizes an explicit viewer timezone", async () => {
    const defaultChain = createQueryChain([])
    await adsConversionEventRepository.countConversionEventsByDayAndAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      },
      { select: defaultChain.select } as never,
    )
    expect(renderDateExpression(defaultChain).params).toContain("UTC")

    const tzChain = createQueryChain([])
    await adsConversionEventRepository.countConversionEventsByDayAndAd(
      {
        workspaceId: "ws-1",
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
        timezone: "Asia/Saigon",
      },
      { select: tzChain.select } as never,
    )
    expect(renderDateExpression(tzChain).params).toContain("Asia/Saigon")
  })
})
