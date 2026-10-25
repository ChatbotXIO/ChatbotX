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

// Based on Google's Click-to-Message partner samples (Messenger): page id, PSID
// and timestamp are theirs; the click id is replaced with a valid 10+ char id.
describe("Messenger Google click partner samples", () => {
  const PAGE_ID = "1629974200583834"
  const PSID = "2428783423848061"
  const GCLID = "EAIaIQobChMIabcdefghij"
  const GOOGLE_TIMESTAMP = 1_790_914_313_500
  const RECEIVED_AT = new Date(1_790_914_313_000).toISOString()
  const googleRef = `gclid:${GCLID},campaignid:123456789,adgroupid:987654321,adid:1122334455`

  const receiveEvent = (messagingEvent: Record<string, unknown>) =>
    receiveMessage({
      ctx: { auth: { metadata: { pageId: PAGE_ID } } } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: PAGE_ID,
        payload: {
          object: "page",
          entry: [
            {
              id: PAGE_ID,
              time: 1_790_914_314_000,
              messaging: [messagingEvent],
            },
          ],
        },
      },
    })

  const referral = (ref: string) => ({
    ref,
    source: "SHORTLINK",
    type: "OPEN_THREAD",
  })

  // A: messaging_referrals, existing conversation.
  const referralEvent = (ref: string) => ({
    sender: { id: PSID },
    recipient: { id: PAGE_ID },
    timestamp: GOOGLE_TIMESTAMP,
    referral: referral(ref),
  })

  // B: messaging_postbacks, "Get Started" tap. Google's sample has no `mid`.
  const googlePostback = (ref: string) => ({
    sender: { id: PSID },
    recipient: { id: PAGE_ID },
    timestamp: GOOGLE_TIMESTAMP,
    postback: {
      title: "Get Started",
      payload: "GET_STARTED_PAYLOAD",
      referral: referral(ref),
    },
  })

  test("sample A: a referral-only event is captured with all four Google ids and no message", async () => {
    const result = await receiveEvent(referralEvent(googleRef))

    expect(result.message).toBeNull()
    expect(result.ref).toBeNull()
    expect(result.referral).toMatchObject({
      ref: null,
      gclid: GCLID,
      gbraid: null,
      googleCampaignId: "123456789",
      googleAdGroupId: "987654321",
      googleAdId: "1122334455",
      googleClickReceivedAt: RECEIVED_AT,
    })
    expect(JSON.stringify(result.referral?.raw)).not.toContain(GCLID)
  })

  test("sample A on iOS: gbraid replaces gclid", async () => {
    const result = await receiveEvent(
      referralEvent(googleRef.replace("gclid:", "gbraid:")),
    )

    expect(result.referral).toMatchObject({ gclid: null, gbraid: GCLID })
  })

  test("sample A with a percent-encoded ref (URL-encoded m.me link)", async () => {
    const result = await receiveEvent(
      referralEvent(encodeURIComponent(googleRef)),
    )

    expect(result.ref).toBeNull()
    expect(result.referral).toMatchObject({
      gclid: GCLID,
      googleCampaignId: "123456789",
    })
  })

  test("sample B verbatim (no postback.mid) is rejected by the envelope schema", async () => {
    await expect(receiveEvent(googlePostback(googleRef))).rejects.toThrow()
  })

  test("sample B with a postback.mid: the Get Started action still fires and the click is captured", async () => {
    const event = googlePostback(googleRef)
    const result = await receiveEvent({
      ...event,
      postback: { ...event.postback, mid: "m_MESSAGE-ID" },
    })

    expect(result.postbackAction).toBe("GET_STARTED_PAYLOAD")
    expect(result.ref).toBeNull()
    expect(result.referral).toMatchObject({
      gclid: GCLID,
      googleClickReceivedAt: RECEIVED_AT,
    })
  })
})
