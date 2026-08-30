// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const findIntegrationWhatsappById = vi.fn()
const markWhatsappWebhookVerified = vi.fn()
const whatsappHandleRequest = vi.fn()

// Distinct mock objects so we can assert `handleRequest` receives the exact
// `heavyQueue` identity — the webhook handler now threads `heavyQueue` through
// to `integration.handleRequest` (coexist actions moved to the `heavy` queue —
// see docs/plans/2026-08-30-heavy-worker-coexist-split.md). It must be
// exported here or referencing it inside the try block throws.
const heavyQueue = { name: "heavy" }
const integrationQueue = { name: "integration" }

vi.mock("@chatbotx.io/worker-config", () => ({
  heavyQueue,
  integrationQueue,
}))

vi.mock("@/features/integration-whatsapp/queries", () => ({
  findIntegrationWhatsappById,
  markWhatsappWebhookVerified,
}))

vi.mock("@/integration", () => ({
  integrations: {
    whatsapp: { name: "whatsapp", handleRequest: whatsappHandleRequest },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock("@/lib/webhook-log", () => ({
  logWebhookRequestBody: vi.fn(async () => undefined),
}))

const { POST } = await import(
  "../src/app/integrations/whatsapp/webhook/[integrationId]/route"
)

const asPostRequest = (body: string) =>
  new Request("http://localhost/integrations/whatsapp/webhook/int-1", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": "sha256=deadbeef" },
  }) as never

const verifiedIntegration = {
  row: { id: "int-1" },
  auth: {
    authType: "oauth2",
    clientId: "id",
    clientSecret: "secret",
    redirectUrl: "https://x",
    verifyToken: "verify-token",
    tokens: { accessToken: "token" },
    metadata: {
      wabaId: "waba-1",
      businessId: "biz-1",
      phoneNumber: {},
      webhookUrl: "https://x",
      isManual: true,
      webhookVerifiedAt: "2026-01-01T00:00:00Z",
    },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  findIntegrationWhatsappById.mockResolvedValue(verifiedIntegration.row)
  whatsappHandleRequest.mockResolvedValue("ok")
})

describe("whatsapp dedicated webhook route", () => {
  test("passes heavyQueue through to integration.handleRequest", async () => {
    // loadManualIntegration re-reads auth off the found row.
    findIntegrationWhatsappById.mockResolvedValue({
      ...verifiedIntegration.row,
      auth: verifiedIntegration.auth,
    })

    await POST(asPostRequest(JSON.stringify({ entry: [] })), {
      params: Promise.resolve({ integrationId: "int-1" }),
    } as never)

    expect(whatsappHandleRequest).toHaveBeenCalledOnce()
    const call = whatsappHandleRequest.mock.calls[0][0]
    expect(call.heavyQueue).toBe(heavyQueue)
    expect(call.queue).toBe(integrationQueue)
  })
})
