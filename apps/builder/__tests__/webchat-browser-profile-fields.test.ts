// @vitest-environment jsdom

import { describe, expect, test } from "vitest"
import { getWebchatProfileFields } from "@/features/integration-webchat/browser-profile-fields"

describe("getWebchatProfileFields", () => {
  test("uses the parentUrl query parameter from the embedded iframe URL", () => {
    const parentUrl =
      "https://shop.example.com/products/abc?utm_source=ad#details"
    const iframeUrl = `/webchat?workspaceId=ws-1&webchatId=wc-1&parentUrl=${encodeURIComponent(parentUrl)}`

    window.history.replaceState(null, "", iframeUrl)

    expect(getWebchatProfileFields().parentUrl).toBe(parentUrl)
  })

  test("ignores an invalid parentUrl query parameter", () => {
    window.history.replaceState(null, "", "/webchat?parentUrl=not-a-url")

    expect(getWebchatProfileFields().parentUrl).toBeUndefined()
  })
})
