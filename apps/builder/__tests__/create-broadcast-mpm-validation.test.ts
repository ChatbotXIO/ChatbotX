import { describe, expect, test } from "vitest"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/action"

const baseRequest = {
  channel: "whatsapp",
  templateId: "11612473309626368",
  integrationWhatsappId: "11612473309626369",
  subaction: "whatsappTemplateMessage",
  schedulesType: "now",
  schedulesAt: null,
  contactFilter: { operator: "and", conditions: [] },
}

const mpmTemplateData = (
  sections: Array<{
    title?: string
    product_items?: Array<{ product_retailer_id: string }>
  }>,
) => ({
  button: [{ sub_type: "mpm", index: 0, sections }],
})

describe("createBroadcastRequest — MPM validation (broadcast surface)", () => {
  test("rejects a WhatsApp MPM broadcast with no configured products", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: mpmTemplateData([]),
    })

    expect(result.success).toBe(false)
  })

  test("accepts a WhatsApp MPM broadcast with configured products", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: mpmTemplateData([
        {
          title: "Best sellers",
          product_items: [{ product_retailer_id: "sku-1" }],
        },
      ]),
    })

    expect(result.success).toBe(true)
  })

  test("rejects a WhatsApp MPM broadcast exceeding the section limit", () => {
    const sections = Array.from({ length: 11 }, (_ignored, index) => ({
      title: `Section ${index + 1}`,
      product_items: [{ product_retailer_id: `sku-${index}` }],
    }))

    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: mpmTemplateData(sections),
    })

    expect(result.success).toBe(false)
  })

  test("non-MPM WhatsApp template data is unaffected (regression)", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: {
        body: [{ type: "text", text: "Hello" }],
        button: [{ sub_type: "quick_reply", index: 1, payload: "" }],
      },
    })

    expect(result.success).toBe(true)
  })

  test("rejects a WhatsApp MPM broadcast containing an unfilled product row", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: mpmTemplateData([
        {
          title: "Best sellers",
          product_items: [
            { product_retailer_id: "sku-1" },
            { product_retailer_id: "" },
          ],
        },
      ]),
    })

    expect(result.success).toBe(false)
  })

  test("rejects a WhatsApp LTO broadcast whose expiration is still the seeded 0", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: { limited_time_offer: { expiration_time_ms: 0 } },
    })

    expect(result.success).toBe(false)
  })

  test("accepts a WhatsApp LTO broadcast with a configured expiration", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      templateData: {
        limited_time_offer: { expiration_time_ms: 1_924_000_000_000 },
      },
    })

    expect(result.success).toBe(true)
  })

  test("messenger broadcasts are not run through the WhatsApp MPM rule (regression)", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      channel: "messenger",
      integrationWhatsappId: undefined,
      integrationMessengerId: "11612473309626370",
      subaction: "messengerTemplateMessage",
      templateData: { body: [{ type: "text", text: "Hi" }] },
    })

    expect(result.success).toBe(true)
  })
})
