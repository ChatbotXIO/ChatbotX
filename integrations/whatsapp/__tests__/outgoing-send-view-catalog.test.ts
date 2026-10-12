import type { SendViewCatalogStepSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  ActionCatalog,
  Body,
  Footer,
  Interactive,
} from "whatsapp-api-js/messages"
import { convertFlowStepViewCatalog } from "../src/handlers/message/outgoing-message/send-view-catalog"

type ConverterProps = Parameters<typeof convertFlowStepViewCatalog>[0]

const buildProps = (
  step: Partial<SendViewCatalogStepSchema> = {},
): ConverterProps =>
  ({
    ctx: { auth: {} },
    data: {
      contact: { sourceId: "84900000001" },
      flowId: "1",
      step: {
        id: "step-1",
        stepType: "sendViewCatalog",
        text: "Browse our catalog",
        footer: "",
        thumbnailProductId: "",
        ...step,
      },
    },
  }) as unknown as ConverterProps

const convert = (step: Partial<SendViewCatalogStepSchema> = {}) => [
  ...convertFlowStepViewCatalog(buildProps(step)),
]

const serialize = (message: unknown): unknown =>
  JSON.parse(JSON.stringify(message))

describe("convertFlowStepViewCatalog", () => {
  test("yields Meta's catalog_message built by the library", () => {
    const [message, ...rest] = convert()

    expect(rest).toEqual([])
    expect(message).toBeInstanceOf(Interactive)
    expect(serialize(message)).toEqual({
      type: "catalog_message",
      body: { text: "Browse our catalog" },
      action: { name: "catalog_message" },
    })
  })

  test("adds the footer and the thumbnail product when set", () => {
    const [message] = convert({
      footer: "Free shipping",
      thumbnailProductId: "sku-1",
    })

    expect(serialize(message)).toEqual({
      type: "catalog_message",
      body: { text: "Browse our catalog" },
      footer: { text: "Free shipping" },
      action: {
        name: "catalog_message",
        parameters: { thumbnail_product_retailer_id: "sku-1" },
      },
    })
  })

  test("keeps line breaks inside the footer", () => {
    const [message] = convert({ footer: "line one\nline two" })

    expect(serialize(message)).toMatchObject({
      footer: { text: "line one\nline two" },
    })
  })

  test.each(["", "   ", "\n"])("omits a blank footer %j", (footer) => {
    const [message] = convert({ footer })

    expect(serialize(message)).not.toHaveProperty("footer")
  })

  test.each([
    "",
    "   ",
  ])("omits a blank thumbnail product id %j so the channel picks one", (thumbnailProductId) => {
    const [message] = convert({ thumbnailProductId })

    expect(serialize(message)).toEqual({
      type: "catalog_message",
      body: { text: "Browse our catalog" },
      action: { name: "catalog_message" },
    })
  })

  test("trims the thumbnail product id after variables were resolved", () => {
    const [message] = convert({ thumbnailProductId: "  sku-1  " })

    expect(serialize(message)).toMatchObject({
      action: { parameters: { thumbnail_product_retailer_id: "sku-1" } },
    })
  })

  test("clamps a body and footer that grew past Meta's limits after variable resolution", () => {
    const [message] = convert({
      text: "a".repeat(1500),
      footer: "b".repeat(100),
    })
    const payload = serialize(message) as {
      body: { text: string }
      footer: { text: string }
    }

    expect(payload.body.text).toHaveLength(1024)
    expect(payload.footer.text).toHaveLength(60)
  })

  test("never cuts an emoji in half when it straddles the limit", () => {
    // "😀" is two UTF-16 units: 1023 + 2 puts its first half at index 1023.
    const [message] = convert({
      text: `${"a".repeat(1023)}😀`,
      footer: `${"b".repeat(59)}😀`,
    })
    const payload = serialize(message) as {
      body: { text: string }
      footer: { text: string }
    }

    expect(payload.body.text).toBe("a".repeat(1023))
    expect(payload.footer.text).toBe("b".repeat(59))
  })

  test("keeps an emoji that fits exactly", () => {
    const [message] = convert({ text: `${"a".repeat(1022)}😀` })
    const payload = serialize(message) as { body: { text: string } }

    expect(payload.body.text).toBe(`${"a".repeat(1022)}😀`)
  })

  test("builds the catalog from the library's own message parts", () => {
    const [message] = convert({ footer: "Bye", thumbnailProductId: "sku-1" })

    expect(message).toBeInstanceOf(Interactive)
    expect((message as Interactive).action).toBeInstanceOf(ActionCatalog)
    expect((message as Interactive).body).toBeInstanceOf(Body)
    expect((message as Interactive).footer).toBeInstanceOf(Footer)
  })

  test("yields nothing when the body resolved to blank", () => {
    expect(convert({ text: "   " })).toEqual([])
  })
})
