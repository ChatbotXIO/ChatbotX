import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"

describe("Instagram receiveMessage", () => {
  test("forwards referral source for contact source taxonomy mapping", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { igId: "ig-1" },
        },
      } as never,
      data: {
        integrationType: "instagram",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "ig-user-1" },
                  recipient: { id: "ig-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
  })

  test("derives the ad platform from source_url when source_platform is absent", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { igId: "ig-1" },
        },
      } as never,
      data: {
        integrationType: "instagram",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "ig-user-1" },
                  recipient: { id: "ig-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-9",
                    source_url: "https://www.instagram.com/p/Cxyz/",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.sourcePlatform).toBe("instagram")
    expect(result.referral?.adId).toBe("ad-9")
  })

  test("captures a standalone referral-only event (no message/postback)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { igId: "ig-1" },
        },
      } as never,
      data: {
        integrationType: "instagram",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "ig-user-1" },
                  recipient: { id: "ig-1" },
                  timestamp: 1,
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-9",
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
    expect(result.referral?.adId).toBe("ad-9")
  })

  test("captures referral carried on a postback (icebreaker tap)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { igId: "ig-1" },
        },
      } as never,
      data: {
        integrationType: "instagram",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "ig-user-1" },
                  recipient: { id: "ig-1" },
                  timestamp: 1,
                  postback: {
                    mid: "mid-1",
                    title: "Get Started",
                    payload: "GET_STARTED",
                    referral: {
                      ref: "ad-ref",
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ad_id: "ad-9",
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
    expect(result.referral?.adId).toBe("ad-9")
  })

  test("parses SHORTLINK referral source without treating it as an ad", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { igId: "ig-1" },
        },
      } as never,
      data: {
        integrationType: "instagram",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "ig-user-1" },
                  recipient: { id: "ig-1" },
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
    // `source` value is preserved as-is (never rewritten/dropped). Callers
    // (worker's metaReferralToContactSource / ads-conversion attribution)
    // are responsible for filtering source === "ADS" only.
    expect(result.referralSource).toBe("SHORTLINK")
    expect(result.referral?.source).toBe("SHORTLINK")
    expect(result.referral?.adId).toBeNull()
  })

  test("parses an ad referral without ref (Meta omits ref when the ad sets none)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { igId: "ig-1" },
        },
      } as never,
      data: {
        integrationType: "instagram",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "ig-user-1" },
                  recipient: { id: "ig-1" },
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
