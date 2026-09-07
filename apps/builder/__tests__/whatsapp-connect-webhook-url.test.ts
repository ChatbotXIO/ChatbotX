// @vitest-environment node
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import type { WhatsappPhoneNumber } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { describe, expect, test, vi } from "vitest"
import {
  buildAuthValue,
  buildWabaAuthValue,
  buildWebhookConfig,
} from "@/features/integration-whatsapp/actions/webhook-url"

// debugToken is only hit on the manual path; non-manual tests never call it.
vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  appAccessToken: (settings: { clientId: string; clientSecret: string }) =>
    `${settings.clientId}|${settings.clientSecret}`,
  debugToken: vi.fn(async () => ({ app_id: "app-123", is_valid: true })),
}))

const BROKER_ORIGIN = "https://app.chatbotx.io"
const WHITE_LABEL_ORIGIN = "https://chat.reseller.com"

const whatsappSettings = {
  clientId: "client-id",
  clientSecret: "client-secret",
  verifyToken: "verify-token",
  version: "v21.0",
} as unknown as WhatsappCredential

const phoneNumber = {
  id: "pn-1",
  display_phone_number: "+1 555",
  verified_name: "Acme",
} as unknown as WhatsappPhoneNumber

describe("buildWebhookConfig", () => {
  test("manual connect builds the per-integration webhook URL on the broker host", () => {
    const { webhookUrl } = buildWebhookConfig({
      isManual: true,
      integrationId: "int-42",
      originUrl: BROKER_ORIGIN,
      whatsappSettings,
    })

    expect(new URL(webhookUrl).host).toBe(new URL(BROKER_ORIGIN).host)
    expect(new URL(webhookUrl).pathname).toBe(
      "/integrations/whatsapp/webhook/int-42",
    )
  })

  test("non-manual connect builds the shared webhook URL on the broker host", () => {
    const { webhookUrl, verifyToken } = buildWebhookConfig({
      isManual: false,
      integrationId: "int-42",
      originUrl: BROKER_ORIGIN,
      whatsappSettings,
    })

    expect(new URL(webhookUrl).host).toBe(new URL(BROKER_ORIGIN).host)
    expect(new URL(webhookUrl).pathname).toBe("/integrations/whatsapp/webhook")
    expect(verifyToken).toBe(whatsappSettings.verifyToken)
  })

  test("regression: a white-label host never leaks into the webhook URL", () => {
    // Caller is responsible for passing the broker origin; once it does, the
    // branded custom domain can never appear in the Meta-facing callback.
    const { webhookUrl } = buildWebhookConfig({
      isManual: true,
      integrationId: "int-42",
      originUrl: BROKER_ORIGIN,
      whatsappSettings,
    })

    expect(webhookUrl).not.toContain(new URL(WHITE_LABEL_ORIGIN).host)
  })
})

describe("buildAuthValue", () => {
  test("non-manual stores the OAuth redirectUrl on the broker host", async () => {
    const auth = await buildAuthValue({
      whatsappSettings: { ...whatsappSettings },
      accessToken: "token",
      verifyToken: "verify-token",
      webhookUrl: `${BROKER_ORIGIN}/integrations/whatsapp/webhook`,
      originUrl: BROKER_ORIGIN,
      wabaId: "waba-1",
      phoneNumber,
      businessId: "biz-1",
      isManual: false,
    })

    expect(new URL(auth.redirectUrl).host).toBe(new URL(BROKER_ORIGIN).host)
    expect(new URL(auth.redirectUrl).pathname).toBe(
      "/integrations/whatsapp/callback",
    )
    expect(auth.redirectUrl).not.toContain(new URL(WHITE_LABEL_ORIGIN).host)
  })

  test("manual derives clientId from the token, clears clientSecret, and keeps redirectUrl on the webhook URL", async () => {
    const input = { ...whatsappSettings }
    const webhookUrl = `${BROKER_ORIGIN}/integrations/whatsapp/webhook/int-42`

    const auth = await buildAuthValue({
      whatsappSettings: input,
      accessToken: "token",
      verifyToken: "verify-token",
      webhookUrl,
      originUrl: BROKER_ORIGIN,
      wabaId: "waba-1",
      phoneNumber,
      businessId: "biz-1",
      isManual: true,
    })

    expect(auth.clientId).toBe("app-123")
    expect(auth.clientSecret).toBe("")
    expect(auth.redirectUrl).toBe(webhookUrl)
    expect(auth.metadata?.isManual).toBe(true)
    expect(auth.metadata?.webhookUrl).toBe(webhookUrl)
    // The caller's credential object must not be mutated.
    expect(input.clientId).toBe(whatsappSettings.clientId)
    expect(input.clientSecret).toBe(whatsappSettings.clientSecret)
  })
})

describe("buildWabaAuthValue", () => {
  test("builds the shared non-manual webhook config without a phone number", () => {
    const auth = buildWabaAuthValue({
      whatsappSettings: { ...whatsappSettings },
      accessToken: "token",
      wabaId: "waba-1",
      businessId: "biz-1",
      originUrl: BROKER_ORIGIN,
      phoneNumber,
    })

    expect(new URL(auth.redirectUrl).host).toBe(new URL(BROKER_ORIGIN).host)
    expect(new URL(auth.redirectUrl).pathname).toBe(
      "/integrations/whatsapp/callback",
    )
    expect(auth.verifyToken).toBe(whatsappSettings.verifyToken)
    expect(auth.tokens.accessToken).toBe("token")
    expect(auth.metadata).toEqual({
      wabaId: "waba-1",
      businessId: "biz-1",
      phoneNumber,
      webhookUrl: `${BROKER_ORIGIN}/integrations/whatsapp/webhook`,
    })
    expect(auth.clientId).toBe(whatsappSettings.clientId)
    expect(auth.clientSecret).toBe(whatsappSettings.clientSecret)
  })

  test("regression: a white-label host never leaks into the WABA auth value", () => {
    const auth = buildWabaAuthValue({
      whatsappSettings: { ...whatsappSettings },
      accessToken: "token",
      wabaId: "waba-1",
      businessId: "biz-1",
      originUrl: BROKER_ORIGIN,
      phoneNumber,
    })

    expect(auth.redirectUrl).not.toContain(new URL(WHITE_LABEL_ORIGIN).host)
    expect(auth.metadata?.webhookUrl).not.toContain(
      new URL(WHITE_LABEL_ORIGIN).host,
    )
  })
})
