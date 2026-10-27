// @vitest-environment node

import { createHmac } from "node:crypto"
import type * as MessengerIntegration from "@chatbotx.io/integration-messenger"
import type * as TiktokIntegration from "@chatbotx.io/integration-tiktok"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findDecryptedForWebhook = vi.fn()
const findIntegrationTiktokByOpenId = vi.fn()
const findOwnerUserIdByWorkspaceId = vi.fn()
const integrationQueueAdd = vi.fn()
const isCloud = vi.fn(() => true)

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    markLegacyInboxUnhealthy: vi.fn(),
    markUnhealthyByIdentifier: vi.fn(),
  },
  customDomainService: { findActiveByDomain: vi.fn() },
  platformCredentialService: {
    findDecryptedForWebhook,
    findDecryptedPlatform: vi.fn(),
    findDecryptedForUser: vi.fn(),
  },
  tenantService: { findById: vi.fn() },
  workspaceMemberService: { findOwnerUserIdByWorkspaceId },
}))

vi.mock("@chatbotx.io/channel-registry/registry", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: { add: integrationQueueAdd },
}))

vi.mock("@/env", () => ({ isCloud }))
vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId: vi.fn(),
}))
vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId,
}))
vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("@/lib/oauth-broker", () => ({ isBrokerHost: () => false }))
vi.mock("@/lib/webhook-log", () => ({
  logWebhookRequestBody: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/integration", async () => {
  const [messenger, tiktok] = await Promise.all([
    vi.importActual<typeof MessengerIntegration>(
      "@chatbotx.io/integration-messenger",
    ),
    vi.importActual<typeof TiktokIntegration>(
      "@chatbotx.io/integration-tiktok",
    ),
  ])

  return {
    integrations: {
      messenger: messenger.integration,
      tiktok: tiktok.integration,
    },
  }
})

const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const asNextRequest = (url: string, body?: string, headers?: HeadersInit) => {
  const request = new Request(
    url,
    body ? { body, headers, method: "POST" } : { headers },
  )
  return Object.assign(request, { nextUrl: new URL(url) }) as never
}

describe("credential-scoped webhook real dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCloud.mockReturnValue(true)
    findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")
  })

  test("echoes Meta's verification challenge through the real Messenger dispatcher", async () => {
    findDecryptedForWebhook.mockResolvedValue({
      config: {
        clientId: "messenger-app",
        clientSecret: "secret",
        verifyToken: "verify-token",
      },
      userId: "owner-1",
    })

    const response = await handleWebhook(
      "messenger",
      asNextRequest(
        "https://broker.test/integrations/messenger/webhook/c/credential-1?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-1",
      ),
      "credential-1",
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe("challenge-1")
  })

  test("dispatches a signed TikTok message through its real webhook handler", async () => {
    const clientSecret = "tiktok-secret"
    const body = JSON.stringify({
      client_key: "client-key",
      content: '{"message":"hello"}',
      create_time: 1_700_000_000,
      event: "im_receive_msg",
      user_openid: "open-1",
    })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = createHmac("sha256", clientSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex")

    findDecryptedForWebhook.mockResolvedValue({
      config: { clientId: "tiktok-app", clientSecret },
      userId: "owner-1",
    })
    findIntegrationTiktokByOpenId.mockResolvedValue({
      auth: {
        clientId: "tiktok-app",
        clientSecret,
        redirectUrl: "https://broker.test/integrations/tiktok/callback",
      },
      inboxId: "inbox-1",
      openId: "open-1",
      workspaceId: "workspace-1",
    })

    const response = await handleWebhook(
      "tiktok",
      asNextRequest(
        "https://broker.test/integrations/tiktok/webhook/c/credential-1",
        body,
        { "TikTok-Signature": `t=${timestamp},s=${signature}` },
      ),
      "credential-1",
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe("ok")
    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          integrationIdentifier: "open-1",
          integrationType: "tiktok",
        }),
      }),
      undefined,
    )
  })
})
