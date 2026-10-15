import { describe, expect, test } from "vitest"
import { buildInboundWebhookUrl } from "../src/features/inbound-webhooks/lib/endpoint-url"

describe("buildInboundWebhookUrl", () => {
  test("puts the token under /api/hooks on the given origin", () => {
    expect(
      buildInboundWebhookUrl({
        origin: "https://chat.acme.test",
        token: "iwh_abc",
      }),
    ).toBe("https://chat.acme.test/api/hooks/iwh_abc")
  })

  test("ignores a path or query on the origin", () => {
    expect(
      buildInboundWebhookUrl({
        origin: "https://chat.acme.test/app?x=1",
        token: "iwh_abc",
      }),
    ).toBe("https://chat.acme.test/api/hooks/iwh_abc")
  })
})
