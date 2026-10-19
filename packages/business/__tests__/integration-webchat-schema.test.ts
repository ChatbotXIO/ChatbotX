import { describe, expect, test } from "vitest"
import { webchatConnectConfigSchema } from "../src/integration-webchat/schema"

describe("webchatConnectConfigSchema", () => {
  test("accepts a name-only self-serve request and supplies channel defaults", () => {
    expect(webchatConnectConfigSchema.parse({ name: "Support" })).toEqual({
      name: "Support",
      authorizedDomains: [],
      conversationStarters: [],
      persistentMenus: [],
      brandColor: "#007bff",
      hideHeader: false,
      showLogo: true,
      hideMessageInput: false,
      enable: true,
    })
  })
})
