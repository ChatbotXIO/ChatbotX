import { describe, expect, test } from "vitest"
import { buildCreateBroadcastDefaultValues } from "../create-broadcast-defaults"

describe("buildCreateBroadcastDefaultValues", () => {
  test("returns an empty channel/filter when nothing is prefilled", () => {
    expect(buildCreateBroadcastDefaultValues({})).toEqual({
      channel: undefined,
      flowId: undefined,
      subaction: undefined,
      integrationWhatsappId: undefined,
      schedulesType: "now",
      schedulesAt: null,
      contactFilter: { operator: "and", conditions: [] },
    })
  })

  test("seeds channel, subaction, integration, and contactFilter for a WhatsApp deep-link", () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "ctwaRetarget" as const,
          segment: "purchases" as const,
          adId: "238512000000102",
          since: "2026-07-01",
          until: "2026-07-31",
        },
      ],
    }

    const result = buildCreateBroadcastDefaultValues({
      initialChannel: "whatsapp",
      initialIntegrationWhatsappId: "12345",
      initialContactFilter: contactFilter,
    })

    expect(result.channel).toBe("whatsapp")
    expect(result.subaction).toBe("whatsappTemplateMessage")
    expect(result.integrationWhatsappId).toBe("12345")
    expect(result.contactFilter).toEqual(contactFilter)
  })

  test("does not default to a template subaction for a non-WhatsApp channel", () => {
    const result = buildCreateBroadcastDefaultValues({
      initialChannel: "messenger",
    })

    expect(result.channel).toBe("messenger")
    expect(result.subaction).toBeUndefined()
  })
})
