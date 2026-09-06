// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { reconnectWhatsappAction } from "../src/features/integration-whatsapp/actions/reconnect.action"

type ReconnectWhatsappActionArgs = {
  bindArgsParsedInputs: readonly [string, string]
  ctx: { workspace: { id: string; ownerId: string } }
  parsedInput: { code: string }
}

type ReconnectWhatsappActionHandler = (
  args: ReconnectWhatsappActionArgs,
) => Promise<unknown>

const {
  exchangeAccessTokenMock,
  findWabaMock,
  findWorkspaceIntegrationMock,
  getCurrentUserAndTargetWorkspaceMock,
  getSharedWabaIdsMock,
  hasWhatsappCapiScopeMock,
  listPhoneNumbersMock,
  platformCredentialResolveMock,
  replaceAuthMock,
  subscribeWebhookMock,
} = vi.hoisted(() => ({
  exchangeAccessTokenMock: vi.fn(),
  findWabaMock: vi.fn(),
  findWorkspaceIntegrationMock: vi.fn(),
  getCurrentUserAndTargetWorkspaceMock: vi.fn(),
  getSharedWabaIdsMock: vi.fn(),
  hasWhatsappCapiScopeMock: vi.fn(),
  listPhoneNumbersMock: vi.fn(),
  platformCredentialResolveMock: vi.fn(),
  replaceAuthMock: vi.fn(),
  subscribeWebhookMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: ReconnectWhatsappActionHandler) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: getCurrentUserAndTargetWorkspaceMock,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example.com${path}`,
  getBrokerOrigin: () => "https://broker.example.com",
}))

vi.mock("@/features/integration-whatsapp/libs/capi-scope", () => ({
  hasWhatsappCapiScope: hasWhatsappCapiScopeMock,
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    findWorkspaceIntegration: findWorkspaceIntegrationMock,
    replaceAuth: replaceAuthMock,
  },
  platformCredentialService: {
    resolveForOwner: platformCredentialResolveMock,
  },
  WHATSAPP_CAPI_SCOPE: "whatsapp_business_manage_events",
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  exchangeAccessToken: exchangeAccessTokenMock,
  getSharedWabaIds: getSharedWabaIdsMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  listPhoneNumbers: listPhoneNumbersMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba", () => ({
  findWaba: findWabaMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/webhook", () => ({
  subscribeWebhook: subscribeWebhookMock,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

const callReconnectWhatsappAction =
  reconnectWhatsappAction as unknown as ReconnectWhatsappActionHandler

describe("reconnectWhatsappAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exchangeAccessTokenMock.mockResolvedValue({
      access_token: "access-token-1",
    })
    findWabaMock.mockResolvedValue({
      id: "waba-1",
      owner_business_info: { id: "business-1" },
    })
    findWorkspaceIntegrationMock.mockResolvedValue({
      id: "iw-1",
      wabaId: "waba-1",
      phoneNumberId: "phone-number-1",
      businessId: "business-1",
    })
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    getSharedWabaIdsMock.mockResolvedValue(["waba-1"])
    hasWhatsappCapiScopeMock.mockResolvedValue(true)
    listPhoneNumbersMock.mockResolvedValue({
      data: [
        {
          id: "phone-number-1",
          display_phone_number: "+15550001111",
        },
      ],
    })
    platformCredentialResolveMock.mockResolvedValue({
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        verifyToken: "verify-token-1",
        version: "v23.0",
      },
    })
    replaceAuthMock.mockResolvedValue(undefined)
    subscribeWebhookMock.mockResolvedValue(undefined)
  })

  test("rejects non-super-admin members before reconnecting WhatsApp auth", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: false,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })

    await expect(
      callReconnectWhatsappAction({
        bindArgsParsedInputs: ["ws-1", "iw-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: { code: "oauth-code-1" },
      }),
    ).rejects.toThrow("errors.superAdminRequired")

    expect(findWorkspaceIntegrationMock).not.toHaveBeenCalled()
    expect(platformCredentialResolveMock).not.toHaveBeenCalled()
    expect(exchangeAccessTokenMock).not.toHaveBeenCalled()
    expect(replaceAuthMock).not.toHaveBeenCalled()
    expect(subscribeWebhookMock).not.toHaveBeenCalled()
  })

  test("accepts the reconnect when the existing WABA is not first in the token's target list", async () => {
    // Meta returns every WABA shared with the app and does not keep the order
    // stable between tokens, so matching on the first entry made reconnect
    // fail at random for businesses with several WABAs.
    getSharedWabaIdsMock.mockResolvedValue(["waba-9", "waba-1", "waba-5"])

    await callReconnectWhatsappAction({
      bindArgsParsedInputs: ["ws-1", "iw-1"],
      ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
      parsedInput: { code: "oauth-code" },
    })

    expect(replaceAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          metadata: expect.objectContaining({ wabaId: "waba-1" }),
        }),
      }),
    )
    expect(findWabaMock).toHaveBeenCalledWith(
      expect.objectContaining({ wabaId: "waba-1" }),
    )
  })

  test("rejects the reconnect when the token does not cover the existing WABA", async () => {
    getSharedWabaIdsMock.mockResolvedValue(["waba-9", "waba-5"])

    await expect(
      callReconnectWhatsappAction({
        bindArgsParsedInputs: ["ws-1", "iw-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: { code: "oauth-code" },
      }),
    ).rejects.toThrow("whatsapp.reconnect.errors.wabaMismatch")
    expect(replaceAuthMock).not.toHaveBeenCalled()
  })

  test("resubscribes with automatic_events during ads reconnect", async () => {
    await callReconnectWhatsappAction({
      bindArgsParsedInputs: ["ws-1", "iw-1"],
      ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
      parsedInput: { code: "oauth-code-1" },
    })

    expect(subscribeWebhookMock).toHaveBeenCalledWith({
      auth: expect.objectContaining({
        metadata: expect.objectContaining({ wabaId: "waba-1" }),
      }),
      includeAutomaticEvents: true,
    })
  })
})
