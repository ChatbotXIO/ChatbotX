import { describe, expect, test } from "vitest"
import { getCtwaFunnelInput } from "../src/ads-conversion/schema"

describe("getCtwaFunnelInput", () => {
  test("rejects an inverted UTC date range", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: new Date("2026-08-11T00:00:00.000Z"),
      until: new Date("2026-08-10T23:59:59.999Z"),
    })

    expect(result.success).toBe(false)
  })

  test("accepts an optional WhatsApp integration filter", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      integrationWhatsappId: "9",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ integrationWhatsappId: "9" })
  })
})
