import { GOOGLE_INVISIBLE_CHAR_SET } from "@chatbotx.io/utils/google-click"
import { afterEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"

vi.mock("../src/client", () => ({
  getWhatsappClient: () => ({}),
}))

const encodeInvisible = (text: string): string =>
  [...text]
    .map((char) => {
      const index = GOOGLE_INVISIBLE_CHAR_SET.indexOf(char)
      if (index < 0) {
        throw new Error(`char not encodable: ${char}`)
      }
      return String.fromCodePoint(0xe_01_00 + index)
    })
    .join("")

const GCLID = "ABCDEFGHIJ1234567890"
const GBRAID = "ZYXWVUTSRQ0987654321"

const gclidRun = encodeInvisible(
  JSON.stringify({ gclid: GCLID, campaignid: 123, adgroupid: 456, adid: 789 }),
)
const gbraidRun = encodeInvisible(JSON.stringify({ gbraid: GBRAID }))

const buildProps = (
  body: string,
  referral?: Record<string, unknown>,
  timestamp?: string,
) =>
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
          ...(timestamp === undefined ? {} : { timestamp }),
          text: { body },
          ...(referral ? { referral } : {}),
        },
      },
    },
  }) as never

describe("WhatsApp receiveMessage Google click capture", () => {
  test("decodes a gclid run at the start of the text and cleans the text", async () => {
    const result = await receiveMessage(buildProps(`${gclidRun}Hello there`))

    expect(result.message?.text).toBe("Hello there")
    expect(result.referral).toMatchObject({
      gclid: GCLID,
      gbraid: null,
      googleCampaignId: "123",
      googleAdGroupId: "456",
      googleAdId: "789",
    })
    const receivedAt = result.referral?.googleClickReceivedAt
    expect(new Date(receivedAt as string).toISOString()).toBe(receivedAt)
  })

  test("googleClickReceivedAt equals the message timestamp", async () => {
    const result = await receiveMessage(
      buildProps(`${gclidRun}Hello`, undefined, "1781000000"),
    )

    expect(result.referral?.googleClickReceivedAt).toBe(
      new Date(1_781_000_000 * 1000).toISOString(),
    )
  })

  describe("missing timestamp", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    test("falls back to the clock", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"))

      const result = await receiveMessage(buildProps(`${gclidRun}Hello`))

      expect(result.referral?.googleClickReceivedAt).toBe(
        "2026-06-21T10:00:00.000Z",
      )
    })

    test("falls back to the clock for an invalid timestamp", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"))

      const result = await receiveMessage(
        buildProps(`${gclidRun}Hello`, undefined, "not-a-number"),
      )

      expect(result.referral?.googleClickReceivedAt).toBe(
        "2026-06-21T10:00:00.000Z",
      )
    })
  })

  test("decodes a gclid run in the middle of the text", async () => {
    const result = await receiveMessage(buildProps(`Hello ${gclidRun}there`))

    expect(result.message?.text).toBe("Hello there")
    expect(result.referral?.gclid).toBe(GCLID)
  })

  test("a gbraid click nulls gclid", async () => {
    const result = await receiveMessage(buildProps(`Hi${gbraidRun}`))

    expect(result.message?.text).toBe("Hi")
    expect(result.referral).toMatchObject({
      gclid: null,
      gbraid: GBRAID,
      googleCampaignId: null,
      googleAdGroupId: null,
      googleAdId: null,
    })
  })

  test("plain text adds no google keys and keeps a null referral", async () => {
    const result = await receiveMessage(buildProps("just text"))

    expect(result.message?.text).toBe("just text")
    expect(result.referral).toBeNull()
  })

  test("leaves a Japanese IVS sequence untouched and adds no referral", async () => {
    const text = "葛\u{E0100}"
    const result = await receiveMessage(buildProps(text))

    expect(result.message?.text).toBe(text)
    expect(result.referral).toBeNull()
  })

  test("leaves a malformed JSON run in the text", async () => {
    const malformed = encodeInvisible('{"gclid":"ABCDEFGHIJ1234567890"')
    const text = `Hello${malformed}`
    const result = await receiveMessage(buildProps(text))

    expect(result.message?.text).toBe(text)
    expect(result.referral).toBeNull()
  })

  test("merges a Meta ctwa referral with the Google click", async () => {
    const result = await receiveMessage(
      buildProps(`${gclidRun}Hello`, {
        source_url: "https://fb.me/3cr4Wqqkv",
        source_id: "ad-1",
        source_type: "ad",
        ctwa_clid: "ctwa-1",
      }),
    )

    expect(result.referral).toMatchObject({
      adId: "ad-1",
      ctwaClid: "ctwa-1",
      sourcePlatform: "facebook",
      gclid: GCLID,
      googleCampaignId: "123",
    })
  })

  test("extracts the ref from a /ref- prefixed text with an invisible run", async () => {
    const result = await receiveMessage(buildProps(`/ref-xyz${gclidRun}`))

    expect(result.ref).toBe("xyz")
    expect(result.referral?.gclid).toBe(GCLID)
  })

  test("referral.raw carries no click id", async () => {
    const result = await receiveMessage(
      buildProps(`${gclidRun}Hello`, {
        source_url: "https://fb.me/3cr4Wqqkv",
        source_id: "ad-1",
        source_type: "ad",
      }),
    )

    expect(result.referral?.raw).toBeDefined()
    expect(JSON.stringify(result.referral?.raw)).not.toContain(GCLID)
  })

  test("keeps referralSource Meta-only for a Google click", async () => {
    const result = await receiveMessage(buildProps(`${gclidRun}Hello`))

    expect(result.referralSource).toBeNull()
  })
})
