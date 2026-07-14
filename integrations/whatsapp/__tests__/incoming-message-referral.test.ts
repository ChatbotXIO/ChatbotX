import { describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"

vi.mock("../src/client", () => ({
  getWhatsappClient: () => ({}),
}))

const buildProps = (referral: Record<string, unknown> | undefined) =>
  ({
    ctx: { auth: {} },
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: "inbox-1",
      payload: {
        phoneID: "phone-1",
        from: "84900000001",
        name: "Alice",
        message: {
          id: "wamid.test-1",
          type: "text",
          text: { body: "hello" },
          ...(referral ? { referral } : {}),
        },
      },
    },
  }) as never

describe("WhatsApp receiveMessage referral", () => {
  test("derives facebook platform from a fb.me source url", async () => {
    const result = await receiveMessage(
      buildProps({
        source_url: "https://fb.me/3cr4Wqqkv",
        source_id: "ad-1",
        source_type: "ad",
        headline: "Summer sale",
        ctwa_clid: "ctwa-1",
      }),
    )

    expect(result.referral).toMatchObject({
      adId: "ad-1",
      sourceUrl: "https://fb.me/3cr4Wqqkv",
      sourcePlatform: "facebook",
      ctwaClid: "ctwa-1",
    })
  })

  test("derives instagram platform from an instagram source url", async () => {
    const result = await receiveMessage(
      buildProps({
        source_url: "https://www.instagram.com/p/Cxyz/",
        source_id: "ad-2",
        source_type: "ad",
      }),
    )

    expect(result.referral?.sourcePlatform).toBe("instagram")
  })

  test("leaves platform null when the source url is missing or unknown", async () => {
    const result = await receiveMessage(
      buildProps({ source_id: "ad-3", source_type: "ad" }),
    )

    expect(result.referral?.sourcePlatform).toBeNull()
    expect(result.referral?.adId).toBe("ad-3")
  })

  test("returns no referral for plain messages", async () => {
    const result = await receiveMessage(buildProps(undefined))

    expect(result.referral).toBeNull()
  })
})
