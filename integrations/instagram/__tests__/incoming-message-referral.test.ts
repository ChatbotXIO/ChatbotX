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
})
