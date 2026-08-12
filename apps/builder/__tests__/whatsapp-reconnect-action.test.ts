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
  findWorkspaceIntegrationMock,
  getCurrentUserAndTargetWorkspaceMock,
  getSharedWabaIdMock,
  hasWhatsappCapiScopeMock,
  listPhoneNumbersMock,
  platformCredentialResolveMock,
  replaceAuthMock,
  subscribeWebhookMock,
} = vi.hoisted(() => ({
  exchangeAccessTokenMock: vi.fn(),
  findWorkspaceIntegrationMock: vi.fn(),
  getCurrentUserAndTargetWorkspaceMock: vi.fn(),
  getSharedWabaIdMock: vi.fn(),
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
  getSharedWabaId: getSharedWabaIdMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  listPhoneNumbers: listPhoneNumbersMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba", () => ({
  findWaba: vi.fn(),
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
})
