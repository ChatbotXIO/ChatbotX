import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"

describe("Messenger receiveMessage", () => {
  test("forwards referral source for contact source taxonomy mapping", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "bot-link",
                    source: "SHORTLINK",
                    type: "OPEN_THREAD",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.ref).toBe("bot-link")
    expect(result.referralSource).toBe("SHORTLINK")
  })

  test("derives the ad platform from source_url when source_platform is absent", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-1",
                    source_url: "https://www.facebook.com/ads/123",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.sourcePlatform).toBe("facebook")
    expect(result.referral?.adId).toBe("ad-1")
  })

  test("prefers the webhook source_platform over derivation", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    source_platform: "instagram",
                    source_url: "https://www.facebook.com/ads/123",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.sourcePlatform).toBe("instagram")
  })

  test("captures a standalone referral-only event (no message/postback)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-1",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.message).toBeNull()
    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-1")
  })

  test("captures referral carried on a postback (icebreaker tap)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  postback: {
                    mid: "mid-1",
                    title: "Get Started",
                    payload: "GET_STARTED",
                    referral: {
                      ref: "ad-ref",
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ad_id: "ad-1",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.postbackAction).toBe("GET_STARTED")
    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-1")
  })

  test("parses SHORTLINK referral source without treating it as an ad", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "bot-link",
                    source: "SHORTLINK",
                    type: "OPEN_THREAD",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    // SHORTLINK is parsed like any other referral — no ad_id, and the raw
    // `source` value is preserved as-is. Ad-only filtering is the caller's
    // responsibility (metaReferralToContactSource / ads-conversion service).
    expect(result.referralSource).toBe("SHORTLINK")
    expect(result.referral?.source).toBe("SHORTLINK")
    expect(result.referral?.adId).toBeNull()
  })

  test("parses an ad referral without ref (Meta omits ref when the ad sets none)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
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
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-42",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.ref).toBeNull()
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-42")
  })
})
