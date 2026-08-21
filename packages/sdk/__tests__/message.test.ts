import { describe, expect, test } from "vitest"
import {
  getCanonicalReplyPayload,
  type MessageButtonTemplate,
  URL_QUICK_REPLY_CAPABLE_CHANNELS,
} from "../src"

describe("getCanonicalReplyPayload", () => {
  test("returns postback for a postback button", () => {
    const button: MessageButtonTemplate = {
      id: "qr-1",
      label: "Yes",
      buttonType: "postback",
      postback: "flow-1::qr-1",
    }

    expect(getCanonicalReplyPayload(button)).toBe("flow-1::qr-1")
  })

  test("returns fallback postback for a URL button when present", () => {
    const button: MessageButtonTemplate = {
      id: "qr-2",
      label: "Open",
      buttonType: "url",
      url: "https://example.com?code=flow-1::qr-2",
      postback: "flow-1::qr-2",
    }

    expect(getCanonicalReplyPayload(button)).toBe("flow-1::qr-2")
  })

  test("returns URL for a URL button without fallback postback", () => {
    const button: MessageButtonTemplate = {
      id: "qr-3",
      label: "Open",
      buttonType: "url",
      url: "https://example.com",
    }

    expect(getCanonicalReplyPayload(button)).toBe("https://example.com")
  })
})

describe("URL_QUICK_REPLY_CAPABLE_CHANNELS", () => {
  test("lists only the channels verified to render a url quick reply as a real link button", () => {
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("messenger")).toBe(true)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("telegram")).toBe(true)
  })

  test("excludes channels that silently degrade a url quick reply", () => {
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("whatsapp")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("instagram")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("zalo")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("tiktok")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("webchat")).toBe(false)
  })
})
