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
})
