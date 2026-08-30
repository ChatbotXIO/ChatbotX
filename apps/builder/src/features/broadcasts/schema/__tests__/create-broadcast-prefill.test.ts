import { describe, expect, test } from "vitest"
import { parseCreateBroadcastPrefill } from "../create-broadcast-prefill"

describe("parseCreateBroadcastPrefill", () => {
  test("parses channel, integrationWhatsappId, and a ctwaRetarget contactFilter", () => {
    const contactFilter = {
      operator: "and",
      conditions: [
        {
          field: "ctwaRetarget",
          segment: "purchases",
          adId: "238512000000102",
          since: "2026-07-01",
          until: "2026-07-31",
        },
      ],
    }

    const result = parseCreateBroadcastPrefill({
      channel: "whatsapp",
      integrationWhatsappId: "12345",
      contactFilter: JSON.stringify(contactFilter),
    })

    expect(result.channel).toBe("whatsapp")
    expect(result.integrationWhatsappId).toBe("12345")
    expect(result.contactFilter).toEqual(contactFilter)
  })

  test("returns an empty object for absent search params", () => {
    expect(parseCreateBroadcastPrefill({})).toEqual({})
  })

  test("drops an unparseable contactFilter search param instead of throwing", () => {
    const result = parseCreateBroadcastPrefill({
      channel: "whatsapp",
      contactFilter: "not-json",
    })

    expect(result.channel).toBe("whatsapp")
    expect(result.contactFilter).toBeUndefined()
  })

  test("drops an invalid channel instead of throwing", () => {
    const result = parseCreateBroadcastPrefill({
      channel: "not-a-real-channel",
    })

    expect(result).toEqual({})
  })
})
