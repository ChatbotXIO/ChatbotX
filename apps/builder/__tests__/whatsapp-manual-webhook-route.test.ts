// @vitest-environment node
import { SdkException } from "@chatbotx.io/sdk"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findIntegrationWhatsappById = vi.fn()
const markWhatsappWebhookVerified = vi.fn()
const handleRequest = vi.fn()
const logWebhookRequestBody = vi.fn()
const loggerWarn = vi.fn()

vi.mock("@/features/integration-whatsapp/queries", () => ({
  findIntegrationWhatsappById,
  markWhatsappWebhookVerified,
}))

vi.mock("@/integration", () => ({
  integrations: { whatsapp: { handleRequest } },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@/lib/webhook-log", () => ({
  logWebhookRequestBody,
}))

const { GET, POST } = await import(
  "../src/app/integrations/whatsapp/webhook/[integrationId]/route"
)

const INTEGRATION_ID = "integration-1"

const makeParams = () => Promise.resolve({ integrationId: INTEGRATION_ID })

const manualRow = (
  overrides: Partial<{
    webhookVerifiedAt: string
    subscribeOverrideOk: boolean
  }> = {},
) => ({
  auth: {
    verifyToken: "verify-token",
    clientSecret: "",
    metadata: { isManual: true, ...overrides },
  },
})

describe("whatsapp manual webhook route — GET handshake", () => {
  beforeEach(() => {
    findIntegrationWhatsappById.mockReset()
    markWhatsappWebhookVerified.mockReset()
  })

  test("returns the challenge and marks the webhook verified on a matching token", async () => {
    findIntegrationWhatsappById.mockResolvedValue(manualRow())

    const request = new NextRequest(
      `http://localhost/integrations/whatsapp/webhook/${INTEGRATION_ID}?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123`,
    )

    const response = await GET(request, { params: makeParams() })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("challenge-123")
    expect(markWhatsappWebhookVerified).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ verifyToken: "verify-token" }),
    )
  })

  test("returns 403 on a verify_token mismatch", async () => {
    findIntegrationWhatsappById.mockResolvedValue(manualRow())

    const request = new NextRequest(
      `http://localhost/integrations/whatsapp/webhook/${INTEGRATION_ID}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`,
    )

    const response = await GET(request, { params: makeParams() })

    expect(response.status).toBe(403)
    expect(markWhatsappWebhookVerified).not.toHaveBeenCalled()
  })
})

describe("whatsapp manual webhook route — POST", () => {
  beforeEach(() => {
    findIntegrationWhatsappById.mockReset()
    handleRequest.mockReset()
    logWebhookRequestBody.mockReset()
    loggerWarn.mockClear()
  })

  const makeRequest = (body = "{}") =>
    new NextRequest(
      `http://localhost/integrations/whatsapp/webhook/${INTEGRATION_ID}`,
      {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body,
      },
    )

  test("returns 404 when the integration is not found", async () => {
    findIntegrationWhatsappById.mockResolvedValue(null)

    const response = await POST(makeRequest(), { params: makeParams() })

    expect(response.status).toBe(404)
    expect(handleRequest).not.toHaveBeenCalled()
  })

  test("returns 403 when the integration has never completed a GET handshake", async () => {
    findIntegrationWhatsappById.mockResolvedValue(manualRow())

    const response = await POST(makeRequest(), { params: makeParams() })

    expect(response.status).toBe(403)
    expect(handleRequest).not.toHaveBeenCalled()
    expect(logWebhookRequestBody).not.toHaveBeenCalled()
  })

  test("delegates to integration.handleRequest and logs the body only after it succeeds", async () => {
    findIntegrationWhatsappById.mockResolvedValue(
      manualRow({ webhookVerifiedAt: "2026-01-01T00:00:00.000Z" }),
    )
    handleRequest.mockResolvedValue("ok")

    const response = await POST(makeRequest(), { params: makeParams() })

    expect(response.status).toBe(200)
    expect(handleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          clientSecret: "",
          manualIntegration: true,
          integrationId: INTEGRATION_ID,
        }),
      }),
    )
    expect(logWebhookRequestBody).toHaveBeenCalledWith(
      "whatsapp",
      expect.anything(),
    )
  })

  // This is the actual security fix's regression guard for the manual route:
  // webhookHandler (integrations/whatsapp/src/handlers/webhook.ts) rejects
  // with a 401 SdkException when no clientSecret is configured — manual
  // integrations always have an empty clientSecret (see webhook-url.ts's
  // buildAuthValue), so this is the path they hit today.
  test("surfaces the SdkException's own status (401) on a rejected signature and never logs the body", async () => {
    findIntegrationWhatsappById.mockResolvedValue(
      manualRow({ webhookVerifiedAt: "2026-01-01T00:00:00.000Z" }),
    )
    handleRequest.mockRejectedValue(
      new SdkException(
        "Whatsapp webhook signature verification failed",
        undefined,
        401,
      ),
    )

    const response = await POST(makeRequest(), { params: makeParams() })

    expect(response.status).toBe(401)
    expect(logWebhookRequestBody).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalled()
  })

  test("falls back to 400 for a generic (non-SdkException) handleRequest failure", async () => {
    findIntegrationWhatsappById.mockResolvedValue(
      manualRow({ webhookVerifiedAt: "2026-01-01T00:00:00.000Z" }),
    )
    handleRequest.mockRejectedValue(new Error("boom"))

    const response = await POST(makeRequest(), { params: makeParams() })

    expect(response.status).toBe(400)
    expect(logWebhookRequestBody).not.toHaveBeenCalled()
  })
})
