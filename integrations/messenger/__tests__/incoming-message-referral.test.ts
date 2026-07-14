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
})
