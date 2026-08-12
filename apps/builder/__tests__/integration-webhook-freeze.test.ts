// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const getAccessState = vi.fn()
const workspaceFind = vi.fn()
const findIntegrationTelegramByBotId = vi.fn()
const findIntegrationTiktokByOpenId = vi.fn()
const telegramHandleRequest = vi.fn()
const threadsFindDecryptedByClientId = vi.fn()
const threadsHandleRequest = vi.fn()
const tiktokHandleRequest = vi.fn()
const loggerInfo = vi.fn()
const loggerDebug = vi.fn()
const loggerError = vi.fn()

vi.mock("@chatbotx.io/business", async () => {
  const { resolveWorkspaceFreezeReason } = await import(
    "@chatbotx.io/business/workspace-lifecycle/predicates"
  )
  return {
    customDomainService: { findActiveByDomain: vi.fn() },
    platformCredentialService: {
      findDecryptedThreadsByClientId: threadsFindDecryptedByClientId,
      findDecryptedPlatform: vi.fn(),
      findDecryptedForUser: vi.fn(),
    },
    resolveWorkspaceFreezeReason,
    tenantService: { findById: vi.fn() },
    userQuotaService: { getAccessState },
    workspaceService: { find: workspaceFind },
  }
})

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

const isCloud = vi.fn(() => false)
vi.mock("@/env", () => ({
  isCloud,
}))

vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId,
}))

vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId,
}))

vi.mock("@/integration", () => ({
  integrations: {
    telegram: { name: "telegram", handleRequest: telegramHandleRequest },
    threads: { name: "threads", handleRequest: threadsHandleRequest },
    tiktok: { name: "tiktok", handleRequest: tiktokHandleRequest },
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

const liveWorkspace = {
  id: "workspace-1",
  ownerId: "owner-1",
  scheduledDeletionAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  isCloud.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  workspaceFind.mockResolvedValue(liveWorkspace)
  telegramHandleRequest.mockResolvedValue("ok")
  threadsFindDecryptedByClientId.mockResolvedValue({
    config: {
      clientId: "app-1",
      clientSecret: "secret-1",
      verifyToken: "verify-1",
      version: "v1.0",
    },
  })
  threadsHandleRequest.mockResolvedValue("ok")
  tiktokHandleRequest.mockResolvedValue("ok")
  findIntegrationTelegramByBotId.mockResolvedValue({
    auth: { secretText: "secret", metadata: { webhookSecretToken: "token" } },
    botId: "bot-1",
    workspaceId: "workspace-1",
  })
  findIntegrationTiktokByOpenId.mockResolvedValue({
    auth: { clientId: "id", clientSecret: "secret", redirectUrl: "https://x" },
    inboxId: "inbox-1",
    openId: "open-1",
    workspaceId: "workspace-1",
  })
})

describe("telegram webhook freeze", () => {
  const request = () =>
    asNextRequest("http://localhost/integrations/telegram?botId=bot-1")

  test("forwards the update to the integration for a live workspace", async () => {
    await handleWebhook("telegram", request())

    expect(telegramHandleRequest).toHaveBeenCalledOnce()
  })

  test("skips the update when the workspace is scheduled for deletion", async () => {
    workspaceFind.mockResolvedValue({
      ...liveWorkspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })

    const response = await handleWebhook("telegram", request())

    expect(await response.text()).toBe("ok")
    expect(telegramHandleRequest).not.toHaveBeenCalled()
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ freezeReason: "scheduledForDeletion" }),
      "webhook skipped: frozen workspace",
    )
  })

  test("skips the update when the owner entitlement is blocked on cloud", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({ blocked: true })

    const response = await handleWebhook("telegram", request())

    expect(await response.text()).toBe("ok")
    expect(telegramHandleRequest).not.toHaveBeenCalled()
  })

  test("off cloud, never consults owner entitlements (mirrors withBlockedOwnerGuard)", async () => {
    isCloud.mockReturnValue(false)
    getAccessState.mockResolvedValue({ blocked: true })

    await handleWebhook("telegram", request())

    expect(telegramHandleRequest).toHaveBeenCalledOnce()
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("skips the update when the workspace row no longer exists", async () => {
    workspaceFind.mockResolvedValue(undefined)

    const response = await handleWebhook("telegram", request())

    expect(await response.text()).toBe("ok")
    expect(telegramHandleRequest).not.toHaveBeenCalled()
  })
})

describe("tiktok webhook freeze", () => {
  const request = () =>
    asNextRequest(
      "http://localhost/integrations/tiktok",
      JSON.stringify({ user_openid: "open-1", event: "comment" }),
    )

  test("forwards the event to the integration for a live workspace", async () => {
    await handleWebhook("tiktok", request())

    expect(tiktokHandleRequest).toHaveBeenCalledOnce()
  })

  test("skips the event when the workspace is scheduled for deletion", async () => {
    workspaceFind.mockResolvedValue({
      ...liveWorkspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })

    const response = await handleWebhook("tiktok", request())

    expect(await response.text()).toBe("ok")
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })

  test("skips the event when the workspace row no longer exists", async () => {
    workspaceFind.mockResolvedValue(undefined)

    const response = await handleWebhook("tiktok", request())

    expect(await response.text()).toBe("ok")
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })
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
