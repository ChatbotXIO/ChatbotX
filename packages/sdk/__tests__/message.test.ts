import { describe, expect, test } from "vitest"
import { getCanonicalReplyPayload, type MessageButtonTemplate } from "../src"

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
