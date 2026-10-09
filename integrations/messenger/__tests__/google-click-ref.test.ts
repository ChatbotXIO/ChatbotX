import { afterEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

const receiveWithReferral = (
  referral: Record<string, unknown>,
  timestamp = 1,
) =>
  receiveMessage({
    ctx: { auth: { metadata: { pageId: "page-1" } } } as never,
    data: {
      integrationType: "messenger",
      integrationIdentifier: "inbox-1",
      payload: {
        object: "page",
        entry: [
          {
            id: "page-1",
            time: 1,
            messaging: [
              {
                sender: { id: "psid-1" },
                recipient: { id: "page-1" },
                timestamp,
                message: { mid: "mid-1", text: "hello" },
                referral,
              },
            ],
          },
        ],
      },
    },
  })

const shortlink = (ref: string) => ({
  ref,
  source: "SHORTLINK",
  type: "OPEN_THREAD",
})

describe("Messenger Google click ref", () => {
  test("consumes a gclid ref and sets the google referral keys", async () => {
    const result = await receiveWithReferral(
      shortlink("gclid:ABCDEFGHIJ1234567890,campaignid:1,adgroupid:2,adid:3"),
    )

    expect(result.ref).toBeNull()
    expect(result.referral?.ref).toBeNull()
    expect(result.referral).toMatchObject({
      gclid: "ABCDEFGHIJ1234567890",
      gbraid: null,
      googleCampaignId: "1",
      googleAdGroupId: "2",
      googleAdId: "3",
    })
    const receivedAt = result.referral?.googleClickReceivedAt
    expect(new Date(receivedAt as string).toISOString()).toBe(receivedAt)
  })

  test("googleClickReceivedAt equals the whole-second message timestamp", async () => {
    const result = await receiveWithReferral(
      shortlink("gclid:ABCDEFGHIJ1234567890"),
      1_781_000_000_123,
    )

    expect(result.referral?.googleClickReceivedAt).toBe(
      new Date(1_781_000_000_000).toISOString(),
    )
  })

  describe("unusable timestamp (schema requires one; 0 is rejected by the reader)", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    test("falls back to the clock", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"))

      const result = await receiveWithReferral(
        shortlink("gclid:ABCDEFGHIJ1234567890"),
        0,
      )

      expect(result.referral?.googleClickReceivedAt).toBe(
        "2026-06-21T10:00:00.000Z",
      )
    })
  })

  test("referral.raw carries no click id", async () => {
    const result = await receiveWithReferral({
      ...shortlink("gclid:ABCDEFGHIJ1234567890,campaignid:1"),
      text: "gclid:ABCDEFGHIJ1234567890",
    })

    expect(result.referral?.raw).not.toHaveProperty("ref")
    expect(JSON.stringify(result.referral?.raw)).not.toContain(
      "ABCDEFGHIJ1234567890",
    )
  })

  test("consumes a gbraid ref and nulls gclid", async () => {
    const result = await receiveWithReferral(
      shortlink("gbraid:ZYXWVUTSRQ0987654321,campaignid:1"),
    )

    expect(result.ref).toBeNull()
    expect(result.referral).toMatchObject({
      gclid: null,
      gbraid: "ZYXWVUTSRQ0987654321",
      googleCampaignId: "1",
    })
  })

  test("leaves a non-Google ref untouched", async () => {
    const result = await receiveWithReferral(shortlink("promo-1"))

    expect(result.ref).toBe("promo-1")
    expect(result.referral?.ref).toBe("promo-1")
    expect(result.referral).not.toHaveProperty("gclid")
    expect(result.referral).not.toHaveProperty("googleClickReceivedAt")
  })

  test("leaves a malformed gclid ref (empty id) untouched", async () => {
    const result = await receiveWithReferral(shortlink("gclid:"))

    expect(result.ref).toBe("gclid:")
    expect(result.referral?.ref).toBe("gclid:")
    expect(result.referral).not.toHaveProperty("gclid")
  })

  test("leaves a Meta ad referral without a Google click unchanged", async () => {
    const result = await receiveWithReferral({
      ref: "ad-ref",
      source: "ADS",
      type: "OPEN_THREAD",
      ad_id: "ad-1",
    })

    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-1")
    expect(result.referral).not.toHaveProperty("gclid")
  })
})
