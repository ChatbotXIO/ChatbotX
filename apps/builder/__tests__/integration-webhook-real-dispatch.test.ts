// @vitest-environment node

import { createHmac } from "node:crypto"
import type * as MessengerIntegration from "@chatbotx.io/integration-messenger"
import type * as TiktokIntegration from "@chatbotx.io/integration-tiktok"
import type * as WhatsappIntegration from "@chatbotx.io/integration-whatsapp"
import { beforeEach, describe, expect, test, vi } from "vitest"

const COEXIST_JOB_ID = /^wa-coexist-phone-1-/

const findDecryptedForWebhook = vi.fn()
const findIntegrationTiktokByOpenId = vi.fn()
const findOwnerUserIdByWorkspaceId = vi.fn()
const integrationQueueAdd = vi.fn()
const identifyInboxAndIntegrationAuthFromIdentifier = vi.fn()
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
    identifyInboxAndIntegrationAuthFromIdentifier,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    providerAccountEvent: "providerAccountEvent",
    messageStatus: "messageStatus",
  },
  enqueueIntegrationJob: (job: { type: string }, options: unknown) =>
    integrationQueueAdd(job.type, job, options),
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
  const [messenger, tiktok, whatsapp] = await Promise.all([
    vi.importActual<typeof MessengerIntegration>(
      "@chatbotx.io/integration-messenger",
    ),
    vi.importActual<typeof TiktokIntegration>(
      "@chatbotx.io/integration-tiktok",
    ),
    vi.importActual<typeof WhatsappIntegration>(
      "@chatbotx.io/integration-whatsapp",
    ),
  ])

  return {
    integrations: {
      messenger: messenger.integration,
      tiktok: tiktok.integration,
      whatsapp: whatsapp.integration,
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
    identifyInboxAndIntegrationAuthFromIdentifier.mockResolvedValue({
      inbox: { workspaceId: "workspace-1" },
    })
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
  describe("coexistence webhooks through the credential-scoped WhatsApp route", () => {
    const dispatchChange = async (
      field: string,
      value: Record<string, unknown>,
    ) => {
      const clientSecret = "whatsapp-secret"
      const body = JSON.stringify({
        entry: [
          {
            changes: [
              {
                field,
                value: { ...value, metadata: { phone_number_id: "phone-1" } },
              },
            ],
          },
        ],
        object: "whatsapp_business_account",
      })
      const signature = createHmac("sha256", clientSecret)
        .update(body)
        .digest("hex")

      findDecryptedForWebhook.mockResolvedValue({
        config: {
          clientId: "whatsapp-app",
          clientSecret,
          verifyToken: "verify-token",
        },
        userId: "owner-1",
      })

      const response = await handleWebhook(
        "whatsapp",
        asNextRequest(
          "https://broker.test/integrations/whatsapp/webhook/c/credential-1",
          body,
          { "X-Hub-Signature-256": `sha256=${signature}` },
        ),
        "credential-1",
      )

      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe("ok")
    }

    const dispatchEcho = (echo: Record<string, unknown>) =>
      dispatchChange("smb_message_echoes", { message_echoes: [echo] })

    test("dispatches a history payload to the coexistence history buffer", async () => {
      await dispatchChange("history", { history: [{ dummy: true }] })

      expect(
        identifyInboxAndIntegrationAuthFromIdentifier,
      ).toHaveBeenCalledWith("whatsapp", "phone-1")
      expect(integrationQueueAdd).toHaveBeenCalledWith(
        "coexistWhatsappBuffer",
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumberId: "phone-1" }),
          type: "coexistWhatsappBuffer",
        }),
        expect.objectContaining({
          jobId: expect.stringMatching(COEXIST_JOB_ID),
        }),
      )
    })

    test("dispatches an edit echo as a live updateIncomingMessage job", async () => {
      await dispatchEcho({
        id: "wamid.edit-1",
        to: "16505551234",
        to_user_id: "US.1",
        type: "edit",
        edit: {
          original_message_id: "wamid.original",
          message: { type: "text", text: { body: "fixed" } },
        },
      })

      expect(integrationQueueAdd).toHaveBeenCalledWith(
        "updateIncomingMessage",
        expect.objectContaining({
          type: "updateIncomingMessage",
          data: expect.objectContaining({
            integrationIdentifier: "phone-1",
            messageId: "wamid.original",
            newText: "fixed",
            retryIfMissing: true,
          }),
        }),
        expect.objectContaining({
          jobId: "wa-smb-edit-phone-1-wamid.edit-1",
          attempts: 6,
        }),
      )
      expect(integrationQueueAdd).not.toHaveBeenCalledWith(
        "coexistWhatsappBuffer",
        expect.anything(),
        expect.anything(),
      )
    })

    test("dispatches a revoke echo as a live deleteIncomingMessage job", async () => {
      await dispatchEcho({
        id: "wamid.revoke-1",
        type: "revoke",
        revoke: { original_message_id: "wamid.original" },
      })

      expect(integrationQueueAdd).toHaveBeenCalledWith(
        "deleteIncomingMessage",
        expect.objectContaining({
          type: "deleteIncomingMessage",
          data: expect.objectContaining({
            messageId: "wamid.original",
            retryIfMissing: true,
          }),
        }),
        expect.objectContaining({
          jobId: "wa-smb-revoke-phone-1-wamid.revoke-1",
        }),
      )
    })

    test("dispatches a message the business sent as a live incomingMessageEcho job", async () => {
      await dispatchEcho({
        id: "wamid.echo-2",
        to: "16505551234",
        to_user_id: "US.1",
        type: "text",
        text: { body: "hi" },
      })

      expect(integrationQueueAdd).toHaveBeenCalledWith(
        "incomingMessageEcho",
        expect.objectContaining({
          type: "incomingMessageEcho",
          data: expect.objectContaining({
            integrationType: "whatsapp",
            integrationIdentifier: "phone-1",
            payload: expect.objectContaining({ kind: "smbMessageEcho" }),
          }),
        }),
        expect.objectContaining({
          jobId: "wa-smb-message-phone-1-wamid.echo-2",
          attempts: 5,
        }),
      )
      expect(integrationQueueAdd).not.toHaveBeenCalledWith(
        "coexistWhatsappBuffer",
        expect.anything(),
        expect.anything(),
      )
    })
  })
})
