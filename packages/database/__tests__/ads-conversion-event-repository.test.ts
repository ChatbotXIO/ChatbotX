import { beforeEach, describe, expect, test, vi } from "vitest"
import { adsConversionEventRepository } from "../src/repositories/ads-conversion-event/repository"
import { integrationWhatsappModel } from "../src/schema"

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
