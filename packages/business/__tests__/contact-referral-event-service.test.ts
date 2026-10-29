import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertIgnoreDuplicate: vi.fn(),
  findLatestAdTouchId: vi.fn(),
  listRecentAds: vi.fn(),
  listAdIdsByContacts: vi.fn(),
  recordActivity: vi.fn(),
  aggregateAdTouchStats: vi.fn(),
  aggregateMetaLinkedConversions: vi.fn(),
  setLocalStatementTimeout: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    marker: "db",
    transaction: (run: (tx: unknown) => unknown) => run({ marker: "tx" }),
  },
  isStatementTimeoutError: (error: unknown) =>
    error instanceof Error && error.message === "statement timeout",
}))
vi.mock("@chatbotx.io/database/statement-timeout", () => ({
  setLocalStatementTimeout: mocks.setLocalStatementTimeout,
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactReferralEventRepository: {
    insertIgnoreDuplicate: mocks.insertIgnoreDuplicate,
    findLatestAdTouchId: mocks.findLatestAdTouchId,
    listRecentAds: mocks.listRecentAds,
    listAdIdsByContacts: mocks.listAdIdsByContacts,
    aggregateAdTouchStats: mocks.aggregateAdTouchStats,
    aggregateMetaLinkedConversions: mocks.aggregateMetaLinkedConversions,
  },
}))

vi.mock("../src/contact-activity", () => ({
  contactActivityService: { record: mocks.recordActivity },
}))

import { CONTACT_AD_IDS_LIMIT } from "@chatbotx.io/database/partials"
import { contactReferralEventService } from "../src/contact-referral-event"

const identity = {
  workspaceId: "1",
  contactId: "2",
  contactInboxId: "3",
  channel: "messenger",
}
const occurrence = {
  occurredAt: new Date("2026-10-20T08:00:00Z"),
  eventKey: "m",
}

describe("contactReferralEventService.recordAdTouches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("appends one ad event per touch with the caller's identity", async () => {
    const tx = { marker: "tx" } as never

    await contactReferralEventService.recordAdTouches(
      {
        ...identity,
        referral: { adId: "ad-1", source: "ADS", gclid: "gclid-1234567890" },
        occurrence,
      },
      tx,
    )

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledTimes(2)
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        ...identity,
        type: "ad",
        provider: "meta",
        dedupKey: "ad:ad-1:m",
      }),
      tx,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ad", provider: "google" }),
      tx,
    )
  })

  test("writes nothing for an organic referral", async () => {
    await contactReferralEventService.recordAdTouches({
      ...identity,
      referral: { ref: "promo" },
      occurrence,
    })

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [] }),
    )
  })

  test("marks the contact as having clicked the ad, in the same transaction", async () => {
    const tx = { marker: "tx" } as never

    await contactReferralEventService.recordAdTouches(
      {
        ...identity,
        referral: { adId: "120", source: "ADS" },
        occurrence,
      },
      tx,
    )

    expect(mocks.recordActivity).toHaveBeenCalledWith({
      entries: [
        {
          activityType: "adClicked",
          contactId: "2",
          occurredAt: occurrence.occurredAt,
          referenceId: "120",
          referenceType: "ad",
        },
      ],
      tx,
      workspaceId: "1",
    })
  })

  test("lets a database failure propagate so the job retries", async () => {
    mocks.insertIgnoreDuplicate.mockRejectedValueOnce(new Error("db down"))

    await expect(
      contactReferralEventService.recordAdTouches({
        ...identity,
        referral: { adId: "ad-1", source: "ADS" },
        occurrence,
      }),
    ).rejects.toThrow("db down")
  })
})

describe("contactReferralEventService.findAttributedTouchId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("is null, without a query, when the conversion has no contact inbox", async () => {
    await expect(
      contactReferralEventService.findAttributedTouchId({
        workspaceId: "1",
        contactInboxId: null,
        provider: "meta",
      }),
    ).resolves.toBeNull()
    expect(mocks.findLatestAdTouchId).not.toHaveBeenCalled()
  })

  test("returns the touch the repository finds for the click", async () => {
    mocks.findLatestAdTouchId.mockResolvedValueOnce("touch-9")

    await expect(
      contactReferralEventService.findAttributedTouchId({
        workspaceId: "1",
        contactInboxId: "3",
        provider: "google",
        clickId: "gclid-1234567890",
      }),
    ).resolves.toBe("touch-9")
    expect(mocks.findLatestAdTouchId).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        contactInboxId: "3",
        provider: "google",
        clickId: "gclid-1234567890",
      },
      expect.anything(),
    )
  })
})

describe("contactReferralEventService.listLabelsByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("names an ad by its headline and id", async () => {
    mocks.listRecentAds.mockResolvedValueOnce([
      { adId: "120", title: "Summer sale" },
    ])

    await expect(
      contactReferralEventService.listLabelsByIds({
        workspaceId: "1",
        ids: ["120"],
      }),
    ).resolves.toEqual([{ id: "120", name: "Summer sale (120)" }])
    expect(mocks.listRecentAds).toHaveBeenCalledWith(
      { workspaceId: "1", adIds: ["120"], limit: 1 },
      expect.anything(),
    )
  })

  test("names an ad that is no longer recent by its id instead of reporting it deleted", async () => {
    mocks.listRecentAds.mockResolvedValueOnce([])

    await expect(
      contactReferralEventService.listLabelsByIds({
        workspaceId: "1",
        ids: ["999"],
      }),
    ).resolves.toEqual([{ id: "999", name: "999" }])
  })

  test("looks nothing up for no ids", async () => {
    await expect(
      contactReferralEventService.listLabelsByIds({
        workspaceId: "1",
        ids: [],
      }),
    ).resolves.toEqual([])
    expect(mocks.listRecentAds).not.toHaveBeenCalled()
  })
})

describe("contactReferralEventService.getAdStats", () => {
  const input = {
    workspaceId: "1",
    from: "2026-10-01",
    to: "2026-10-30",
    tz: "UTC",
    limit: 50,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listRecentAds.mockResolvedValue([])
    mocks.aggregateMetaLinkedConversions.mockResolvedValue([])
  })

  test("defaults to the last 7 days ending today when no range is given", async () => {
    mocks.aggregateAdTouchStats.mockResolvedValueOnce([])
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"))
    try {
      await contactReferralEventService.getAdStats({
        workspaceId: "1",
        tz: "UTC",
        limit: 50,
      })
    } finally {
      vi.useRealTimers()
    }

    const range = mocks.aggregateAdTouchStats.mock.calls.at(-1)?.[0]
    expect(range.since.toISOString()).toBe("2026-10-22T00:00:00.000Z")
    expect(range.until.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-10-28T00:00:00.000Z").getTime(),
    )
  })

  test("reads the range in the viewer's timezone under a statement timeout", async () => {
    mocks.aggregateAdTouchStats.mockResolvedValueOnce([])

    await contactReferralEventService.getAdStats({
      ...input,
      tz: "Asia/Ho_Chi_Minh",
      channel: "messenger",
    })

    expect(mocks.setLocalStatementTimeout).toHaveBeenCalledWith(
      { marker: "tx" },
      "15s",
    )
    expect(mocks.aggregateAdTouchStats).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        since: new Date("2026-09-30T17:00:00.000Z"),
        until: new Date("2026-10-30T16:59:59.999Z"),
        channel: "messenger",
        limit: 50,
      },
      { marker: "tx" },
    )
  })

  test("joins touch counts, headlines and the conversions credited to each ad", async () => {
    mocks.aggregateAdTouchStats.mockResolvedValueOnce([
      {
        adId: "120",
        title: "Summer sale",
        anyTouchContacts: 5,
        firstTouchContacts: 3,
      },
      {
        adId: "121",
        title: null,
        anyTouchContacts: 2,
        firstTouchContacts: 2,
      },
    ])
    mocks.aggregateMetaLinkedConversions.mockResolvedValueOnce([
      { adId: "120", eventType: "lead", currency: null, count: 4, amount: "0" },
      {
        adId: "120",
        eventType: "purchase",
        currency: "USD",
        count: 2,
        amount: "150.50",
      },
      {
        adId: "120",
        eventType: "purchase",
        currency: "VND",
        count: 1,
        amount: "500000",
      },
    ])

    await expect(
      contactReferralEventService.getAdStats(input),
    ).resolves.toEqual([
      {
        adId: "120",
        title: "Summer sale",
        anyTouchContacts: 5,
        firstTouchContacts: 3,
        leads: 4,
        purchases: 3,
        revenue: [
          { currency: "USD", amount: "150.50" },
          { currency: "VND", amount: "500000" },
        ],
      },
      {
        adId: "121",
        title: null,
        anyTouchContacts: 2,
        firstTouchContacts: 2,
        leads: 0,
        purchases: 0,
        revenue: [],
      },
    ])
    expect(mocks.aggregateMetaLinkedConversions).toHaveBeenCalledWith(
      expect.objectContaining({ adIds: ["120", "121"] }),
      { marker: "tx" },
    )
  })

  test("looks up no conversions when no ad was touched", async () => {
    mocks.aggregateAdTouchStats.mockResolvedValueOnce([])

    await expect(
      contactReferralEventService.getAdStats(input),
    ).resolves.toEqual([])
    expect(mocks.aggregateMetaLinkedConversions).toHaveBeenCalledWith(
      expect.objectContaining({ adIds: [] }),
      { marker: "tx" },
    )
  })

  test("a report that runs past its timeout asks the caller to narrow it", async () => {
    mocks.aggregateAdTouchStats.mockRejectedValueOnce(
      new Error("statement timeout"),
    )

    await expect(contactReferralEventService.getAdStats(input)).rejects.toThrow(
      "The report took too long",
    )
  })

  test("any other failure is not disguised as a timeout", async () => {
    mocks.aggregateAdTouchStats.mockRejectedValueOnce(new Error("db down"))

    await expect(contactReferralEventService.getAdStats(input)).rejects.toThrow(
      "db down",
    )
  })
})

describe("contactReferralEventService.listAdIdsByContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("asks for a page of contacts in one call, capped at the shared per-contact limit, under a statement timeout", async () => {
    const lists = new Map([["1", ["1001", "1002"]]])
    mocks.listAdIdsByContacts.mockResolvedValueOnce(lists)

    await expect(
      contactReferralEventService.listAdIdsByContacts({
        workspaceId: "ws-1",
        contactIds: ["1", "2"],
      }),
    ).resolves.toBe(lists)

    expect(mocks.listAdIdsByContacts).toHaveBeenCalledTimes(1)
    expect(mocks.listAdIdsByContacts).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        contactIds: ["1", "2"],
        limitPerContact: CONTACT_AD_IDS_LIMIT,
      },
      { marker: "tx" },
    )
    // The timeout is set on the same transaction the query runs in.
    expect(mocks.setLocalStatementTimeout).toHaveBeenCalledWith(
      { marker: "tx" },
      "15s",
    )
  })

  test("lets a failed or timed out query fail the caller instead of returning a partial page", async () => {
    mocks.listAdIdsByContacts.mockRejectedValueOnce(
      new Error("statement timeout"),
    )

    await expect(
      contactReferralEventService.listAdIdsByContacts({
        workspaceId: "ws-1",
        contactIds: ["1"],
      }),
    ).rejects.toThrow("statement timeout")
  })
})
