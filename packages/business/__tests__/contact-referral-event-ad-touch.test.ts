import { describe, expect, test } from "vitest"
import {
  toAdClickActivityEntries,
  toAdTouches,
} from "../src/contact-referral-event/ad-touch"

const occurrence = {
  occurredAt: new Date("2026-10-20T08:00:00.000Z"),
  eventKey: "mid-1",
}

describe("toAdTouches", () => {
  test("returns nothing without a referral", () => {
    expect(toAdTouches(null, occurrence)).toEqual([])
    expect(toAdTouches(undefined, occurrence)).toEqual([])
  })

  test("keys a WhatsApp click-to-ad touch by its ctwa click id", () => {
    const [touch] = toAdTouches(
      {
        ctwaClid: "ctwa-1",
        adId: "ad-1",
        source: "ad",
        sourceUrl: "https://fb.me/ad",
        adTitle: "Headline",
        adBody: "Body",
      },
      occurrence,
    )

    expect(touch).toMatchObject({
      provider: "meta",
      adId: "ad-1",
      clickIdType: "ctwa",
      clickId: "ctwa-1",
      dedupKey: "ctwa:ctwa-1",
      occurredAt: occurrence.occurredAt,
      metadata: { adTitle: "Headline", adBody: "Body", sourcePlatform: null },
    })
  })

  test("keys a Messenger ad touch by ad id and the carrying event", () => {
    const first = toAdTouches({ adId: "ad-1", source: "ADS" }, occurrence)
    const repeat = toAdTouches(
      { adId: "ad-1", source: "ADS" },
      { ...occurrence, eventKey: "mid-2" },
    )

    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      provider: "meta",
      adId: "ad-1",
      clickIdType: null,
      clickId: null,
      dedupKey: "ad:ad-1:mid-1",
    })
    // A second click of the same ad is a distinct touch; a retry of the same
    // event is the same key.
    expect(repeat[0]?.dedupKey).toBe("ad:ad-1:mid-2")
    expect(
      toAdTouches({ adId: "ad-1", source: "ADS" }, occurrence)[0]?.dedupKey,
    ).toBe(first[0]?.dedupKey)
  })

  test("cannot record a Meta click without a click id when the carrying event is unknown", () => {
    expect(
      toAdTouches(
        { adId: "ad-1", source: "ADS" },
        { occurredAt: occurrence.occurredAt },
      ),
    ).toEqual([])
    // A click id alone is enough to key a touch.
    expect(
      toAdTouches(
        { ctwaClid: "ctwa-1", adId: "ad-1" },
        { occurredAt: occurrence.occurredAt },
      ),
    ).toHaveLength(1)
  })

  test("skips an organic referral (ig.me shortlink, ref link)", () => {
    expect(
      toAdTouches({ adId: "ad-1", source: "SHORTLINK" }, occurrence),
    ).toEqual([])
    expect(toAdTouches({ ref: "promo" }, occurrence)).toEqual([])
  })

  test("records a Google click, with no ad id when the channel carries none", () => {
    const [touch] = toAdTouches(
      {
        gclid: "gclid-1234567890",
        googleClickReceivedAt: "2026-10-19T00:00:00.000Z",
      },
      occurrence,
    )

    expect(touch).toMatchObject({
      provider: "google",
      adId: null,
      campaignId: null,
      clickIdType: "gclid",
      clickId: "gclid-1234567890",
      dedupKey: "gclid:gclid-1234567890",
      occurredAt: new Date("2026-10-19T00:00:00.000Z"),
    })
  })

  test("keeps the Google ad ids and prefers gclid over gbraid", () => {
    const [touch] = toAdTouches(
      {
        gclid: "gclid-1234567890",
        gbraid: null,
        googleAdId: "789",
        googleCampaignId: "123",
        googleAdGroupId: "456",
      },
      occurrence,
    )

    expect(touch).toMatchObject({
      adId: "789",
      campaignId: "123",
      adGroupId: "456",
      occurredAt: occurrence.occurredAt,
    })
    expect(
      toAdTouches({ gbraid: "gbraid-1234567890" }, occurrence)[0],
    ).toMatchObject({
      clickIdType: "gbraid",
      dedupKey: "gbraid:gbraid-1234567890",
    })
  })

  test("records both touches when one referral carries a Meta ad and a Google click", () => {
    const touches = toAdTouches(
      { ctwaClid: "ctwa-1", adId: "ad-1", gclid: "gclid-1234567890" },
      occurrence,
    )

    expect(touches.map((touch) => touch.provider)).toEqual(["meta", "google"])
  })
})

describe("toAdClickActivityEntries", () => {
  const touchesOf = (referral: Parameters<typeof toAdTouches>[0]) =>
    toAdTouches(referral, occurrence)

  test("marks the contact as having clicked each numeric ad", () => {
    expect(
      toAdClickActivityEntries(
        touchesOf({ adId: "120", source: "ADS", gclid: "gclid-1234567890" }),
        "contact-1",
      ),
    ).toEqual([
      {
        activityType: "adClicked",
        contactId: "contact-1",
        occurredAt: occurrence.occurredAt,
        referenceId: "120",
        referenceType: "ad",
      },
    ])
  })

  test("uses the Google ad id of a Google click", () => {
    const entries = toAdClickActivityEntries(
      touchesOf({ gclid: "gclid-1234567890", googleAdId: "789" }),
      "contact-1",
    )

    expect(entries.map((entry) => entry.referenceId)).toEqual(["789"])
  })

  test("skips a touch with no ad id (a Zalo Google click)", () => {
    expect(
      toAdClickActivityEntries(
        touchesOf({ gclid: "gclid-1234567890" }),
        "contact-1",
      ),
    ).toEqual([])
  })

  test.each([
    "ad-abc",
    "0",
    "12.5",
    "-3",
  ])("skips the non-numeric ad id %s, which cannot be an activity reference", (adId) => {
    expect(
      toAdClickActivityEntries(touchesOf({ adId, source: "ADS" }), "contact-1"),
    ).toEqual([])
  })
})
