// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const threadsFindDecryptedByClientId = vi.fn()
const threadsHandleRequest = vi.fn()
const loggerInfo = vi.fn()
const loggerDebug = vi.fn()
const loggerError = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { findActiveByDomain: vi.fn() },
  platformCredentialService: {
    findDecryptedThreadsByClientId: threadsFindDecryptedByClientId,
    findDecryptedPlatform: vi.fn(),
    findDecryptedForUser: vi.fn(),
  },
  tenantService: { findById: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: vi.fn() },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  inboxStatuses: { enum: { disconnected: "disconnected" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: {},
}))

vi.mock("@/env", () => ({
  isCloud: vi.fn(() => false),
}))

vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId: vi.fn(),
}))

vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId: vi.fn(),
}))

vi.mock("@/integration", () => ({
  integrations: {
    threads: { name: "threads", handleRequest: threadsHandleRequest },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: loggerDebug, error: loggerError, info: loggerInfo },
}))

vi.mock("@/lib/oauth-broker", () => ({
  isBrokerHost: () => false,
}))

const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const asNextRequest = (url: string, body?: string) => {
  const request = new Request(url, body ? { method: "POST", body } : undefined)
  return Object.assign(request, { nextUrl: new URL(url) }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  threadsFindDecryptedByClientId.mockResolvedValue({
    config: {
      clientId: "app-1",
      clientSecret: "secret-1",
      verifyToken: "verify-1",
      version: "v1.0",
    },
  })
  threadsHandleRequest.mockResolvedValue("ok")
})

describe("threads webhook routing", () => {
  const request = () =>
    asNextRequest(
      "http://localhost/integrations/threads/webhook?appId=app-1&workspaceId=ws-1",
      JSON.stringify({ app_id: "app-1", topic: "moderate" }),
    )

  test("selects the app-specific credential instead of the platform-global default", async () => {
    await handleWebhook("threads", request())

    expect(threadsFindDecryptedByClientId).toHaveBeenCalledWith({
      clientId: "app-1",
    })
    expect(threadsHandleRequest).toHaveBeenCalledOnce()
    expect(loggerInfo).not.toHaveBeenCalledWith(
      expect.anything(),
      "Webhook request body",
    )
  })

  test("returns 404 when appId is missing", async () => {
    const response = await handleWebhook(
      "threads",
      asNextRequest("http://localhost/integrations/threads/webhook"),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      message: "Integration is not configured",
    })
    expect(threadsFindDecryptedByClientId).not.toHaveBeenCalled()
  })

  test("returns 404 when the appId does not resolve to a configured credential", async () => {
    threadsFindDecryptedByClientId.mockResolvedValueOnce(undefined)

    const response = await handleWebhook("threads", request())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      message: "Integration is not configured",
    })
    expect(loggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "app-1",
        integrationType: "threads",
      }),
      "No configured Threads credential for webhook appId",
    )
  })

  test("sanitizes secrets in logs and returns a generic client-facing error", async () => {
    threadsHandleRequest.mockRejectedValueOnce(
      new Error(
        "request failed https://graph.threads.com/v1.0/replies?access_token=super-secret&client_secret=ultra-secret",
      ),
    )

    const response = await handleWebhook("threads", request())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      message: "Failed to process Threads webhook",
    })
    const [payload] = loggerError.mock.calls[0] ?? []
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining("[REDACTED]"),
        }),
        integrationType: "threads",
        status: 500,
      }),
      "Threads handleRequest failed",
    )
    expect(JSON.stringify(payload)).not.toContain("super-secret")
    expect(JSON.stringify(payload)).not.toContain("ultra-secret")
  })

  test("preserves 400 for invalid verification or signature-style webhook errors", async () => {
    threadsHandleRequest.mockRejectedValueOnce(
      new Error("Invalid webhook signature"),
    )

    const response = await handleWebhook("threads", request())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      message: "Invalid Threads webhook request",
    })
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Invalid webhook signature",
        }),
        integrationType: "threads",
        status: 400,
      }),
      "Threads handleRequest failed",
    )
  })
})
