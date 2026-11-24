import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import {
  orderedTemplateChannels,
  templateChannelsSchema,
  templateChannelTypes,
} from "../src/partials/template"

describe("templateChannelsSchema", () => {
  test("accepts an empty list", () => {
    expect(templateChannelsSchema.parse([])).toEqual([])
  })

  test("removes duplicates", () => {
    expect(
      templateChannelsSchema.parse(["telegram", "telegram", "line"]),
    ).toEqual(["telegram", "line"])
  })

  test("sorts into the fixed channel display order", () => {
    expect(
      templateChannelsSchema.parse(["webchat", "line", "whatsapp", "threads"]),
    ).toEqual(["whatsapp", "threads", "line", "webchat"])
  })

  test("rejects omnichannel, the icon fallback, but accepts api", () => {
    expect(templateChannelsSchema.safeParse(["omnichannel"]).success).toBe(
      false,
    )
    expect(templateChannelsSchema.safeParse(["api"]).success).toBe(true)
  })

  test("api sorts last, after every messaging channel", () => {
    expect(templateChannelsSchema.parse(["api", "smtp", "whatsapp"])).toEqual([
      "whatsapp",
      "smtp",
      "api",
    ])
  })

  test("rejects an unknown channel", () => {
    expect(templateChannelsSchema.safeParse(["fax"]).success).toBe(false)
  })

  test("offers every channel type except omnichannel", () => {
    expect([...templateChannelTypes.options].sort()).toEqual(
      channelTypes.options
        .filter((channel) => channel !== "omnichannel")
        .sort(),
    )
  })

  test("the ordered channel list follows the product order", () => {
    expect(orderedTemplateChannels).toEqual([
      "whatsapp",
      "messenger",
      "instagram",
      "threads",
      "tiktok",
      "telegram",
      "line",
      "zalo",
      "webchat",
      "smtp",
      "api",
    ])
  })
})
