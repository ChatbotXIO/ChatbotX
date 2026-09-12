// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const {
  findByMock,
  findInboxMock,
  findByInboxIdForWorkspaceMock,
  createPendingOutboundMock,
  getCallPermissionsMock,
} = vi.hoisted(() => ({
  findByMock: vi.fn(),
  findInboxMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  createPendingOutboundMock: vi.fn(),
  getCallPermissionsMock: vi.fn(),
}))

class PendingOutboundExistsError extends Error {}

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/env", () => ({
  env: {
    FS_NODES: undefined,
    FS_SIP_DOMAIN: "sip.example.com",
    FS_WSS_URL: "wss://sip.example.com",
    TURN_URL: "turn:sip.example.com",
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findBy: findByMock },
  contactInboxService: { findBy: findInboxMock },
  parseFreeswitchNodes: (json: string | undefined, fallback: unknown) =>
    json ? JSON.parse(json) : { default: fallback },
  resolveFreeswitchNode: (
    nodes: Record<string, { sipDomain: string }>,
    id: string,
  ) => nodes[id],
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findByInboxIdForWorkspaceMock,
  },
  whatsappCallRepository: { createPendingOutbound: createPendingOutboundMock },
  WhatsappCallPendingOutboundExistsError: PendingOutboundExistsError,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallPermissions: getCallPermissionsMock,
  canPerformCallAction: (
    response: { actions: { action_name: string; can_perform: boolean }[] },
    name: string,
  ) =>
    response.actions.find((a) => a.action_name === name)?.can_perform === true,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { startWhatsappCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/start-call.action"
)
const action = startWhatsappCallAction as unknown as ActionHandler

const call = (conversationId = "conversation-1") =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { conversationId },
  })

describe("startWhatsappCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByMock.mockResolvedValue({
      id: "conversation-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
    })
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "+15551234567",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      sipProvisioningStatus: "enabled",
      sipNodeId: "default",
      displayPhoneNumber: "+1 555 000 1111",
    })
    getCallPermissionsMock.mockResolvedValue({
      messaging_product: "whatsapp",
      permission: { status: "permanent" },
      actions: [{ action_name: "start_call", can_perform: true }],
    })
    createPendingOutboundMock.mockResolvedValue({ id: "call-1" })
  })

  test("throws when calling permission is denied", async () => {
    getCallPermissionsMock.mockResolvedValue({
      messaging_product: "whatsapp",
      permission: { status: "no_permission" },
      actions: [{ action_name: "start_call", can_perform: false }],
    })
    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.noCallPermission",
    )
    expect(createPendingOutboundMock).not.toHaveBeenCalled()
  })

  test("refuses when the BUSINESS number is +84 (BIC unavailable in Vietnam)", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      sipProvisioningStatus: "enabled",
      sipNodeId: "default",
      displayPhoneNumber: "+84 912 345 678",
    })
    await expect(call()).rejects.toThrow("whatsapp.calls.errors.bicUnavailable")
    expect(getCallPermissionsMock).not.toHaveBeenCalled()
  })

  test("a Vietnamese CONTACT number is still callable from a supported business number", async () => {
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "+84912345678",
    })
    await call()
    expect(getCallPermissionsMock).toHaveBeenCalled()
    expect(createPendingOutboundMock).toHaveBeenCalled()
  })

  test("maps a duplicate pending outbound to a localized error", async () => {
    createPendingOutboundMock.mockRejectedValue(
      new PendingOutboundExistsError("contact-inbox-1"),
    )
    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.callAlreadyInProgress",
    )
  })

  test("refuses when SIP calling is not enabled for the integration", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      sipProvisioningStatus: "provisioned",
      sipNodeId: "default",
    })
    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.inAppCallingUnavailable",
    )
  })

  test("on success returns the dial uri built from the node domain and inserts the row before dialing", async () => {
    const result = await call()

    expect(createPendingOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        callId: "call-1",
        dialUri: "sip:+15551234567@sip.example.com",
      }),
    )
  })
})
