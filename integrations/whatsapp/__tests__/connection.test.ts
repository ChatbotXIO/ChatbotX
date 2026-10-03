import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as WhatsappClient from "../src/client"
import { WhatsappException } from "../src/exception"
import { integration } from "../src/integration"
import { isRevokedTokenError } from "../src/lib/error-mapper"
import type { WhatsappAuthValue } from "../src/schema"

const mocks = vi.hoisted(() => ({
  subscribeWebhook: vi.fn(),
  unsubscribeWebhook: vi.fn(),
  verifyAccessToken: vi.fn(),
}))

vi.mock("../src/api/webhook", () => ({
  subscribeWebhook: mocks.subscribeWebhook,
  unsubscribeWebhook: mocks.unsubscribeWebhook,
}))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof WhatsappClient>()
  return { ...actual, verifyAccessToken: mocks.verifyAccessToken }
})

const auth = {
  authType: "oauth2",
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
} as unknown as WhatsappAuthValue

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyAccessToken.mockResolvedValue(auth.metadata.phoneNumber)
  mocks.subscribeWebhook.mockResolvedValue(undefined)
  mocks.unsubscribeWebhook.mockResolvedValue(undefined)
})

describe("WhatsApp connection", () => {
  test("describes the connected phone number", () => {
    expect(integration.connection.describe(auth)).toEqual({
      sourceId: "phone-number-id",
      displayName: "Example Support",
    })
  })

  test("verifies the stored auth and preserves the expiry", async () => {
    const result = await integration.connection.verify({ auth })

    expect(mocks.verifyAccessToken).toHaveBeenCalledWith(auth)
    expect(result).toEqual({ ok: true })
  })

  test("subscribes and unsubscribes webhooks with the stored auth", async () => {
    const webhook = integration.connection.webhook
    if (!webhook) {
      throw new Error("WhatsApp connection must define webhook handlers")
    }

    await webhook.subscribe({ auth })
    await webhook.unsubscribe({ auth })

    expect(mocks.subscribeWebhook).toHaveBeenCalledWith({ auth })
    expect(mocks.unsubscribeWebhook).toHaveBeenCalledWith({ auth })
  })
})

describe("isRevokedTokenError", () => {
  test.each([
    458, 460, 463, 467,
  ])("recognizes OAuth subcode %i as a revoked token", (subCode) => {
    const error = new WhatsappException(
      "OAuth token invalid",
      400,
      190,
      subCode,
      "OAuthException",
    )

    expect(isRevokedTokenError(error)).toBe(true)
  })

  test("rejects unrelated OAuth and non-WhatsApp errors", () => {
    const unrelatedOAuthError = new WhatsappException(
      "OAuth token invalid",
      400,
      190,
      123,
      "OAuthException",
    )

    expect(isRevokedTokenError(unrelatedOAuthError)).toBe(false)
    expect(isRevokedTokenError(new Error("token invalid"))).toBe(false)
  })
})
