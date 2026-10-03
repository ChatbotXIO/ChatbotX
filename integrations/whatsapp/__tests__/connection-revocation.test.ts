import { describe, expect, test, vi } from "vitest"
import { integration } from "../src/integration"

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

vi.mock("whatsapp-api-js", () => ({
  WhatsAppAPI: class {
    $$apiFetch$$ = mocks.apiFetch
  },
}))

const auth = {
  authType: "oauth2" as const,
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUrl: "https://app.example.test/callback",
  tokens: { accessToken: "access-token" },
  version: "v23.0",
  metadata: {
    businessId: "business-id",
    wabaId: "waba-id",
    webhookUrl: "https://app.example.test/webhook",
    phoneNumber: {
      id: "phone-number-id",
      verified_name: "Example Support",
      display_phone_number: "+1 555 0100",
    },
  },
}

describe("WhatsApp connection.verify", () => {
  test("marks a Graph 190 response as revoked", async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ error: { code: 190 } }),
    })

    await expect(
      integration.connection.verify({ auth }),
    ).resolves.toMatchObject({
      ok: false,
      revoked: true,
    })
  })

  test("does not mark a rate limit response as revoked", async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({ error: { code: 4 } }),
    })

    await expect(
      integration.connection.verify({ auth }),
    ).resolves.toMatchObject({
      ok: false,
      revoked: false,
    })
  })
})
