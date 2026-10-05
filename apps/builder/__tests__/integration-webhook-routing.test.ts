// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const findIntegrationTelegramByBotId = vi.fn()
const findIntegrationTiktokByOpenId = vi.fn()
const telegramHandleRequest = vi.fn()
const tiktokHandleRequest = vi.fn()
const markUnhealthyByIdentifier = vi.fn()
const markLegacyInboxUnhealthy = vi.fn()
const findOwnerUserIdByWorkspaceId = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    markUnhealthyByIdentifier,
    markLegacyInboxUnhealthy,
  },
  workspaceMemberService: { findOwnerUserIdByWorkspaceId },
  customDomainService: { findActiveByDomain: vi.fn() },
  platformCredentialService: {
    findDecryptedForUser: vi.fn(),
    findDecryptedPlatform: vi.fn(),
  },
  tenantService: { findById: vi.fn() },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: {},
}))

vi.mock("@/env", () => ({
  isCloud: vi.fn(() => false),
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
    tiktok: { name: "tiktok", handleRequest: tiktokHandleRequest },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/oauth-broker", () => ({
  isBrokerHost: () => false,
}))

// Dynamic import: loads the module under test only after every `vi.mock`
// above has registered, matching the convention used by the sibling
// freeze/webhook-log tests in this directory.
const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const asNextRequest = (url: string, body?: string) => {
  const request = new Request(url, body ? { method: "POST", body } : undefined)
  return Object.assign(request, { nextUrl: new URL(url) }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  telegramHandleRequest.mockResolvedValue("ok")
  tiktokHandleRequest.mockResolvedValue("ok")
  findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")
})

// These cover the route-level HTTP contract for the Telegram and TikTok
// branches of `handleWebhook`: entrypoint resolution, 400/404 short-circuits,
// and the shape of the config forwarded to the integration's `handleRequest`.
// Freeze/worker-guard behavior is covered separately — see
// `packages/business/__tests__/with-blocked-owner-guard.test.ts` and
// `apps/worker/__tests__/resolve-workspace-id.test.ts` — this file no longer
// needs to mock the freeze check because the route stopped calling it.
describe("telegram webhook routing", () => {
  test("400s when the botId query param is missing", async () => {
    const response = await handleWebhook(
      "telegram",
      asNextRequest("http://localhost/integrations/telegram"),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      message: "Missing botId query param",
    })
    expect(telegramHandleRequest).not.toHaveBeenCalled()
  })

  test("404s when no bot is registered for the botId", async () => {
    findIntegrationTelegramByBotId.mockResolvedValue(undefined)

    const response = await handleWebhook(
      "telegram",
      asNextRequest("http://localhost/integrations/telegram?botId=bot-1"),
    )

    expect(response.status).toBe(404)
    expect(telegramHandleRequest).not.toHaveBeenCalled()
  })

  test("forwards the resolved botId and webhookSecretToken as config", async () => {
    findIntegrationTelegramByBotId.mockResolvedValue({
      auth: {
        metadata: { webhookSecretToken: "expected-token" },
        secretText: "secret",
      },
      botId: "bot-1",
      workspaceId: "workspace-1",
    })

    await handleWebhook(
      "telegram",
      asNextRequest("http://localhost/integrations/telegram?botId=bot-1"),
    )

    expect(telegramHandleRequest).toHaveBeenCalledOnce()
    const props = telegramHandleRequest.mock.calls[0]?.[0]
    expect(props.config).toEqual(
      expect.objectContaining({
        botId: "bot-1",
        webhookSecretToken: "expected-token",
      }),
    )
  })
})

describe("tiktok webhook routing", () => {
  test("400s on an empty body", async () => {
    const response = await handleWebhook(
      "tiktok",
      asNextRequest("http://localhost/integrations/tiktok", ""),
    )

    expect(response.status).toBe(400)
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })

  test("400s when user_openid is missing from the payload", async () => {
    const response = await handleWebhook(
      "tiktok",
      asNextRequest(
        "http://localhost/integrations/tiktok",
        JSON.stringify({ event: "im_receive_msg" }),
      ),
    )

    expect(response.status).toBe(400)
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })

  test("404s when no account is registered for the open id", async () => {
    findIntegrationTiktokByOpenId.mockResolvedValue(undefined)

    const response = await handleWebhook(
      "tiktok",
      asNextRequest(
        "http://localhost/integrations/tiktok",
        JSON.stringify({ event: "im_receive_msg", user_openid: "open-1" }),
      ),
    )

    expect(response.status).toBe(404)
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })

  test("routes authorization.removed to connectionStateService.markUnhealthyByIdentifier with the resolved workspace owner (regression: previously 500'd with no ownerId)", async () => {
    findIntegrationTiktokByOpenId.mockResolvedValue({
      auth: {
        clientId: "id",
        clientSecret: "secret",
        redirectUrl: "https://x",
      },
      inboxId: "inbox-1",
      openId: "open-1",
      workspaceId: "workspace-1",
    })

    markUnhealthyByIdentifier.mockResolvedValueOnce({ id: "conn-1" })
    const response = await handleWebhook(
      "tiktok",
      asNextRequest(
        "http://localhost/integrations/tiktok",
        JSON.stringify({
          event: "authorization.removed",
          user_openid: "open-1",
        }),
      ),
    )

    expect(await response.text()).toBe("ok")
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
    expect(findOwnerUserIdByWorkspaceId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(markUnhealthyByIdentifier).toHaveBeenCalledWith({
      provider: "tiktok",
      identifier: "open-1",
      reason: "token_revoked",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
    })
  })

  test("falls back to connectionStateService.markLegacyInboxUnhealthy when no Connection row matches (regression: avoid double-releasing channels quota via inboxService.disconnect)", async () => {
    findIntegrationTiktokByOpenId.mockResolvedValue({
      auth: {
        clientId: "id",
        clientSecret: "secret",
        redirectUrl: "https://x",
      },
      inboxId: "inbox-1",
      openId: "open-1",
      workspaceId: "workspace-1",
    })

    markUnhealthyByIdentifier.mockResolvedValueOnce(null)
    const response = await handleWebhook(
      "tiktok",
      asNextRequest(
        "http://localhost/integrations/tiktok",
        JSON.stringify({
          event: "authorization.removed",
          user_openid: "open-1",
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok")
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
    expect(markLegacyInboxUnhealthy).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "workspace-1",
      reason: "token_revoked",
    })
  })
})
